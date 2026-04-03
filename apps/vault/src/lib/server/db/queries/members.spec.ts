import { describe, it, expect, beforeEach } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import { createOrgId } from '@polyphony/shared';
import {
	queryMemberSections,
	queryMemberVoices,
	queryInviteSections,
	queryInviteVoices
} from './members';
import type { Section, Voice } from '$lib/types';

const TEST_ORG_ID = createOrgId('org_test_001');

// Mock D1Database
function createMockDB() {
	const mockState = {
		sections: new Map<string, any>(),
		voices: new Map<string, any>(),
		memberSections: new Map<string, any[]>(),
		memberVoices: new Map<string, any[]>(),
		inviteSections: new Map<string, any[]>(),
		inviteVoices: new Map<string, any[]>()
	};

	const db = {
		prepare: (sql: string) => {
			let params: any[] = [];

			return {
				bind: (...bindParams: any[]) => {
					params = bindParams;
					return {
						all: async () => {
							// Member sections query
							if (sql.includes('member_sections ms') && sql.includes('ms.member_id = ?')) {
								const [memberId] = params;
								const memberSecs = mockState.memberSections.get(memberId) || [];
								const results = memberSecs.map((ms) => {
									const section = mockState.sections.get(ms.section_id);
									return {
										...section,
										is_primary: ms.is_primary
									};
								});
								return { results };
							}

							// Member voices query
							if (sql.includes('member_voices mv') && sql.includes('mv.member_id = ?')) {
								const [memberId, orgId] = params;
								const memberVcs = mockState.memberVoices.get(memberId) || [];
								const results = memberVcs
									.map((mv) => {
										const voice = mockState.voices.get(mv.voice_id);
										return {
											...voice,
											is_primary: mv.is_primary
										};
									})
									.filter((v) => !orgId || v.org_id === orgId);
								return { results };
							}

							// Invite sections query
							if (sql.includes('invite_sections isc') && sql.includes('isc.invite_id = ?')) {
								const [inviteId] = params;
								const inviteSecs = mockState.inviteSections.get(inviteId) || [];
								const results = inviteSecs.map((isc) => {
									const section = mockState.sections.get(isc.section_id);
									return {
										...section,
										is_primary: isc.is_primary
									};
								});
								return { results };
							}

							// Invite voices query
							if (sql.includes('invite_voices iv') && sql.includes('iv.invite_id = ?')) {
								const [inviteId] = params;
								const inviteVcs = mockState.inviteVoices.get(inviteId) || [];
								const results = inviteVcs.map((iv) => {
									const voice = mockState.voices.get(iv.voice_id);
									return {
										...voice,
										is_primary: iv.is_primary
									};
								});
								return { results };
							}

							return { results: [] };
						}
					};
				}
			};
		},
		__mockState: mockState
	} as D1Database & { __mockState: typeof mockState };

	return db;
}

