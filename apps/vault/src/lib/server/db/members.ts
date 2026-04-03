// Member database operations
import type { OrgId } from '@polyphony/shared';
import type { Role, Voice, Section, Member } from '$lib/types';
import { generateId } from '$lib/server/utils/id';
import { queryMemberSections, queryMemberVoices } from './queries/members';
import { addMemberRoles } from './roles';

// Re-export Member from canonical types
export type { Member };

/**
 * Validate that all sections belong to the specified organization
 * @throws Error if any section doesn't belong to the org or doesn't exist
 */
async function validateSectionsOwnedByOrg(
	db: D1Database,
	sectionIds: string[],
	orgId: OrgId
): Promise<void> {
	if (sectionIds.length === 0) return;

	// Check all sections in one query
	const placeholders = sectionIds.map(() => '?').join(',');
	const sections = await db
		.prepare(`SELECT id, org_id FROM sections WHERE id IN (${placeholders})`)
		.bind(...sectionIds)
		.all<{ id: string; org_id: string }>();

	// Verify we found all sections
	if (sections.results.length !== sectionIds.length) {
		throw new Error('One or more sections not found');
	}

	// Verify all sections belong to the organization
	const invalidSections = sections.results.filter((s) => s.org_id !== orgId);
	if (invalidSections.length > 0) {
		throw new Error(
			`Sections do not belong to organization: ${invalidSections.map((s) => s.id).join(', ')}`
		);
	}
}

export interface CreateMemberInput {
	email: string; // For OAuth registration (becomes email_id)
	name?: string;
	roles: Role[]; // Can assign multiple roles on creation
	voiceIds?: string[]; // Voice IDs to assign
	sectionIds?: string[]; // Section IDs to assign
	invited_by?: string;
	orgId: OrgId; // Organization to add member to
}

export interface CreateRosterMemberInput {
	name: string; // Required
	email_contact?: string; // Optional contact email
	roles?: Role[]; // Optional pre-assigned roles
	voiceIds?: string[];
	sectionIds?: string[];
	addedBy: string; // Admin who added them
	orgId: OrgId; // Organization to add member to
}

// Helper functions

/**
 * Check if member has completed OAuth registration
 */
export function isRegistered(member: Member): boolean {
	return member.email_id !== null;
}

/**
 * Get email for authentication (null for roster-only members)
 */
export function getAuthEmail(member: Member): string | null {
	return member.email_id;
}

/**
 * Get email for notifications (prefers contact, fallback to auth)
 */
export function getContactEmail(member: Member): string | null {
	return member.email_contact ?? member.email_id;
}

/**
 * Create a new member in the database with assigned roles, voices, and sections
 * For OAuth registration (has email_id)
 */
export async function createMember(db: D1Database, input: CreateMemberInput): Promise<Member> {
	const id = generateId();
	const name = input.name ?? input.email; // Default name to email
	const invited_by = input.invited_by ?? null;

	// Insert member record with email as email_id
	await db
		.prepare('INSERT INTO members (id, name, email_id, email_contact, invited_by) VALUES (?, ?, ?, NULL, ?)')
		.bind(id, name, input.email, invited_by)
		.run();

	// Link member to organization
	await db
		.prepare(
			`INSERT INTO member_organizations (member_id, org_id, invited_by, joined_at)
			 VALUES (?, ?, ?, datetime('now'))`
		)
		.bind(id, input.orgId, invited_by)
		.run();

	// Insert role records using centralized function
	if (input.roles.length > 0) {
		await addMemberRoles(db, id, input.roles, invited_by, input.orgId);
	}

	// Insert voice assignments
	if (input.voiceIds && input.voiceIds.length > 0) {
		const voiceStatements = input.voiceIds.map((voiceId, index) =>
			db
				.prepare(
					'INSERT INTO member_voices (member_id, voice_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)'
				)
				.bind(id, voiceId, index === 0 ? 1 : 0, invited_by)
		);
		await db.batch(voiceStatements);
	}

	// Insert section assignments (with org validation)
	if (input.sectionIds && input.sectionIds.length > 0) {
		// Validate all sections belong to the organization
		await validateSectionsOwnedByOrg(db, input.sectionIds, input.orgId);
		
		const sectionStatements = input.sectionIds.map((sectionId, index) =>
			db
				.prepare(
					'INSERT INTO member_sections (member_id, section_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)'
				)
				.bind(id, sectionId, index === 0 ? 1 : 0, invited_by)
		);
		await db.batch(sectionStatements);
	}

	// Return the created member
	const member = await getMemberById(db, id, input.orgId);
	if (!member) {
		throw new Error('Failed to create member');
	}
	return member;
}

