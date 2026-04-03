// TDD: Roster-linked invite system tests (Issue #96)
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createOrgId } from '@polyphony/shared';
import { createInvite, getInviteByToken, acceptInvite, type Invite } from '$lib/server/db/invites';
import { createRosterMember, getMemberById, type Member } from '$lib/server/db/members';

// Test org ID (matches DEFAULT_ORG_ID)
const TEST_ORG_ID = createOrgId('org_crede_001');

// Mock D1 database for roster-linked invites
function createMockDb() {
	const invites: Map<string, Record<string, unknown>> = new Map();
	const invitesByToken: Map<string, string> = new Map(); // token -> id mapping
	const members: Map<string, Record<string, unknown>> = new Map();
	const memberOrgs: Map<string, Set<string>> = new Map(); // member_id -> Set<org_id>
	const memberRoles: Map<string, string[]> = new Map();
	const memberVoices: Map<string, { voice_id: string; is_primary: number }[]> = new Map();
	const memberSections: Map<string, { section_id: string; is_primary: number }[]> = new Map();

	// Seed voice data
	const voices = new Map([
		[
			'soprano',
			{
				id: 'soprano',
				name: 'Soprano',
				abbreviation: 'S',
				category: 'vocal',
				range_group: 'treble',
				display_order: 1,
				is_active: 1
			}
		],
		[
			'alto',
			{
				id: 'alto',
				name: 'Alto',
				abbreviation: 'A',
				category: 'vocal',
				range_group: 'treble',
				display_order: 2,
				is_active: 1
			}
		]
	]);

	// Seed section data
	const sections = new Map([
		[
			's1',
			{
				id: 's1',
				org_id: TEST_ORG_ID,
				name: 'Soprano 1',
				abbreviation: 'S1',
				parent_section_id: null,
				display_order: 1,
				is_active: 1
			}
		],
		[
			'a1',
			{
				id: 'a1',
				org_id: TEST_ORG_ID,
				name: 'Alto 1',
				abbreviation: 'A1',
				parent_section_id: null,
				display_order: 2,
				is_active: 1
			}
		]
	]);

	return {
		prepare: (sql: string) => ({
			bind: (...params: unknown[]) => ({
				run: async () => {
					// Handle INSERT INTO members (roster member creation)
					if (sql.startsWith('INSERT INTO members')) {
						const [id, name, email_id, email_contact, invited_by] = params as any[];
						members.set(id, {
							id,
							name,
							nickname: null, // Added for getMemberById compatibility
							email_id,
							email_contact,
							invited_by,
							joined_at: new Date().toISOString()
						});
						return { meta: { changes: 1 } };
					}

					// Handle INSERT INTO invites (roster-linked invitation)
					if (sql.startsWith('INSERT INTO invites')) {
						// Extract params: (id, org_id, roster_member_id, name, token, invited_by, expires_at, created_at)
						const [id, org_id, roster_member_id, name, token, invited_by, expires_at, created_at] =
							params as any[];

						const inviteData = {
							id,
							org_id,
							orgId: org_id, // Map for query compatibility
							roster_member_id,
							name,
							token,
							invited_by,
							expires_at,
							status: 'pending',
							created_at,
							accepted_at: null,
							accepted_by_email: null
						};
						invites.set(id, inviteData);
						invitesByToken.set(token, id); // Also index by token
						return { meta: { changes: 1 } };
					}

					// Handle UPDATE invites (mark as accepted) - DEPRECATED
					if (sql.startsWith('UPDATE invites') && sql.includes('accepted')) {
						const [accepted_at, accepted_by_email, token] = params as any[];
						const inviteId = invitesByToken.get(token as string);
						if (inviteId) {
							const invite = invites.get(inviteId);
							if (invite) {
								invite.status = 'accepted';
								invite.accepted_at = accepted_at;
								invite.accepted_by_email = accepted_by_email;
								invites.set(inviteId, invite);
							}
						}
						return { meta: { changes: 1 } };
					}

					// Handle DELETE invites (after acceptance)
					if (sql.startsWith('DELETE FROM invites')) {
						const [token] = params as any[];
						const inviteId = invitesByToken.get(token as string);
						if (inviteId) {
							invites.delete(inviteId);
							invitesByToken.delete(token as string);
							return { meta: { changes: 1 } };
						}
						return { meta: { changes: 0 } };
					}

					// Handle UPDATE members (upgrade to registered)
					if (sql.startsWith('UPDATE members') && sql.includes('email_id')) {
						const [email_id, id] = params as any[];
						const member = members.get(id as string);
						if (member) {
							member.email_id = email_id;
							members.set(id as string, member);
						}
						return { meta: { changes: 1 } };
					}

					// Handle INSERT INTO member_roles
					if (sql.startsWith('INSERT INTO member_roles')) {
						const [member_id, role] = params as any[];
						const existing = memberRoles.get(member_id as string) ?? [];
						memberRoles.set(member_id as string, [...existing, role as string]);
						return { meta: { changes: 1 } };
					}

					// Handle INSERT INTO member_organizations
					if (sql.startsWith('INSERT INTO member_organizations')) {
						const [member_id, org_id] = params as any[];
						const orgs = memberOrgs.get(member_id as string) ?? new Set();
						orgs.add(org_id as string);
						memberOrgs.set(member_id as string, orgs);
						return { meta: { changes: 1 } };
					}

					// Handle INSERT INTO member_voices
					if (sql.startsWith('INSERT INTO member_voices')) {
						const [member_id, voice_id, is_primary, assigned_by] = params as any[];
						const existing = memberVoices.get(member_id as string) ?? [];
						memberVoices.set(member_id as string, [
							...existing,
							{ voice_id: voice_id as string, is_primary: is_primary as number }
						]);
						return { meta: { changes: 1 } };
					}

					// Handle INSERT INTO member_sections
					if (sql.startsWith('INSERT INTO member_sections')) {
						const [member_id, section_id, is_primary, assigned_by] = params as any[];
						const existing = memberSections.get(member_id as string) ?? [];
						memberSections.set(member_id as string, [
							...existing,
							{ section_id: section_id as string, is_primary: is_primary as number }
						]);
						return { meta: { changes: 1 } };
					}

					return { meta: { changes: 0 } };
				},
				first: async () => {
					// Handle name uniqueness check (org-scoped)
					if (sql.includes('FROM members m') && sql.includes('member_organizations') && sql.includes('LOWER')) {
						const [name, org_id] = params as any[];
						for (const [id, member] of members.entries()) {
							const orgs = memberOrgs.get(id);
							if ((member.name as string).toLowerCase() === (name as string).toLowerCase() && orgs?.has(org_id as string)) {
								return { id };
							}
						}
						return null;
					}

					// Handle SELECT from invites by token
					if (sql.includes('FROM invites WHERE token = ?')) {
						const [token] = params as any[];
						const inviteId = invitesByToken.get(token);
						return inviteId ? invites.get(inviteId) ?? null : null;
					}

					// Handle SELECT from invites by id
					if (sql.includes('FROM invites WHERE id = ?')) {
						const [id] = params as any[];
						return invites.get(id) ?? null;
					}

					// Handle SELECT from invites by roster_member_id
					if (sql.includes('FROM invites WHERE roster_member_id = ?')) {
						const [roster_member_id] = params as any[];
						for (const invite of invites.values()) {
							if (
								invite.roster_member_id === roster_member_id &&
								invite.status === 'pending'
							) {
								return invite;
							}
						}
						return null;
					}

					// Handle SELECT from members by id (with JOIN member_organizations)
					if (sql.includes('FROM members') && sql.includes('member_organizations') && sql.includes('WHERE m.id')) {
						const [id] = params as any[];
						const member = members.get(id);
						return member ?? null;
					}

					// Handle SELECT from members by email_id
					if (sql.includes('FROM members WHERE email_id = ?')) {
						const [email_id] = params as any[];
						for (const member of members.values()) {
							if (member.email_id === email_id) {
								return member;
							}
						}
						return null;
					}

					// Handle SELECT from voices
					if (sql.includes('FROM voices WHERE id = ?')) {
						const [id] = params as any[];
						return voices.get(id) ?? null;
					}

					// Handle SELECT from sections
					if (sql.includes('FROM sections WHERE id = ?')) {
						const [id] = params as any[];
						return sections.get(id) ?? null;
					}

					return null;
				},
				all: async () => {
					// Handle SELECT sections WHERE id IN (...) for org validation
					if (sql.includes('FROM sections WHERE id IN')) {
						// params contains the list of section IDs
						const sectionIds = params as string[];
						const results = sectionIds
							.map((id) => sections.get(id))
							.filter((s) => s !== null);
						return { results };
					}

					// Handle SELECT member_roles
					if (sql.includes('FROM member_roles WHERE member_id = ?')) {
						const [member_id] = params as any[];
						const roles = memberRoles.get(member_id as string) ?? [];
						return { results: roles.map((role) => ({ role })) };
					}

					// Handle SELECT member_voices with JOIN
					if (sql.includes('FROM member_voices') && sql.includes('JOIN voices')) {
						const [member_id] = params as any[];
						const voiceAssignments = memberVoices.get(member_id as string) ?? [];
						const results = voiceAssignments
							.map((va) => {
								const voice = voices.get(va.voice_id);
								if (!voice) return null;
								return {
									voice_id: va.voice_id,
									is_primary: va.is_primary,
									...voice
								};
							})
							.filter((v) => v !== null);
						return { results };
					}

					// Handle SELECT member_sections with JOIN
					if (sql.includes('FROM member_sections') && sql.includes('JOIN sections')) {
						const [member_id] = params as any[];
						const sectionAssignments = memberSections.get(member_id as string) ?? [];
						const results = sectionAssignments
							.map((sa) => {
								const section = sections.get(sa.section_id);
								if (!section) return null;
								return {
									section_id: sa.section_id,
									is_primary: sa.is_primary,
									...section
								};
							})
							.filter((s) => s !== null);
						return { results };
					}

					return { results: [] };
				}
			})
		}),
		batch: async (statements: any[]) => {
			// Execute all statements sequentially
			for (const stmt of statements) {
				await stmt.run();
			}
			return [];
		}
	} as unknown as D1Database;
}

