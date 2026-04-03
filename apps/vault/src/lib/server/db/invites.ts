// Invite database operations for member invitation system

import { createOrgId, type OrgId } from '@polyphony/shared';
import type { Role, Voice, Section } from '$lib/types';
import { generateId } from '$lib/server/utils/id';
import { addMemberRoles } from './roles';

export interface Invite {
	id: string;
	orgId: OrgId;
	roster_member_id: string; // Links to roster member
	roster_member_name: string; // For display (from JOIN)
	token: string;
	invited_by: string;
	expires_at: string;
	roles: Role[]; // Roles to assign upon acceptance (from junction table)
	voices: Voice[]; // Inherited from roster member (display only)
	sections: Section[]; // Inherited from roster member (display only)
	created_at: string;
}

export interface CreateInviteInput {
	orgId: OrgId; // Required: which organization
	rosterMemberId: string; // Required: which roster member to invite
	roles: Role[]; // Roles to grant upon acceptance
	invited_by: string;
	emailHint?: string; // Optional: suggested email for Registry
}

export interface AcceptInviteResult {
	success: boolean;
	memberId?: string;
	error?: string;
}

// Token expiry in hours
const INVITE_EXPIRY_HOURS = 48;

// Generate secure random token
function generateToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes)
		.map(b => b.toString(16).padStart(2, '0'))
		.join('');
}

/**
 * Create a new invite linked to a roster member
 */
/**
 * Validate roster member for invitation and return the member
 */
async function validateRosterMemberForInvite(
	db: D1Database,
	rosterMemberId: string,
	orgId: OrgId
): Promise<{ name: string }> {
	const { getMemberById } = await import('./members');
	const rosterMember = await getMemberById(db, rosterMemberId, orgId);
	
	if (!rosterMember) {
		throw new Error('Roster member not found');
	}

	if (rosterMember.email_id) {
		throw new Error('Member is already registered');
	}

	// Check for existing pending invite (non-expired)
	const existingInvite = await db
		.prepare('SELECT id FROM invites WHERE roster_member_id = ? AND expires_at > datetime("now")')
		.bind(rosterMemberId)
		.first();
	
	if (existingInvite) {
		throw new Error('Member already has a pending invitation');
	}

	return { name: rosterMember.name };
}

/**
 * Create a new invite for a roster-only member
 */
