// TDD RED: Cross-org invite resolution (#307)
// Scenario: member exists in org A with email, gets invited to org B (roster slot, no email).
// Auth callback should resolve the EXISTING member by email and bind them to org B,
// rather than creating a duplicate member record with the same email.
//
// Acceptance criteria:
//   AC1 — invite acceptance returns the existing member's ID, not the roster slot ID
//   AC2 — existing member is added to org B membership (member_organizations)
//   AC3a — roster slot does NOT get email_id set (no duplicate records)
//   AC3b — if already registered in same org, returns success gracefully (no throw → no redirect loop)
//   AC4 — existing org A roles are preserved after cross-org acceptance

import { describe, it, expect } from 'vitest';
import { createOrgId } from '@polyphony/shared';
import { acceptInvite } from '$lib/server/db/invites';

const ORG_A = createOrgId('org_alpha');
const ORG_B = createOrgId('org_beta');

const ALICE_ID = 'member_alice_001';
const ALICE_EMAIL = 'alice@chorus.org';
const ORG_B_ROSTER_ID = 'roster_b_slot_001';
const INVITE_TOKEN = 'cross_org_invite_token_xox';
const FUTURE_EXPIRY = new Date(Date.now() + 86_400_000).toISOString();

interface MockState {
	members: Map<string, {
		id: string; name: string; nickname: string | null;
		email_id: string | null; email_contact: string | null;
		invited_by: string | null; joined_at: string;
	}>;
	memberOrgs: Map<string, boolean>;   // key: `${memberId}:${orgId}`
	memberRoles: Map<string, string[]>; // key: `${memberId}:${orgId}`
}

interface SetupOptions {
	/** Give alice an existing role in org A before the invite is accepted */
	aliceOrgARoles?: string[];
	/** Simulate alice already being registered in org B (AC3b scenario) */
	aliceAlreadyInOrgB?: boolean;
}