/**
 * Create a roster-only member (no OAuth registration yet)
 */
export async function createRosterMember(
	db: D1Database,
	input: CreateRosterMemberInput
): Promise<Member> {
	// Check name uniqueness within the organization (case-insensitive)
	const existing = await db
		.prepare(
			`SELECT m.id FROM members m
			 JOIN member_organizations mo ON m.id = mo.member_id
			 WHERE LOWER(m.name) = LOWER(?) AND mo.org_id = ?`
		)
		.bind(input.name, input.orgId)
		.first();

	if (existing) {
		throw new Error(`Member with name "${input.name}" already exists`);
	}

	const id = generateId();

	// Insert member WITHOUT email_id (roster-only)
	await db
		.prepare('INSERT INTO members (id, name, email_id, email_contact, invited_by) VALUES (?, ?, NULL, ?, ?)')
		.bind(id, input.name, input.email_contact ?? null, input.addedBy)
		.run();

	// Link member to organization
	await db
		.prepare(
			`INSERT INTO member_organizations (member_id, org_id, invited_by, joined_at)
			 VALUES (?, ?, ?, datetime('now'))`
		)
		.bind(id, input.orgId, input.addedBy)
		.run();

	// Insert pre-assigned roles if provided
	if (input.roles && input.roles.length > 0) {
		await addMemberRoles(db, id, input.roles, input.addedBy, input.orgId);
	}

	// Insert voice assignments
	if (input.voiceIds && input.voiceIds.length > 0) {
		const voiceStatements = input.voiceIds.map((voiceId, index) =>
			db
				.prepare(
					'INSERT INTO member_voices (member_id, voice_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)'
				)
				.bind(id, voiceId, index === 0 ? 1 : 0, input.addedBy)
		);
		await db.batch(voiceStatements);
	}

	// Insert section assignments (with org validation)
	if (input.sectionIds && input.sectionIds.length > 0) {
		// Validate all sections belong to the organization
		await validateSectionsOwnedByOrg(db, input.sectionIds, input.orgId);
		
		const sectionStatements = input.sectionIds.map((sectionId, index) =>
			db
				.prepare(
					'INSERT INTO member_sections (member_id, section_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)'
				)
				.bind(id, sectionId, index === 0 ? 1 : 0, input.addedBy)
		);
		await db.batch(sectionStatements);
	}

	// Return the created member
	const member = await getMemberById(db, id, input.orgId);
	if (!member) {
		throw new Error('Failed to create roster member');
	}
	return member;
}

/**
 * Upgrade a roster-only member to registered (add email_id)
 */
export async function upgradeToRegistered(
	db: D1Database,
	rosterMemberId: string,
	verifiedEmailId: string,
	orgId: OrgId
): Promise<Member> {
	// Verify no other member has this email_id
	const existingEmail = await getMemberByEmailId(db, verifiedEmailId, orgId);
	if (existingEmail && existingEmail.id !== rosterMemberId) {
		throw new Error('Email already registered to another member');
	}

	// Add email_id (upgrades roster → registered)
	await db
		.prepare('UPDATE members SET email_id = ? WHERE id = ?')
		.bind(verifiedEmailId, rosterMemberId)
		.run();

	const member = await getMemberById(db, rosterMemberId, orgId);
	if (!member) {
		throw new Error('Failed to upgrade roster member');
	}
	return member;
}

/**
 * Find a member by email_id across ALL organizations (no org scoping).
 * Returns basic member data without org-specific relations (roles, sections).
 * Used for cross-org invite resolution (#307).
 */
export async function getMemberByEmailGlobal(
	db: D1Database,
	emailId: string
): Promise<Pick<Member, 'id' | 'name' | 'email_id'> | null> {
	return await db
		.prepare('SELECT id, name, email_id FROM members WHERE email_id = ?')
		.bind(emailId)
		.first<Pick<Member, 'id' | 'name' | 'email_id'>>();
}

/**
 * Find a member by email_id (OAuth identity) with their roles, voices, and sections
 * When orgId is provided, only returns roles and sections for that organization
 */
export async function getMemberByEmailId(db: D1Database, emailId: string, orgId: OrgId): Promise<Member | null> {
	const memberRow = await db
		.prepare(
			`SELECT m.id, m.name, m.nickname, m.email_id, m.email_contact, m.invited_by, m.joined_at
			 FROM members m
			 JOIN member_organizations mo ON m.id = mo.member_id
			 WHERE m.email_id = ? AND mo.org_id = ?`
		)
		.bind(emailId, orgId)
		.first<Omit<Member, 'roles' | 'voices' | 'sections'>>();

	if (!memberRow) {
		return null;
	}

	return await loadMemberRelations(db, memberRow, orgId);
}