export async function createInvite(
	db: D1Database,
	input: CreateInviteInput
): Promise<Invite> {
	// Validate roster member and get their name
	const { name } = await validateRosterMemberForInvite(db, input.rosterMemberId, input.orgId);

	// Create invite linked to roster member
	const id = generateId();
	const token = generateToken();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

	// Include name for backward compatibility with existing schema
	await db
		.prepare(
			`INSERT INTO invites (id, org_id, roster_member_id, name, token, invited_by, expires_at, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
		)
		.bind(
			id,
			input.orgId,
			input.rosterMemberId,
			name,
			token,
			input.invited_by,
			expiresAt.toISOString(),
			now.toISOString()
		)
		.run();

	const invite = await getInviteById(db, id);
	if (!invite) {
		throw new Error('Failed to create invite');
	}
	return invite;
}

/**
 * Helper to load roster member, voices, and sections for an invite
 * Note: Remote DB doesn't have roles column or invite_roles table
 */
async function loadInviteRelations(
	db: D1Database,
	inviteRow: Omit<Invite, 'roles' | 'voices' | 'sections' | 'roster_member_name'>
): Promise<Invite> {
	// Note: Remote DB doesn't have invite_roles junction table yet
	// For now, default to empty roles array
	const roles: Role[] = [];

	// Get roster member to load name, voices, and sections
	const { getMemberById } = await import('./members');
	const rosterMember = await getMemberById(db, inviteRow.roster_member_id, inviteRow.orgId);
	
	// Handle missing roster member
	const memberName = rosterMember?.name ?? 'Unknown Member';
	const memberVoices = rosterMember?.voices ?? [];
	const memberSections = rosterMember?.sections ?? [];

	return {
		...inviteRow,
		roster_member_name: memberName,
		roles,
		voices: memberVoices,
		sections: memberSections
	};
}

/**
 * Find an invite by token
 */
export async function getInviteByToken(
	db: D1Database,
	token: string
): Promise<Invite | null> {
	const row = await db
		.prepare(
			`SELECT id, org_id, roster_member_id, token, invited_by, expires_at, created_at
			 FROM invites WHERE token = ?`
		)
		.bind(token)
		.first<{ id: string; org_id: string; roster_member_id: string; token: string; invited_by: string; expires_at: string; created_at: string }>();

	if (!row) return null;

	return await loadInviteRelations(db, {
		...row,
		orgId: createOrgId(row.org_id)
	});
}

/**
 * Find invite by ID
 */
export async function getInviteById(
	db: D1Database,
	inviteId: string
): Promise<Invite | null> {
	const row = await db
		.prepare(
			`SELECT id, org_id, roster_member_id, token, invited_by, expires_at, created_at
			 FROM invites WHERE id = ?`
		)
		.bind(inviteId)
		.first<{ id: string; org_id: string; roster_member_id: string; token: string; invited_by: string; expires_at: string; created_at: string }>();

	if (!row) return null;

	return await loadInviteRelations(db, {
		...row,
		orgId: createOrgId(row.org_id)
	});
}

/**
 * Accept an invite and upgrade roster member to registered.
 * Handles cross-org resolution (#307): if a member with this email already exists
 * in another org, bind that existing member to the invite's org instead of
 * setting email_id on the roster slot (which would create a duplicate).
 */
export async function acceptInvite(
	db: D1Database,
	token: string,
	email: string // Verified email from Registry OAuth
): Promise<AcceptInviteResult> {
	const invite = await getInviteByToken(db, token);

	if (!invite) {
		return { success: false, error: 'Invalid invite token' };
	}

	// Check expiration
	if (new Date(invite.expires_at) < new Date()) {
		return { success: false, error: 'Invite has expired' };
	}

	// Check if a member with this email already exists globally (#307)
	const { getMemberByEmailGlobal, upgradeToRegistered } = await import('./members');
	const existingMember = await getMemberByEmailGlobal(db, email);

	let memberId: string;

	if (existingMember) {
		// Cross-org case: member exists in another org (or already in this org).
		// Bind the existing member to the invite's org if not already there.
		const { getMemberOrganization, addMemberToOrganization } = await import('./member-organizations');
		const alreadyInOrg = await getMemberOrganization(db, existingMember.id, String(invite.orgId));

		if (!alreadyInOrg) {
			await addMemberToOrganization(db, {
				memberId: existingMember.id,
				orgId: invite.orgId,
				invitedBy: invite.invited_by
			});
		}

		// Transfer roster slot's org-B data to the real member before cleanup.
		const rosterSlotId = invite.roster_member_id;

		// Transfer org-B roles from roster slot → existing member
		const rosterRoles = await db
			.prepare('SELECT role FROM member_roles WHERE member_id = ? AND org_id = ?')
			.bind(rosterSlotId, invite.orgId)
			.all<{ role: Role }>();
		for (const { role } of rosterRoles.results) {
			await addMemberRoles(db, existingMember.id, [role], invite.invited_by, invite.orgId);
		}
		await db
			.prepare('DELETE FROM member_roles WHERE member_id = ? AND org_id = ?')
			.bind(rosterSlotId, invite.orgId)
			.run();

		// Transfer voices from roster slot → existing member
		const rosterVoices = await db
			.prepare('SELECT voice_id, is_primary FROM member_voices WHERE member_id = ?')
			.bind(rosterSlotId)
			.all<{ voice_id: string; is_primary: number }>();
		for (const v of rosterVoices.results) {
			await db
				.prepare('INSERT OR IGNORE INTO member_voices (member_id, voice_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)')
				.bind(existingMember.id, v.voice_id, v.is_primary, invite.invited_by)
				.run();
		}
		await db
			.prepare('DELETE FROM member_voices WHERE member_id = ?')
			.bind(rosterSlotId)
			.run();

		// Transfer sections from roster slot → existing member
		const rosterSections = await db
			.prepare('SELECT section_id, is_primary FROM member_sections WHERE member_id = ?')
			.bind(rosterSlotId)
			.all<{ section_id: string; is_primary: number }>();
		for (const s of rosterSections.results) {
			await db
				.prepare('INSERT OR IGNORE INTO member_sections (member_id, section_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)')
				.bind(existingMember.id, s.section_id, s.is_primary, invite.invited_by)
				.run();
		}
		await db
			.prepare('DELETE FROM member_sections WHERE member_id = ?')
			.bind(rosterSlotId)
			.run();

		// Remove roster slot from org B
		const { removeMemberFromOrganization } = await import('./member-organizations');
		await removeMemberFromOrganization(db, rosterSlotId, String(invite.orgId));

		// Delete invite BEFORE hard-deleting roster member — invites.roster_member_id
		// has a FK to members(id) with no CASCADE, so deleting the member while the
		// invite row still references it causes SQLITE_CONSTRAINT_FOREIGNKEY (#307).
		await db
			.prepare('DELETE FROM invites WHERE token = ?')
			.bind(token)
			.run();

		// Hard-delete roster member row if it has no remaining org memberships
		const orgCount = await db
			.prepare('SELECT COUNT(*) as count FROM member_organizations WHERE member_id = ?')
			.bind(rosterSlotId)
			.first<{ count: number }>();
		if (!orgCount || orgCount.count === 0) {
			await db.prepare('DELETE FROM members WHERE id = ?').bind(rosterSlotId).run();
		}

		// Do NOT set email_id on the roster slot — that would create a duplicate (AC3a).
		memberId = existingMember.id;
	} else {
		// Normal case: no existing member with this email — upgrade roster slot.
		const member = await upgradeToRegistered(
			db,
			invite.roster_member_id,
			email,
			invite.orgId
		);
		memberId = member.id;
	}

	// Transfer roles from invite to member
	if (invite.roles.length > 0) {
		await addMemberRoles(db, memberId, invite.roles, invite.invited_by, invite.orgId);
	}

	// Delete invite after successful acceptance (cleanup) — skip if already
	// deleted in the cross-org branch above
	if (!existingMember) {
		await db
			.prepare('DELETE FROM invites WHERE token = ?')
			.bind(token)
			.run();
	}

	return { success: true, memberId };
}

/**
 * Get all pending invites for an organization with roster member and inviter info
 */
export async function getPendingInvites(
	db: D1Database,
	orgId: OrgId
): Promise<(Invite & { inviter_name: string | null; inviter_email: string | null })[]> {
	const result = await db
		.prepare(
			`SELECT i.id, i.org_id, i.roster_member_id, i.token, i.invited_by, i.expires_at, i.created_at,
			        inviter.name as inviter_name, inviter.email_id as inviter_email
			 FROM invites i
			 JOIN members inviter ON i.invited_by = inviter.id
			 WHERE i.org_id = ? AND i.expires_at > datetime('now')
			 ORDER BY i.created_at DESC`
		)
		.bind(orgId)
		.all<{ id: string; org_id: string; roster_member_id: string; token: string; invited_by: string; expires_at: string; created_at: string; inviter_name: string | null; inviter_email: string | null }>();

	// Load relations for each invite
	const invitesWithRelations = await Promise.all(
		result.results.map(async (row) => {
			const invite = await loadInviteRelations(db, {
				id: row.id,
				orgId: createOrgId(row.org_id),
				roster_member_id: row.roster_member_id,
				token: row.token,
				invited_by: row.invited_by,
				expires_at: row.expires_at,
				created_at: row.created_at
			});
			return {
				...invite,
				inviter_name: row.inviter_name,
				inviter_email: row.inviter_email
			};
		})
	);

	return invitesWithRelations;
}

/**
 * Revoke (delete) an invite by ID
 */
export async function revokeInvite(
	db: D1Database,
	inviteId: string
): Promise<boolean> {
	const result = await db
		.prepare(`DELETE FROM invites WHERE id = ? AND expires_at > datetime('now')`)
		.bind(inviteId)
		.run();

	return (result.meta.changes ?? 0) > 0;
}

/**
 * Renew an invite by extending expiration by 48 hours from now
 * Accepted invites are deleted on acceptance, so only pending invites exist to renew
 */
export async function renewInvite(
	db: D1Database,
	inviteId: string
): Promise<Invite | null> {
	const newExpiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

	const result = await db
		.prepare(
			`UPDATE invites
			 SET expires_at = ?
			 WHERE id = ?`
		)
		.bind(newExpiresAt.toISOString(), inviteId)
		.run();

	if ((result.meta.changes ?? 0) === 0) {
		return null;
	}

	return getInviteById(db, inviteId);
}

/**
 * Get pending invite token for a roster member (if exists)
 * Returns null if no pending invite
 */
export async function getPendingInviteToken(
	db: D1Database,
	rosterMemberId: string
): Promise<string | null> {
	const result = await db
		.prepare('SELECT token FROM invites WHERE roster_member_id = ? AND expires_at > datetime("now")')
		.bind(rosterMemberId)
		.first<{ token: string }>();

	return result?.token ?? null;
}

/**
 * Build invite accept URL from token and origin
 */
export function buildInviteLink(origin: string, token: string): string {
	return `${origin}/invite/accept?token=${token}`;
}