describe('createInvite (roster-linked)', () => {
	let mockDb: D1Database;
	let adminId: string;
	let rosterId: string;

	beforeEach(async () => {
		mockDb = createMockDb();

		// Create admin member
		adminId = 'admin123';
		await mockDb
			.prepare('INSERT INTO members (id, name, email_id, email_contact, invited_by) VALUES (?, ?, ?, ?, ?)')
			.bind(adminId, 'Admin', 'admin@test.com', null, null)
			.run();

		// Create roster member
		const rosterMember = await createRosterMember(mockDb, {
			name: 'John Doe',
			voiceIds: ['soprano'],
			sectionIds: ['s1'],
			addedBy: adminId,
			orgId: TEST_ORG_ID
		});
		rosterId = rosterMember.id;
	});

	it('creates invite linked to roster member', async () => {
		const invite = await createInvite(mockDb, {
			orgId: TEST_ORG_ID,
			rosterMemberId: rosterId,
			invited_by: adminId
		});

		expect(invite.roster_member_id).toBe(rosterId);
		expect(invite.roster_member_name).toBe('John Doe');
		// Note: voices/sections come from roster member (tested in members.spec.ts)
	});

	it('rejects invite for registered member', async () => {
		// Upgrade roster member to registered
		await mockDb
			.prepare('UPDATE members SET email_id = ? WHERE id = ?')
			.bind('john@test.com', rosterId)
			.run();

		await expect(
			createInvite(mockDb, {
				orgId: TEST_ORG_ID,
				rosterMemberId: rosterId,
				invited_by: adminId
			})
		).rejects.toThrow('already registered');
	});

	it('rejects duplicate pending invite', async () => {
		// Create first invite
		await createInvite(mockDb, {
			orgId: TEST_ORG_ID,
			rosterMemberId: rosterId,
			invited_by: adminId
		});

		// Try to create second invite for same roster member
		await expect(
			createInvite(mockDb, {
				orgId: TEST_ORG_ID,
				rosterMemberId: rosterId,
				invited_by: adminId
			})
		).rejects.toThrow('already has a pending invitation');
	});
});

