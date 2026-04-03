// Inventory report queries
// Issue #123 - Missing Copies Report
// Part of Epic #106 - Phase D: Reports & Insights

export interface MissingCopyEntry {
  memberId: string;
  memberName: string;
  sectionId: string;
  sectionName: string;
  editionId: string;
  editionName: string;
  workId: string;
  workTitle: string;
  composer: string | null;
}

export interface MissingCopiesReport {
  entries: MissingCopyEntry[];
  totalMissing: number;
  editionCount: number;
}

interface MissingCopyRow {
  member_id: string;
  member_name: string;
  section_id: string;
  section_name: string;
  edition_id: string;
  edition_name: string;
  work_id: string;
  work_title: string;
  composer: string | null;
}

/**
 * Get missing copies report for an event
 *
 * Logic:
 * 1. Get all editions in event repertoire (event_works → event_work_editions)
 * 2. For each edition, find relevant sections (edition_sections)
 * 3. Find members in those sections (member_sections)
 * 4. Exclude members who already have a copy assigned (NOT EXISTS subquery)
 *
 * Uses NOT EXISTS pattern instead of LEFT JOIN + NULL check
 * to avoid row multiplication and allow SQLite short-circuit optimization.
 */
export async function getMissingCopiesForEvent(
  db: D1Database,
  eventId: string,
): Promise<MissingCopiesReport> {
  const query = `
		SELECT 
			m.id as member_id,
			m.name as member_name,
			s.id as section_id,
			s.name as section_name,
			e.id as edition_id,
			e.name as edition_name,
			w.id as work_id,
			w.title as work_title,
			w.composer
		FROM event_works ew
		JOIN event_work_editions ewe ON ewe.event_work_id = ew.id
		JOIN editions e ON e.id = ewe.edition_id
		JOIN works w ON w.id = e.work_id
		JOIN edition_sections es ON es.edition_id = e.id
		JOIN member_sections ms ON ms.section_id = es.section_id
		JOIN members m ON m.id = ms.member_id
		JOIN sections s ON s.id = ms.section_id
		WHERE ew.event_id = ?
			AND m.email_id IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 
				FROM physical_copies pc
				JOIN copy_assignments ca ON ca.copy_id = pc.id
				WHERE pc.edition_id = e.id
					AND ca.member_id = m.id
					AND ca.returned_at IS NULL
			)
		ORDER BY w.title, e.name, s.name, m.name
	`;

  const { results } = await db
    .prepare(query)
    .bind(eventId)
    .all<MissingCopyRow>();

  const entries: MissingCopyEntry[] = results.map((row) => ({
    memberId: row.member_id,
    memberName: row.member_name,
    sectionId: row.section_id,
    sectionName: row.section_name,
    editionId: row.edition_id,
    editionName: row.edition_name,
    workId: row.work_id,
    workTitle: row.work_title,
    composer: row.composer,
  }));

  const uniqueEditions = new Set(entries.map((e) => e.editionId));

  return {
    entries,
    totalMissing: entries.length,
    editionCount: uniqueEditions.size,
  };
}

// ============================================================================
// COLLECTION REMINDERS (Issue #126)
// ============================================================================

/**
 * Outstanding copy that needs to be collected
 */
export interface OutstandingCopy {
  assignmentId: string;
  memberId: string;
  memberName: string;
  editionId: string;
  editionName: string;
  workTitle: string;
  copyId: string;
  copyNumber: string;
  assignedAt: string;
}

/**
 * Outstanding copies grouped by member
 */
export interface OutstandingCopiesByMember {
  memberId: string;
  memberName: string;
  copies: OutstandingCopy[];
}

interface OutstandingCopyRow {
  assignment_id: string;
  member_id: string;
  member_name: string;
  edition_id: string;
  edition_name: string;
  work_title: string;
  copy_id: string;
  copy_number: string;
  assigned_at: string;
}

/**
 * Get all unreturned copies for editions in a season's repertoire
 *
 * Logic:
 * 1. Get all editions in season repertoire (season_works → season_work_editions)
 * 2. Find physical copies of those editions
 * 3. Return assignments that are still active (returned_at IS NULL)
 */
