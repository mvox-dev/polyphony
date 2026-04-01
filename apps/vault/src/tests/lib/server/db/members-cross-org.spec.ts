// TDD RED: Cross-org email lookup scoping — #303
// Bug: getMemberByEmailId ignores orgId in SQL, returns members from any org
/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, beforeEach } from 'vitest';
import { createOrgId } from '@polyphony/shared';
import {
	createMember,
	createRosterMember,
	upgradeToRegistered,
	getMemberByEmailId
} from '../../../../lib/server/db/members.js';

const ORG_A = createOrgId('org_alpha');
const ORG_B = createOrgId('org_beta');

/**
 * Enhanced mock that tracks member_organizations junction table,
 * enabling cross-org isolation testing.
 */
const createCrossOrgMockDb = () => {
	const members = new Map<
		string,
		{
			id: string;
			name: string;
			nickname: string | null;
			email_id: string | null;
			email_contact: string | null;
			invited_by: string | null;
			joined_at: string;
		}
	>();
	const memberOrgs = new Map<string, Set<string>>(); // member_id → Set<org_id>
	const memberRoles = new Map<string, string[]>();
	const memberVoices = new Map<string, { voice_id: string; is_primary: number }[]>();
	const memberSections = new Map<string, { section_id: string; is_primary: number }[]>();

	return {
		prepare: (sql: string) => {
			const result = {
				all: async () => {
					// SELECT all members via member_organizations (getAllMembers with orgId)
					if (sql.includes('FROM members') && sql.includes('member_organizations')) {
						return { results: Array.from(members.values()) };
					}
					// SELECT roles for member
					if (sql.includes('FROM member_roles')) {
						return { results: [] };
					}
					// SELECT voices for member (JOIN with voices table)
					if (sql.includes('FROM voices') && sql.includes('JOIN member_voices')) {
						return { results: [] };
					}
					// SELECT sections for member (JOIN with sections table)
					if (sql.includes('FROM sections') && sql.includes('JOIN member_sections')) {
						return { results: [] };
					}
					return { results: [] };
				},
				bind: (...params: unknown[]) => ({
					run: async () => {
						// INSERT INTO members (createMember: VALUES (?, ?, ?, NULL, ?))
						if (sql.includes('INSERT INTO members') && sql.includes(', NULL, ?)')) {
							const [id, name, email_id, invited_by] = params as [string, string, string, string | null];
							members.set(id, {
								id, name, nickname: null, email_id,
								email_contact: null, invited_by,
								joined_at: new Date().toISOString()
							});
							return { success: true, meta: { changes: 1 } };
						}
						// INSERT INTO members (createRosterMember: VALUES (?, ?, NULL, ?, ?))
						if (sql.includes('INSERT INTO members') && sql.includes('NULL, ?, ?)')) {
							const [id, name, email_contact, invited_by] = params as [string, string, string | null, string];
							members.set(id, {
								id, name, nickname: null, email_id: null,
								email_contact, invited_by,
								joined_at: new Date().toISOString()
							});
							return { success: true, meta: { changes: 1 } };
						}
						// INSERT INTO member_organizations
						if (sql.includes('INSERT INTO member_organizations')) {
							const [member_id, org_id] = params as [string, string];
							if (!memberOrgs.has(member_id)) memberOrgs.set(member_id, new Set());
							memberOrgs.get(member_id)!.add(org_id);
							return { success: true, meta: { changes: 1 } };
						}
						// INSERT INTO member_roles
						if (sql.includes('INSERT INTO member_roles')) {
							const [member_id, _org_id, role] = params as [string, string, string];
							const roles = memberRoles.get(member_id) || [];
							roles.push(role);
							memberRoles.set(member_id, roles);
							return { success: true };
						}
						// UPDATE members SET email_id (for upgradeToRegistered)
						if (sql.includes('UPDATE members SET email_id')) {
							const [email_id, id] = params as [string, string];
							const member = members.get(id);
							if (member) {
								member.email_id = email_id;
								members.set(id, member);
							}
							return { success: true, meta: { changes: 1 } };
						}
						return { success: true };
					},
					first: async () => {
						// SELECT member by id (with JOIN member_organizations)
						// Must come before email_id check because this SQL also contains 'email_id' in SELECT
						if (sql.includes('FROM members') && sql.includes('WHERE m.id')) {
							const id = params[0] as string;
							const orgId = params[1] as string;
							const member = members.get(id);
							if (member) {
								const orgs = memberOrgs.get(member.id);
								if (orgs && orgs.has(orgId)) return member;
							}
							return null;
						}
						// SELECT member by email_id — org-scoped (fixed query with JOIN member_organizations)
						if (sql.includes('FROM members') && sql.includes('WHERE') && sql.includes('email_id') && sql.includes('member_organizations')) {
							const emailId = params[0] as string;
							const orgId = params[1] as string;
							for (const member of members.values()) {
								if (member.email_id === emailId) {
									const orgs = memberOrgs.get(member.id);
									if (orgs && orgs.has(orgId)) return member;
								}
							}
							return null;
						}
						// SELECT member by email_id — global (current buggy query, no JOIN)
						if (sql.includes('FROM members') && sql.includes('WHERE email_id =')) {
							const emailId = params[0] as string;
							for (const member of members.values()) {
								if (member.email_id === emailId) return member;
							}
							return null;
						}
						// SELECT member by name (case-insensitive) with org scope
						if (sql.includes('FROM members') && sql.includes('LOWER(name)') && sql.includes('member_organizations')) {
							const name = params[0] as string;
							const orgId = params[1] as string;
							for (const member of members.values()) {
								if (member.name.toLowerCase() === name.toLowerCase()) {
									const orgs = memberOrgs.get(member.id);
									if (orgs && orgs.has(orgId)) return member;
								}
							}
							return null;
						}
						// SELECT member by name (case-insensitive) — fallback
						if (sql.includes('FROM members') && sql.includes('LOWER(name)')) {
							const name = params[0] as string;
							for (const member of members.values()) {
								if (member.name.toLowerCase() === name.toLowerCase()) return member;
							}
							return null;
						}
						return null;
					},
					all: async () => {
						// SELECT roles for member
						if (sql.includes('FROM member_roles')) {
							const member_id = params[0] as string;
							const roles = memberRoles.get(member_id) || [];
							return { results: roles.map((role) => ({ role })) };
						}
						// SELECT voices for member
						if (sql.includes('FROM voices') && sql.includes('JOIN member_voices')) {
							return { results: [] };
						}
						// SELECT sections for member
						if (sql.includes('FROM sections') && sql.includes('JOIN member_sections')) {
							return { results: [] };
						}
						return { results: [] };
					}
				})
			};
			return result;
		},
		batch: async (statements: any[]) => {
			const results = [];
			for (const stmt of statements) {
				const result = await stmt.run();
				results.push(result);
			}
			return results;
		}
	} as unknown as D1Database;
};

