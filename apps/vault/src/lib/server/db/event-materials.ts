// Event materials query - personalized view for members
// Issue #122 - "What to Bring" section
// Joins event repertoire with member's assigned copies

import type { Work, Edition } from "$lib/types";

/**
 * Material information for a single edition in an event
 */
export interface EventMaterial {
  // Work info
  work: {
    id: string;
    title: string;
    composer: string | null;
  };
  // Edition info
  edition: {
    id: string;
    name: string;
    isPrimary: boolean; // Is this the primary edition for the work?
  };
  // Member's assigned copy (if any)
  assignedCopy: {
    id: string;
    copyNumber: string;
    condition: string;
    assignedAt: string;
  } | null;
  // Digital availability
  hasDigitalFile: boolean;
  // Warning flags
  needsCopy: boolean; // True if physical edition exists but member has no copy
}

/**
 * Full materials list for an event
 */
export interface EventMaterials {
  eventId: string;
  memberId: string;
  materials: EventMaterial[];
  summary: {
    totalWorks: number;
    totalEditions: number;
    copiesAssigned: number;
    digitalAvailable: number;
    warningCount: number; // Editions where member needs copy but doesn't have one
  };
}

// Database row type for the complex join query
interface MaterialRow {
  work_id: string;
  work_title: string;
  work_composer: string | null;
  edition_id: string;
  edition_name: string;
  is_primary: number;
  copy_id: string | null;
  copy_number: string | null;
  copy_condition: string | null;
  assigned_at: string | null;
  has_file: number | null;
  has_physical_copies: number;
}

/**
 * Get personalized materials list for a member attending an event
 *
 * Returns all editions in the event's repertoire with:
 * - The member's assigned copy (if any)
 * - Whether a digital file exists
 * - Warning if physical copies exist but member has none
 */
export async function getEventMaterialsForMember(
  db: D1Database,
  eventId: string,
  memberId: string,
): Promise<EventMaterials> {
  // Complex join query:
  // event_works → works (work info)
  // event_work_editions → editions (edition info)
  // LEFT JOIN edition_files (digital availability)
  // LEFT JOIN physical_copies + copy_assignments (member's assigned copy)

  const { results } = await db
    .prepare(
      `
		SELECT 
			w.id AS work_id,
			w.title AS work_title,
			w.composer AS work_composer,
			e.id AS edition_id,
			e.name AS edition_name,
			ewe.is_primary,
			pc.id AS copy_id,
			pc.copy_number,
			pc.condition AS copy_condition,
			ca.assigned_at,
			CASE WHEN ef.edition_id IS NOT NULL THEN 1 ELSE 0 END AS has_file,
			(SELECT COUNT(*) FROM physical_copies WHERE edition_id = e.id) AS has_physical_copies
		FROM event_works ew
		JOIN works w ON ew.work_id = w.id
		JOIN event_work_editions ewe ON ewe.event_work_id = ew.id
		JOIN editions e ON ewe.edition_id = e.id
		LEFT JOIN edition_files ef ON ef.edition_id = e.id
		LEFT JOIN physical_copies pc ON pc.edition_id = e.id
		LEFT JOIN copy_assignments ca ON ca.copy_id = pc.id 
			AND ca.member_id = ? 
			AND ca.returned_at IS NULL
		WHERE ew.event_id = ?
		ORDER BY ew.display_order ASC, ewe.is_primary DESC, e.name ASC
	`,
    )
    .bind(memberId, eventId)
    .all<MaterialRow>();

  // Process results - group by edition (may have multiple copies returned)
  const editionMap = new Map<string, EventMaterial>();

  for (const row of results) {
    const editionId = row.edition_id;

    // If we already have this edition and it has an assigned copy, skip
    // (We only want one copy per edition for this member)
    if (editionMap.has(editionId)) {
      const existing = editionMap.get(editionId)!;
      // If this row has an assigned copy and existing doesn't, update
      if (row.copy_id && !existing.assignedCopy) {
        existing.assignedCopy = {
          id: row.copy_id,
          copyNumber: row.copy_number!,
          condition: row.copy_condition!,
          assignedAt: row.assigned_at!,
        };
        existing.needsCopy = false;
      }
      continue;
    }

    const hasPhysicalCopies = row.has_physical_copies > 0;
    const hasAssignedCopy = row.copy_id !== null;

    editionMap.set(editionId, {
      work: {
        id: row.work_id,
        title: row.work_title,
        composer: row.work_composer,
      },
      edition: {
        id: row.edition_id,
        name: row.edition_name,
        isPrimary: row.is_primary === 1,
      },
      assignedCopy: hasAssignedCopy
        ? {
            id: row.copy_id!,
            copyNumber: row.copy_number!,
            condition: row.copy_condition!,
            assignedAt: row.assigned_at!,
          }
        : null,
      hasDigitalFile: row.has_file === 1,
      // Warning: physical copies exist but member doesn't have one
      needsCopy: hasPhysicalCopies && !hasAssignedCopy,
    });
  }

  const materials = Array.from(editionMap.values());

  // Count unique works
  const workIds = new Set(materials.map((m) => m.work.id));

  return {
    eventId,
    memberId,
    materials,
    summary: {
      totalWorks: workIds.size,
      totalEditions: materials.length,
      copiesAssigned: materials.filter((m) => m.assignedCopy !== null).length,
      digitalAvailable: materials.filter((m) => m.hasDigitalFile).length,
      warningCount: materials.filter((m) => m.needsCopy).length,
    },
  };
}