function createCrossOrgDb(opts: SetupOptions = {}): { db: D1Database; state: MockState } {
	const state: MockState = {
		members: new Map([
			[ALICE_ID, {
				id: ALICE_ID,
				name: 'Alice Soprano',
				nickname: null,
				email_id: ALICE_EMAIL,
				email_contact: null,
				invited_by: null,
				joined_at: '2025-01-01T00:00:00.000Z'
			}],
			[ORG_B_ROSTER_ID, {
				id: ORG_B_ROSTER_ID,
				name: 'Alice S.',
				nickname: null,
				email_id: null, // roster-only slot, no email
				email_contact: null,
				invited_by: 'admin_b',
				joined_at: '2026-01-01T00:00:00.000Z'
			}]
		]),
		memberOrgs: new Map([
			[`${ALICE_ID}:${ORG_A}`, true],
			[`${ORG_B_ROSTER_ID}:${ORG_B}`, true],
			// Optionally alice is already in org B
			...(opts.aliceAlreadyInOrgB ? [[`${ALICE_ID}:${ORG_B}`, true] as [string, boolean]] : [])
		]),
		memberRoles: new Map()
	};

	// Seed org A roles for alice
	if (opts.aliceOrgARoles?.length) {
		state.memberRoles.set(`${ALICE_ID}:${ORG_A}`, [...opts.aliceOrgARoles]);
	}
	// If alice is already in org B, seed her there too (AC3b)
	if (opts.aliceAlreadyInOrgB) {
		state.memberOrgs.set(`${ALICE_ID}:${ORG_B}`, true);
	}

	const invites = new Map([
		[INVITE_TOKEN, {
			id: 'invite_001',
			org_id: String(ORG_B),
			roster_member_id: ORG_B_ROSTER_ID,
			token: INVITE_TOKEN,
			invited_by: 'admin_b',
			expires_at: FUTURE_EXPIRY,
			created_at: '2026-03-01T00:00:00.000Z'
		}]
	]);

	const db = {
		prepare: (sql: string) => ({
			bind: (...params: unknown[]) => ({
				first: async () => {
					// getInviteByToken: SELECT FROM invites WHERE token = ?
					if (sql.includes('FROM invites') && sql.includes('token = ?')) {
						return invites.get(params[0] as string) ?? null;
					}
					// pending invite check: SELECT id FROM invites WHERE roster_member_id = ?
					if (sql.includes('FROM invites') && sql.includes('roster_member_id = ?')) {
						return null;
					}
					// getMemberByEmailGlobal: SELECT ... FROM members WHERE email_id = ? (no org join)
					if (sql.includes('email_id = ?') && !sql.includes('org_id')) {
						const emailId = params[0] as string;
						for (const member of state.members.values()) {
							if (member.email_id === emailId) {
								return { id: member.id, name: member.name, email_id: member.email_id };
							}
						}
						return null;
					}
					// getMemberByEmailId: WHERE m.email_id = ? AND mo.org_id = ?
					if (sql.includes('email_id = ?') && sql.includes('org_id = ?')) {
						const [emailId, orgId] = params as [string, string];
						for (const [key, member] of state.members.entries()) {
							if (member.email_id === emailId && state.memberOrgs.has(`${key}:${orgId}`)) {
								return { ...member };
							}
						}
						return null;
					}
					// getMemberById: WHERE m.id = ? AND mo.org_id = ?
					if (sql.includes('WHERE m.id = ?') && sql.includes('mo.org_id = ?')) {
						const [memberId, orgId] = params as [string, string];
						if (state.memberOrgs.has(`${memberId}:${orgId}`)) {
							const m = state.members.get(memberId);
							return m ? { ...m } : null;
						}
						return null;
					}
					// SELECT email_id FROM members WHERE id = ? (used by invite/accept page)
					if (sql.includes('FROM members WHERE id = ?')) {
						const m = state.members.get(params[0] as string);
						return m ? { email_id: m.email_id } : null;
					}
					// getMemberOrganization: SELECT ... FROM member_organizations WHERE member_id = ? AND org_id = ?
					if (sql.includes('FROM member_organizations') && sql.includes('member_id = ?') && sql.includes('org_id = ?')) {
						const [memberId, orgId] = params as [string, string];
						if (state.memberOrgs.has(`${memberId}:${orgId}`)) {
							return { member_id: memberId, org_id: orgId, nickname: null, invited_by: null, joined_at: '2026-01-01T00:00:00.000Z' };
						}
						return null;
					}
					return null;
				},
				run: async () => {
					// UPDATE members SET email_id = ? WHERE id = ?
					if (sql.includes('UPDATE members SET email_id')) {
						const [emailId, memberId] = params as [string, string];
						const m = state.members.get(memberId);
						if (m) m.email_id = emailId;
						return { meta: { changes: 1 } };
					}
					// INSERT INTO member_roles
					if (sql.includes('INSERT INTO member_roles')) {
						const [memberId, orgId, role] = params as [string, string, string];
						const key = `${memberId}:${orgId}`;
						const existing = state.memberRoles.get(key) ?? [];
						state.memberRoles.set(key, [...existing, role]);
						return { meta: { changes: 1 } };
					}
					// INSERT INTO member_organizations
					if (sql.includes('INSERT INTO member_organizations')) {
						const [memberId, orgId] = params as [string, string];
						state.memberOrgs.set(`${memberId}:${orgId}`, true);
						return { meta: { changes: 1 } };
					}
					// DELETE FROM invites WHERE token = ?
					if (sql.includes('DELETE FROM invites') && sql.includes('token = ?')) {
						invites.delete(params[0] as string);
						return { meta: { changes: 1 } };
					}
					return { meta: { changes: 0 } };
				},
				all: async () => {
					// SELECT role FROM member_roles WHERE member_id = ? AND org_id = ?
					if (sql.includes('FROM member_roles')) {
						const [memberId, orgId] = params as [string, string];
						const roles = state.memberRoles.get(`${memberId}:${orgId}`) ?? [];
						return { results: roles.map((role) => ({ role })) };
					}
					// voices/sections — empty for these tests
					return { results: [] };
				}
			})
		}),
		batch: async (statements: Array<{ run: () => Promise<unknown> }>) => {
			for (const stmt of statements) {
				await stmt.run();
			}
			return [];
		}
	} as unknown as D1Database;

	return { db, state };
}

// ─── AC1: Returns the existing member ID ─────────────────────────────────────