describe('acceptInvite (roster upgrade)', () => {
	let mockDb: D1Database;
	let adminId: string;
	let rosterId: string;
	let inviteToken: string;

	beforeEach(async () => {
		mockDb = createMockDb();

		// Create admin member
		adminId = 'admin123';
		await mockDb
			.prepare('INSERT INTO members (id, name, email_id, email_contact, invited_by) VALUES (?, ?, ?, ?, ?)')
			.bind(adminId, 'Admin', 'admin@test.com', null, null)
			.run();

		// Create roster member with voices and sections
		const rosterMember = await createRosterMember(mockDb, {
			name: 'Jane Doe',
			voiceIds: ['alto'],
			sectionIds: ['a1'],
			addedBy: adminId,
			orgId: TEST_ORG_ID
		});
		rosterId = rosterMember.id;

		// Create invite
		const invite = await createInvite(mockDb, {
			orgId: TEST_ORG_ID,
			rosterMemberId: rosterId,
			invited_by: adminId
		});
		inviteToken = invite.token;
	});

	it('upgrades roster member to registered', async () => {
		const result = await acceptInvite(mockDb, inviteToken, 'jane@oauth.com');

		expect(result.success).toBe(true);
		expect(result.memberId).toBe(rosterId);

		// Verify member is upgraded
		const member = await getMemberById(mockDb, rosterId, TEST_ORG_ID);
		expect(member).toBeDefined();
		expect(member!.email_id).toBe('jane@oauth.com');
		expect(member!.name).toBe('Jane Doe');
	});

	it('preserves voices and sections from roster member', async () => {
		await acceptInvite(mockDb, inviteToken, 'jane@oauth.com');

		const member = await getMemberById(mockDb, rosterId, TEST_ORG_ID);
		// Note: Voice/section preservation is tested in members.spec.ts
		// Here we just verify the member was upgraded
		expect(member).toBeDefined();
		expect(member!.name).toBe('Jane Doe');
	});

	it('rejects already-accepted invite', async () => {
		await acceptInvite(mockDb, inviteToken, 'jane@oauth.com');

		const result = await acceptInvite(mockDb, inviteToken, 'another@test.com');
		expect(result.success).toBe(false);
		expect(result.error).toBe('Invalid invite token'); // Invite is deleted after acceptance
	});

	it('rejects expired invite', async () => {
		// Create invite with past expiration
		const expiredRoster = await createRosterMember(mockDb, {
			name: 'Expired User',
			addedBy: adminId,
			orgId: TEST_ORG_ID
		});

		const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 72).toISOString(); // 72 hours ago
		const token = 'expired-token';

		// Manually insert expired invite using production schema format
		// (id, org_id, roster_member_id, name, token, invited_by, expires_at, created_at)
		await mockDb
			.prepare(
				`INSERT INTO invites (id, org_id, roster_member_id, name, token, invited_by, expires_at, created_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.bind(
				'expired-id',
				TEST_ORG_ID,
				expiredRoster.id,
				'Expired User',
				token,
				adminId,
				pastDate,
				pastDate
			)
			.run();

		const result = await acceptInvite(mockDb, token, 'user@test.com');
		expect(result.success).toBe(false);
		expect(result.error).toBe('Invite has expired');
	});
});
