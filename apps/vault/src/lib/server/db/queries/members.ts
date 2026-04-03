// Shared query utilities for member/invite sections and voices
// Extracts duplicated query logic from members.ts, roster.ts, invites.ts

import { createOrgId, type OrgId } from '@polyphony/shared';
import type { Section, Voice } from '$lib/types';

/**
 * Database row interface for section queries
 * (used internally for snake_case → camelCase conversion)
 */
interface SectionRow {
	id: string;
	org_id: string;
	name: string;
	abbreviation: string;
	parent_section_id: string | null;
	display_order: number;
	is_active: number;
	is_primary: number; // Used for ordering only, not mapped to result
}

/**
 * Database row interface for voice queries
 * (used internally for snake_case → camelCase conversion)
 */
interface VoiceRow {
	id: string;
	name: string;
	abbreviation: string;
	category: 'vocal' | 'instrumental';
	range_group: string | null;
	display_order: number;
	is_active: number;
	is_primary: number; // Used for ordering only, not mapped to result
}

/**
 * Query all sections assigned to a member for an organization
 * Returns sections ordered by primary first, then display_order ASC
 */
export async function queryMemberSections(
	db: D1Database,
	memberId: string,
	orgId: OrgId
): Promise<Section[]> {
	const { results } = await db.prepare(
		`SELECT s.id, s.org_id, s.name, s.abbreviation, s.parent_section_id, s.display_order, s.is_active, ms.is_primary
		 FROM sections s
		 JOIN member_sections ms ON s.id = ms.section_id
		 WHERE ms.member_id = ? AND s.org_id = ?
		 ORDER BY ms.is_primary DESC, s.display_order ASC`
	).bind(memberId, orgId).all<SectionRow>();

	return results.map((row) => ({
		id: row.id,
		orgId: createOrgId(row.org_id),
		name: row.name,
		abbreviation: row.abbreviation,
		parentSectionId: row.parent_section_id,
		displayOrder: row.display_order,
		isActive: row.is_active === 1
	}));
}

/**
 * Query all voices assigned to a member for an organization
 * Returns voices ordered by primary first, then display_order ASC
 */
export async function queryMemberVoices(db: D1Database, memberId: string, orgId: OrgId): Promise<Voice[]> {
	const { results } = await db
		.prepare(
			`SELECT v.id, v.name, v.abbreviation, v.category, v.range_group, v.display_order, v.is_active, mv.is_primary
			 FROM voices v
			 JOIN member_voices mv ON v.id = mv.voice_id
			 WHERE mv.member_id = ? AND v.org_id = ?
			 ORDER BY mv.is_primary DESC, v.display_order ASC`
		)
		.bind(memberId, orgId)
		.all<VoiceRow>();

	return results.map((row) => ({
		id: row.id,
		name: row.name,
		abbreviation: row.abbreviation,
		category: row.category,
		rangeGroup: row.range_group,
		displayOrder: row.display_order,
		isActive: row.is_active === 1
	}));
}

/**
 * Query all sections assigned to an invite
 * Returns sections ordered by primary first, then display_order ASC
 */
export async function queryInviteSections(db: D1Database, inviteId: string): Promise<Section[]> {
	const { results } = await db
		.prepare(
			`SELECT s.id, s.org_id, s.name, s.abbreviation, s.parent_section_id, s.display_order, s.is_active, isc.is_primary
			 FROM sections s
			 JOIN invite_sections isc ON s.id = isc.section_id
			 WHERE isc.invite_id = ?
			 ORDER BY isc.is_primary DESC, s.display_order ASC`
		)
		.bind(inviteId)
		.all<SectionRow>();

	return results.map((row) => ({
		id: row.id,
		orgId: createOrgId(row.org_id),
		name: row.name,
		abbreviation: row.abbreviation,
		parentSectionId: row.parent_section_id,
		displayOrder: row.display_order,
		isActive: row.is_active === 1
	}));
}

/**
 * Query all voices assigned to an invite
 * Returns voices ordered by primary first, then display_order ASC
 */
export async function queryInviteVoices(db: D1Database, inviteId: string): Promise<Voice[]> {
	const { results } = await db
		.prepare(
			`SELECT v.id, v.name, v.abbreviation, v.category, v.range_group, v.display_order, v.is_active, iv.is_primary
			 FROM voices v
			 JOIN invite_voices iv ON v.id = iv.voice_id
			 WHERE iv.invite_id = ?
			 ORDER BY iv.is_primary DESC, v.display_order ASC`
		)
		.bind(inviteId)
		.all<VoiceRow>();

	return results.map((row) => ({
		id: row.id,
		name: row.name,
		abbreviation: row.abbreviation,
		category: row.category,
		rangeGroup: row.range_group,
		displayOrder: row.display_order,
		isActive: row.is_active === 1
	}));
}