describe('Cross-org email lookup scoping (#303)', () => {
	let db: D1Database;

	beforeEach(() => {
		db = createCrossOrgMockDb();
	});

	describe('getMemberByEmailId', () => {
		it('should return null when email exists in a different org but not the queried org', async () => {
			// Create a member in org A
			await createMember(db, {
				email: 'singer@choir.org',
				name: 'Singer in A',
				roles: ['librarian'],
				orgId: ORG_A
			});

			// Look up the same email in org B — should NOT find it
			const found = await getMemberByEmailId(db, 'singer@choir.org', ORG_B);
			expect(found).toBeNull();
		});

		it('should return the member when email exists in the queried org', async () => {
			// Create a member in org A
			const created = await createMember(db, {
				email: 'singer@choir.org',
				name: 'Singer in A',
				roles: ['librarian'],
				orgId: ORG_A
			});

			// Look up in org A — should find it
			const found = await getMemberByEmailId(db, 'singer@choir.org', ORG_A);
			expect(found).not.toBeNull();
			expect(found?.id).toBe(created.id);
			expect(found?.email_id).toBe('singer@choir.org');
		});
	});

	describe('upgradeToRegistered', () => {
		it('should succeed when same email exists in a different org', async () => {
			// Register singer@choir.org in org A
			await createMember(db, {
				email: 'singer@choir.org',
				name: 'Singer in A',
				roles: ['librarian'],
				orgId: ORG_A
			});

			// Create a roster member in org B (no email yet)
			const rosterMember = await createRosterMember(db, {
				name: 'Singer in B',
				roles: ['librarian'],
				addedBy: 'admin-b',
				orgId: ORG_B
			});

			// Upgrade the org B roster member with the same email — should succeed
			// because the email collision is in a different org
			const upgraded = await upgradeToRegistered(
				db,
				rosterMember.id,
				'singer@choir.org',
				ORG_B
			);

			expect(upgraded).toBeDefined();
			expect(upgraded.email_id).toBe('singer@choir.org');
		});

		it('should reject when email is already registered to a different member in the same org', async () => {
			// Register singer@choir.org in org A
			await createMember(db, {
				email: 'singer@choir.org',
				name: 'Existing Singer',
				roles: ['librarian'],
				orgId: ORG_A
			});

			// Create a different roster member in the SAME org A
			const rosterMember = await createRosterMember(db, {
				name: 'New Roster Member',
				roles: ['librarian'],
				addedBy: 'admin-a',
				orgId: ORG_A
			});

			// Try to upgrade with the same email in the same org — should throw
			await expect(
				upgradeToRegistered(db, rosterMember.id, 'singer@choir.org', ORG_A)
			).rejects.toThrow('Email already registered to another member');
		});
	});
});