export async function getOutstandingCopiesForSeason(
  db: D1Database,
  seasonId: string,
): Promise<OutstandingCopiesByMember[]> {
  const query = `
		SELECT 
			ca.id as assignment_id,
			m.id as member_id,
			m.name as member_name,
			e.id as edition_id,
			e.name as edition_name,
			w.title as work_title,
			pc.id as copy_id,
			pc.copy_number,
			ca.assigned_at
		FROM season_works sw
		JOIN season_work_editions swe ON swe.season_work_id = sw.id
		JOIN editions e ON e.id = swe.edition_id
		JOIN works w ON w.id = e.work_id
		JOIN physical_copies pc ON pc.edition_id = e.id
		JOIN copy_assignments ca ON ca.copy_id = pc.id
		JOIN members m ON m.id = ca.member_id
		WHERE sw.season_id = ?
			AND ca.returned_at IS NULL
		ORDER BY m.name, w.title, e.name, pc.copy_number COLLATE NOCASE
	`;

  const { results } = await db
    .prepare(query)
    .bind(seasonId)
    .all<OutstandingCopyRow>();

  // Group by member
  const byMember = new Map<string, OutstandingCopiesByMember>();

  for (const row of results) {
    const copy: OutstandingCopy = {
      assignmentId: row.assignment_id,
      memberId: row.member_id,
      memberName: row.member_name,
      editionId: row.edition_id,
      editionName: row.edition_name,
      workTitle: row.work_title,
      copyId: row.copy_id,
      copyNumber: row.copy_number,
      assignedAt: row.assigned_at,
    };

    if (!byMember.has(row.member_id)) {
      byMember.set(row.member_id, {
        memberId: row.member_id,
        memberName: row.member_name,
        copies: [],
      });
    }
    byMember.get(row.member_id)!.copies.push(copy);
  }

  return Array.from(byMember.values());
}

/**
 * Bulk return multiple copies
 * Returns count of assignments actually marked as returned
 */
export async function bulkReturnCopies(
  db: D1Database,
  assignmentIds: string[],
): Promise<number> {
  if (assignmentIds.length === 0) return 0;

  const placeholders = assignmentIds.map(() => "?").join(",");
  const result = await db
    .prepare(
      `UPDATE copy_assignments SET returned_at = datetime('now') WHERE id IN (${placeholders}) AND returned_at IS NULL`,
    )
    .bind(...assignmentIds)
    .run();

  return result.meta.changes ?? 0;
}

/**
 * Get missing copies for a season
 * Uses season_works → season_work_editions instead of event_works
 */
export async function getMissingCopiesForSeason(
  db: D1Database,
  seasonId: string,
): Promise<MissingCopiesReport> {
  const query = `
		SELECT 
			m.id as member_id,
			m.name as member_name,
			s.id as section_id,
			s.name as section_name,
			e.id as edition_id,
			e.name as edition_name,
			w.id as work_id,
			w.title as work_title,
			w.composer
		FROM season_works sw
		JOIN season_work_editions swe ON swe.season_work_id = sw.id
		JOIN editions e ON e.id = swe.edition_id
		JOIN works w ON w.id = e.work_id
		JOIN edition_sections es ON es.edition_id = e.id
		JOIN member_sections ms ON ms.section_id = es.section_id
		JOIN members m ON m.id = ms.member_id
		JOIN sections s ON s.id = ms.section_id
		WHERE sw.season_id = ?
			AND m.email_id IS NOT NULL
			AND NOT EXISTS (
				SELECT 1 
				FROM physical_copies pc
				JOIN copy_assignments ca ON ca.copy_id = pc.id
				WHERE pc.edition_id = e.id
					AND ca.member_id = m.id
					AND ca.returned_at IS NULL
			)
		ORDER BY w.title, e.name, s.name, m.name
	`;

  const { results } = await db
    .prepare(query)
    .bind(seasonId)
    .all<MissingCopyRow>();

  const entries: MissingCopyEntry[] = results.map((row) => ({
    memberId: row.member_id,
    memberName: row.member_name,
    sectionId: row.section_id,
    sectionName: row.section_name,
    editionId: row.edition_id,
    editionName: row.edition_name,
    workId: row.work_id,
    workTitle: row.work_title,
    composer: row.composer,
  }));

  const uniqueEditions = new Set(entries.map((e) => e.editionId));

  return {
    entries,
    totalMissing: entries.length,
    editionCount: uniqueEditions.size,
  };
}