/**
 * Find a member by name (case-insensitive) with their roles, voices, and sections
 * When orgId is provided, only returns roles and sections for that organization
 */
export async function getMemberByName(db: D1Database, name: string, orgId: OrgId): Promise<Member | null> {
	const memberRow = await db
		.prepare(
			`SELECT m.id, m.name, m.nickname, m.email_id, m.email_contact, m.invited_by, m.joined_at
			 FROM members m
			 JOIN member_organizations mo ON m.id = mo.member_id
			 WHERE LOWER(m.name) = LOWER(?) AND mo.org_id = ?`
		)
		.bind(name, orgId)
		.first<Omit<Member, 'roles' | 'voices' | 'sections'>>();

	if (!memberRow) {
		return null;
	}

	return await loadMemberRelations(db, memberRow, orgId);
}

/**
 * Find a member by ID with their roles, voices, and sections
 * When orgId is provided, only returns roles and sections for that organization
 */
export async function getMemberById(db: D1Database, id: string, orgId: OrgId): Promise<Member | null> {
	const memberRow = await db
		.prepare(
			`SELECT m.id, m.name, m.nickname, m.email_id, m.email_contact, m.invited_by, m.joined_at
			 FROM members m
			 JOIN member_organizations mo ON m.id = mo.member_id
			 WHERE m.id = ? AND mo.org_id = ?`
		)
		.bind(id, orgId)
		.first<Omit<Member, 'roles' | 'voices' | 'sections'>>();

	if (!memberRow) {
		return null;
	}

	return await loadMemberRelations(db, memberRow, orgId);
}

/**
 * Get all members with their roles, voices, and sections
 * When orgId is provided, only returns members belonging to that organization
 */
export async function getAllMembers(db: D1Database, orgId: OrgId): Promise<Member[]> {
	const result = await db
		.prepare(
			`SELECT m.id, m.name, m.nickname, m.email_id, m.email_contact, m.invited_by, m.joined_at
			 FROM members m
			 JOIN member_organizations mo ON m.id = mo.member_id
			 WHERE mo.org_id = ?`
		)
		.bind(orgId)
		.all<Omit<Member, 'roles' | 'voices' | 'sections'>>();

	// Load relations for all members
	const membersWithRelations = await Promise.all(
		result.results.map((memberRow) => loadMemberRelations(db, memberRow, orgId))
	);

	return membersWithRelations;
}

/**
 * Helper function to load roles, voices, and sections for a member
 * When orgId is provided, only loads roles for that organization
 */
async function loadMemberRelations(
	db: D1Database,
	memberRow: Omit<Member, 'roles' | 'voices' | 'sections'>,
	orgId: OrgId
): Promise<Member> {
	// Get roles (scoped to organization)
	const rolesResult = await db
		.prepare('SELECT role FROM member_roles WHERE member_id = ? AND org_id = ?')
		.bind(memberRow.id, orgId)
		.all<{ role: Role }>();
	const roles = rolesResult.results.map((r) => r.role);

	// Get voices and sections using shared queries (sections scoped to org if provided)
	const voices = await queryMemberVoices(db, memberRow.id, orgId);
	const sections = await queryMemberSections(db, memberRow.id, orgId);

	return {
		...memberRow,
		roles,
		voices,
		sections
	};
}

/**
 * Add a voice to a member
 * Note: If this is the member's first voice, it's automatically marked as primary
 */
export async function addMemberVoice(
	db: D1Database,
	memberId: string,
	voiceId: string,
	isPrimary: boolean = false,
	assignedBy: string | null = null
): Promise<void> {
	// Enforce: first voice must be primary (don't trust caller)
	const existing = await db
		.prepare('SELECT COUNT(*) as count FROM member_voices WHERE member_id = ?')
		.bind(memberId)
		.first<{ count: number }>();
	
	const shouldBePrimary = isPrimary || (existing?.count ?? 0) === 0;
	
	await db
		.prepare(
			'INSERT INTO member_voices (member_id, voice_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)'
		)
		.bind(memberId, voiceId, shouldBePrimary ? 1 : 0, assignedBy)
		.run();
}

/**
 * Remove a voice from a member
 */
export async function removeMemberVoice(
	db: D1Database,
	memberId: string,
	voiceId: string
): Promise<boolean> {
	const result = await db
		.prepare('DELETE FROM member_voices WHERE member_id = ? AND voice_id = ?')
		.bind(memberId, voiceId)
		.run();

	return (result.meta.changes ?? 0) > 0;
}