describe('Member Query Utilities', () => {
	let mockDb: D1Database & { __mockState: any };

	beforeEach(() => {
		mockDb = createMockDB();
	});

	describe('queryMemberSections', () => {
		it('should return empty array when member has no sections', async () => {
			const result = await queryMemberSections(mockDb, 'mem_1', TEST_ORG_ID);

			expect(result).toEqual([]);
		});

		it('should return single section with correct type conversion', async () => {
			// Seed data
			mockDb.__mockState.sections.set('sec_1', {
				id: 'sec_1',
				name: 'Soprano 1',
				abbreviation: 'S1',
				parent_section_id: null,
				display_order: 1,
				is_active: 1
			});

			mockDb.__mockState.memberSections.set('mem_1', [
				{ section_id: 'sec_1', is_primary: 1 }
			]);

			const result = await queryMemberSections(mockDb, 'mem_1', TEST_ORG_ID);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				id: 'sec_1',
				name: 'Soprano 1',
				abbreviation: 'S1',
				parentSectionId: null,
				displayOrder: 1,
				isActive: true
			});
		});

		it('should return multiple sections ordered by primary first, then display_order', async () => {
			// Seed sections
			mockDb.__mockState.sections.set('sec_1', {
				id: 'sec_1',
				name: 'Soprano 1',
				abbreviation: 'S1',
				parent_section_id: null,
				display_order: 1,
				is_active: 1
			});
			mockDb.__mockState.sections.set('sec_2', {
				id: 'sec_2',
				name: 'Alto',
				abbreviation: 'A',
				parent_section_id: null,
				display_order: 2,
				is_active: 1
			});
			mockDb.__mockState.sections.set('sec_3', {
				id: 'sec_3',
				name: 'Tenor',
				abbreviation: 'T',
				parent_section_id: null,
				display_order: 3,
				is_active: 1
			});

			// Member has multiple sections: Alto (primary), Soprano 1, Tenor
			mockDb.__mockState.memberSections.set('mem_1', [
				{ section_id: 'sec_2', is_primary: 1 }, // Alto - primary
				{ section_id: 'sec_1', is_primary: 0 }, // S1
				{ section_id: 'sec_3', is_primary: 0 }  // Tenor
			]);

			const result = await queryMemberSections(mockDb, 'mem_1', TEST_ORG_ID);

			expect(result).toHaveLength(3);
			// Primary first
			expect(result[0].id).toBe('sec_2');
			expect(result[0].name).toBe('Alto');
			// Then by display_order
			expect(result[1].id).toBe('sec_1');
			expect(result[2].id).toBe('sec_3');
		});

		it('should convert is_active number to boolean', async () => {
			mockDb.__mockState.sections.set('sec_1', {
				id: 'sec_1',
				name: 'Soprano 1',
				abbreviation: 'S1',
				parent_section_id: null,
				display_order: 1,
				is_active: 0 // Inactive
			});

			mockDb.__mockState.memberSections.set('mem_1', [
				{ section_id: 'sec_1', is_primary: 1 }
			]);

			const result = await queryMemberSections(mockDb, 'mem_1', TEST_ORG_ID);

			expect(result[0].isActive).toBe(false);
		});
	});

	describe('queryMemberVoices', () => {
		it('should return empty array when member has no voices', async () => {
			const result = await queryMemberVoices(mockDb, 'mem_1', TEST_ORG_ID);

			expect(result).toEqual([]);
		});

		it('should return single voice with correct type conversion', async () => {
			mockDb.__mockState.voices.set('voice_1', {
				id: 'voice_1',
				name: 'Soprano',
				abbreviation: 'S',
				category: 'vocal',
				range_group: 'high',
				display_order: 1,
				is_active: 1,
				org_id: 'org_test_001'
			});

			mockDb.__mockState.memberVoices.set('mem_1', [
				{ voice_id: 'voice_1', is_primary: 1 }
			]);

			const result = await queryMemberVoices(mockDb, 'mem_1', TEST_ORG_ID);

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				id: 'voice_1',
				name: 'Soprano',
				abbreviation: 'S',
				category: 'vocal',
				rangeGroup: 'high',
				displayOrder: 1,
				isActive: true
			});
		});

		it('should return multiple voices ordered by primary first, then display_order', async () => {
			mockDb.__mockState.voices.set('voice_1', {
				id: 'voice_1',
				name: 'Soprano',
				abbreviation: 'S',
				category: 'vocal',
				range_group: 'high',
				display_order: 1,
				is_active: 1,
				org_id: 'org_test_001'
			});
			mockDb.__mockState.voices.set('voice_2', {
				id: 'voice_2',
				name: 'Alto',
				abbreviation: 'A',
				category: 'vocal',
				range_group: 'mid',
				display_order: 2,
				is_active: 1,
				org_id: 'org_test_001'
			});

			mockDb.__mockState.memberVoices.set('mem_1', [
				{ voice_id: 'voice_2', is_primary: 1 }, // Alto - primary
				{ voice_id: 'voice_1', is_primary: 0 }  // Soprano
			]);

			const result = await queryMemberVoices(mockDb, 'mem_1', TEST_ORG_ID);

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('voice_2');
			expect(result[1].id).toBe('voice_1');
		});

		it('should handle null range_group', async () => {
			mockDb.__mockState.voices.set('voice_1', {
				id: 'voice_1',
				name: 'Piano',
				abbreviation: 'Pno',
				category: 'instrumental',
				range_group: null,
				display_order: 10,
				is_active: 1,
				org_id: 'org_test_001'
			});

			mockDb.__mockState.memberVoices.set('mem_1', [
				{ voice_id: 'voice_1', is_primary: 1 }
			]);

			const result = await queryMemberVoices(mockDb, 'mem_1', TEST_ORG_ID);

			expect(result[0].rangeGroup).toBeNull();
		});

		it('should exclude voices that belong to a different org', async () => {
			const OTHER_ORG_ID = createOrgId('org_other_001');

			mockDb.__mockState.voices.set('voice_own', {
				id: 'voice_own',
				name: 'Soprano',
				abbreviation: 'S',
				category: 'vocal',
				range_group: 'high',
				display_order: 1,
				is_active: 1,
				org_id: 'org_test_001'  // belongs to TEST_ORG_ID
			});
			mockDb.__mockState.voices.set('voice_foreign', {
				id: 'voice_foreign',
				name: 'Tenor',
				abbreviation: 'T',
				category: 'vocal',
				range_group: 'low',
				display_order: 2,
				is_active: 1,
				org_id: 'org_other_001' // belongs to OTHER_ORG_ID
			});

			mockDb.__mockState.memberVoices.set('mem_1', [
				{ voice_id: 'voice_own', is_primary: 1 },
				{ voice_id: 'voice_foreign', is_primary: 0 }
			]);

			const result = await queryMemberVoices(mockDb, 'mem_1', TEST_ORG_ID);

			// Only the voice belonging to TEST_ORG_ID should be returned
			expect(result).toHaveLength(1);
			expect(result[0].id).toBe('voice_own');
		});
	});

	describe('queryInviteSections', () => {
		it('should return empty array when invite has no sections', async () => {
			const result = await queryInviteSections(mockDb, 'inv_1');

			expect(result).toEqual([]);
		});

		it('should return single section with correct type conversion', async () => {
			mockDb.__mockState.sections.set('sec_1', {
				id: 'sec_1',
				name: 'Soprano 1',
				abbreviation: 'S1',
				parent_section_id: null,
				display_order: 1,
				is_active: 1
			});

			mockDb.__mockState.inviteSections.set('inv_1', [
				{ section_id: 'sec_1', is_primary: 1 }
			]);

			const result = await queryInviteSections(mockDb, 'inv_1');

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				id: 'sec_1',
				name: 'Soprano 1',
				abbreviation: 'S1',
				parentSectionId: null,
				displayOrder: 1,
				isActive: true
			});
		});

		it('should return multiple sections ordered by primary first, then display_order', async () => {
			mockDb.__mockState.sections.set('sec_1', {
				id: 'sec_1',
				name: 'Soprano 1',
				abbreviation: 'S1',
				parent_section_id: null,
				display_order: 1,
				is_active: 1
			});
			mockDb.__mockState.sections.set('sec_2', {
				id: 'sec_2',
				name: 'Alto',
				abbreviation: 'A',
				parent_section_id: null,
				display_order: 2,
				is_active: 1
			});

			mockDb.__mockState.inviteSections.set('inv_1', [
				{ section_id: 'sec_2', is_primary: 1 },
				{ section_id: 'sec_1', is_primary: 0 }
			]);

			const result = await queryInviteSections(mockDb, 'inv_1');

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('sec_2'); // Primary first
			expect(result[1].id).toBe('sec_1');
		});
	});

	describe('queryInviteVoices', () => {
		it('should return empty array when invite has no voices', async () => {
			const result = await queryInviteVoices(mockDb, 'inv_1');

			expect(result).toEqual([]);
		});

		it('should return single voice with correct type conversion', async () => {
			mockDb.__mockState.voices.set('voice_1', {
				id: 'voice_1',
				name: 'Soprano',
				abbreviation: 'S',
				category: 'vocal',
				range_group: 'high',
				display_order: 1,
				is_active: 1
			});

			mockDb.__mockState.inviteVoices.set('inv_1', [
				{ voice_id: 'voice_1', is_primary: 1 }
			]);

			const result = await queryInviteVoices(mockDb, 'inv_1');

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				id: 'voice_1',
				name: 'Soprano',
				abbreviation: 'S',
				category: 'vocal',
				rangeGroup: 'high',
				displayOrder: 1,
				isActive: true
			});
		});

		it('should return multiple voices ordered by primary first, then display_order', async () => {
			mockDb.__mockState.voices.set('voice_1', {
				id: 'voice_1',
				name: 'Soprano',
				abbreviation: 'S',
				category: 'vocal',
				range_group: 'high',
				display_order: 1,
				is_active: 1
			});
			mockDb.__mockState.voices.set('voice_2', {
				id: 'voice_2',
				name: 'Alto',
				abbreviation: 'A',
				category: 'vocal',
				range_group: 'mid',
				display_order: 2,
				is_active: 1
			});

			mockDb.__mockState.inviteVoices.set('inv_1', [
				{ voice_id: 'voice_2', is_primary: 1 },
				{ voice_id: 'voice_1', is_primary: 0 }
			]);

			const result = await queryInviteVoices(mockDb, 'inv_1');

			expect(result).toHaveLength(2);
			expect(result[0].id).toBe('voice_2');
			expect(result[1].id).toBe('voice_1');
		});
	});
});