describe('#307 — cross-org invite resolve: AC1 — correct member ID returned', () => {
	it('returns the existing org-A member ID, not the org-B roster slot ID', async () => {
		const { db } = createCrossOrgDb();

		const result = await acceptInvite(db, INVITE_TOKEN, ALICE_EMAIL);

		expect(result.success).toBe(true);
		// RED: currently returns ORG_B_ROSTER_ID because upgradeToRegistered sets email
		// on the roster slot and returns it. Expected: ALICE_ID (the pre-existing member).
		expect(result.memberId).toBe(ALICE_ID);
	});
});

// ─── AC2: Email binding — existing member is added to org B ──────────────────

describe('#307 — cross-org invite resolve: AC2 — member added to org B', () => {
	it('adds the existing member to org B via member_organizations', async () => {
		const { db, state } = createCrossOrgDb();

		await acceptInvite(db, INVITE_TOKEN, ALICE_EMAIL);

		// RED: current code never inserts alice_id into org B member_organizations.
		// It only sets email_id on the roster slot (ORG_B_ROSTER_ID).
		expect(state.memberOrgs.has(`${ALICE_ID}:${ORG_B}`)).toBe(true);
	});
});

// ─── AC3a: No duplicate — roster slot must NOT receive the email ──────────────

describe('#307 — cross-org invite resolve: AC3a — no email_id set on roster slot', () => {
	it('does not set email_id on the org-B roster slot when resolving cross-org', async () => {
		const { db, state } = createCrossOrgDb();

		await acceptInvite(db, INVITE_TOKEN, ALICE_EMAIL);

		const rosterSlot = state.members.get(ORG_B_ROSTER_ID);
		// RED: current code calls upgradeToRegistered which sets alice's email on the
		// roster slot, creating a second member record with the same email_id.
		expect(rosterSlot?.email_id).toBeNull();
	});
});

// ─── AC3b: No redirect loop — graceful handling when already in same org ─────

describe('#307 — cross-org invite resolve: AC3b — no throw when already in org B', () => {
	it('returns success when email is already registered in the target org (avoids error cascade)', async () => {
		// Alice is already in both org A AND org B (already accepted a previous invite).
		// A stale invite from org B is accepted again — should not throw.
		const { db } = createCrossOrgDb({ aliceAlreadyInOrgB: true });

		// RED: current upgradeToRegistered throws "Email already registered to another member"
		// when getMemberByEmailId finds alice in org B and alice.id !== rosterSlotId.
		// That exception propagates unhandled through acceptInvite → handleInviteAcceptance
		// → handleAuthError → HTTP 401. The fix must catch this and return the member.
		const result = await acceptInvite(db, INVITE_TOKEN, ALICE_EMAIL);

		expect(result.success).toBe(true);
		expect(result.memberId).toBe(ALICE_ID);
	});
});

// ─── AC4: Org A roles preserved after cross-org acceptance ───────────────────

describe('#307 — cross-org invite resolve: AC4 — existing roles preserved', () => {
	it('does not remove or alter existing org-A roles when binding member to org B', async () => {
		const { db, state } = createCrossOrgDb({ aliceOrgARoles: ['admin', 'librarian'] });

		await acceptInvite(db, INVITE_TOKEN, ALICE_EMAIL);

		// RED: if the fix incorrectly deletes alice's member record or resets roles,
		// her org A roles would be wiped. They must survive the cross-org acceptance.
		const orgARoles = state.memberRoles.get(`${ALICE_ID}:${ORG_A}`);
		expect(orgARoles).toEqual(expect.arrayContaining(['admin', 'librarian']));
	});

	it('does not assign invite roles to the roster slot (wrong member)', async () => {
		// Invite roles would be wired up once invite_roles junction table is implemented.
		// For now, confirm that if roles WERE present they'd go to ALICE_ID not ROSTER_ID.
		// This test encodes the invariant even while invite.roles is currently always [].
		const { db, state } = createCrossOrgDb();

		await acceptInvite(db, INVITE_TOKEN, ALICE_EMAIL);

		// Roster slot should never receive roles — roles belong to alice in org B.
		const rosterRoles = state.memberRoles.get(`${ORG_B_ROSTER_ID}:${ORG_B}`);
		expect(rosterRoles ?? []).toHaveLength(0);
	});
});