/**
 * Replace all voices for a member with a new set.
 * First voice in the array becomes primary.
 */
export async function setMemberVoices(
	db: D1Database,
	memberId: string,
	voiceIds: string[],
	assignedBy: string
): Promise<void> {
	// Clear existing voices
	await db
		.prepare('DELETE FROM member_voices WHERE member_id = ?')
		.bind(memberId)
		.run();

	// Insert new voices (first is primary)
	if (voiceIds.length > 0) {
		const statements = voiceIds.map((voiceId, index) =>
			db
				.prepare(
					'INSERT INTO member_voices (member_id, voice_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)'
				)
				.bind(memberId, voiceId, index === 0 ? 1 : 0, assignedBy)
		);
		await db.batch(statements);
	}
}

/**
 * Set primary voice for a member (others become non-primary)
 */
export async function setPrimaryVoice(
	db: D1Database,
	memberId: string,
	voiceId: string
): Promise<void> {
	await db
		.prepare('UPDATE member_voices SET is_primary = ? WHERE member_id = ? AND voice_id = ?')
		.bind(1, memberId, voiceId)
		.run();
}

/**
 * Add a section to a member
 * Note: If this is the member's first section, it's automatically marked as primary
 * Validates that the section belongs to the specified organization
 */
export async function addMemberSection(
	db: D1Database,
	memberId: string,
	sectionId: string,
	isPrimary: boolean = false,
	assignedBy: string | null = null,
	orgId: OrgId
): Promise<void> {
	// Validate section belongs to the organization
	const section = await db
		.prepare('SELECT org_id FROM sections WHERE id = ?')
		.bind(sectionId)
		.first<{ org_id: string }>();
	
	if (!section) {
		throw new Error('Section not found');
	}
	
	if (section.org_id !== orgId) {
		throw new Error('Section does not belong to member\'s organization');
	}
	
	// Enforce: first section must be primary (don't trust caller)
	const existing = await db
		.prepare('SELECT COUNT(*) as count FROM member_sections WHERE member_id = ?')
		.bind(memberId)
		.first<{ count: number }>();
	
	const shouldBePrimary = isPrimary || (existing?.count ?? 0) === 0;
	
	await db
		.prepare(
			'INSERT INTO member_sections (member_id, section_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)'
		)
		.bind(memberId, sectionId, shouldBePrimary ? 1 : 0, assignedBy)
		.run();
}

/**
 * Remove a section from a member
 */
export async function removeMemberSection(
	db: D1Database,
	memberId: string,
	sectionId: string
): Promise<boolean> {
	const result = await db
		.prepare('DELETE FROM member_sections WHERE member_id = ? AND section_id = ?')
		.bind(memberId, sectionId)
		.run();

	return (result.meta.changes ?? 0) > 0;
}

/**
 * Set primary section for a member (others become non-primary)
 */
export async function setPrimarySection(
	db: D1Database,
	memberId: string,
	sectionId: string
): Promise<void> {
	await db
		.prepare('UPDATE member_sections SET is_primary = ? WHERE member_id = ? AND section_id = ?')
		.bind(1, memberId, sectionId)
		.run();
}

/**
 * Update a member's name with uniqueness validation
 */
export async function updateMemberName(
	db: D1Database,
	memberId: string,
	newName: string,
	orgId: OrgId
): Promise<Member> {
	// Check uniqueness (case-insensitive, excluding current member)
	const existing = await db
		.prepare('SELECT id FROM members WHERE LOWER(name) = LOWER(?) AND id != ?')
		.bind(newName, memberId)
		.first();

	if (existing) {
		throw new Error(`Member with name "${newName}" already exists`);
	}

	// Update name
	await db
		.prepare('UPDATE members SET name = ? WHERE id = ?')
		.bind(newName, memberId)
		.run();

	// Return updated member with all relations
	const updated = await getMemberById(db, memberId, orgId);
	if (!updated) {
		throw new Error('Failed to retrieve updated member');
	}

	return updated;
}

/**
 * Update a member's nickname (can be null to clear it)
 */
export async function updateMemberNickname(
	db: D1Database,
	memberId: string,
	newNickname: string | null,
	orgId: OrgId
): Promise<Member> {
	// Update nickname (null clears it)
	await db
		.prepare('UPDATE members SET nickname = ? WHERE id = ?')
		.bind(newNickname, memberId)
		.run();

	// Return updated member with all relations
	const updated = await getMemberById(db, memberId, orgId);
	if (!updated) {
		throw new Error('Failed to retrieve updated member');
	}

	return updated;
}
