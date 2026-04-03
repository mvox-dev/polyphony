// Physical copies database operations
// Part of Epic #106 - Phase B: Physical Inventory

import type { OrgId } from "@polyphony/shared";
import type { CopyCondition } from "$lib/types";
import { generateId } from "$lib/server/utils/id";

// Re-export for consumers that import from here
export type { CopyCondition };

export interface PhysicalCopy {
  id: string;
  editionId: string;
  copyNumber: string;
  condition: CopyCondition;
  acquiredAt: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CreatePhysicalCopyInput {
  editionId: string;
  copyNumber: string;
  condition?: CopyCondition;
  acquiredAt?: string;
  notes?: string;
}

export interface BatchCreateInput {
  editionId: string;
  count: number;
  prefix?: string; // e.g., "M" → "M-01", "M-02", ...
  startNumber?: number; // Default 1
  condition?: CopyCondition;
  acquiredAt?: string;
}

export interface UpdatePhysicalCopyInput {
  condition?: CopyCondition;
  notes?: string | null;
  acquiredAt?: string | null;
}

interface PhysicalCopyRow {
  id: string;
  edition_id: string;
  copy_number: string;
  condition: string;
  acquired_at: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * Convert database row to PhysicalCopy interface
 */
function rowToCopy(row: PhysicalCopyRow): PhysicalCopy {
  return {
    id: row.id,
    editionId: row.edition_id,
    copyNumber: row.copy_number,
    condition: row.condition as CopyCondition,
    acquiredAt: row.acquired_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/**
 * Create a single physical copy
 */
export async function createPhysicalCopy(
  db: D1Database,
  input: CreatePhysicalCopyInput,
): Promise<PhysicalCopy> {
  const id = generateId();
  const condition = input.condition ?? "good";
  const acquiredAt = input.acquiredAt ?? null;
  const notes = input.notes ?? null;
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO physical_copies (id, edition_id, copy_number, condition, acquired_at, notes)
			 VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.editionId, input.copyNumber, condition, acquiredAt, notes)
    .run();

  return {
    id,
    editionId: input.editionId,
    copyNumber: input.copyNumber,
    condition,
    acquiredAt,
    notes,
    createdAt: now,
  };
}

/**
 * Generate copy number entries for batch creation
 */
function generateCopyNumbers(
  startNumber: number,
  count: number,
  prefix: string,
): { id: string; copyNumber: string }[] {
  const maxNumber = startNumber + count - 1;
  const padWidth = String(maxNumber).length;

  return Array.from({ length: count }, (_, i) => {
    const num = startNumber + i;
    const paddedNum = String(num).padStart(padWidth, "0");
    const copyNumber = prefix ? `${prefix}-${paddedNum}` : paddedNum;
    return { id: generateId(), copyNumber };
  });
}

/**
 * Create multiple physical copies with auto-generated numbers
 * Numbers are zero-padded based on total count (e.g., 01-99 for count < 100)
 * If startNumber is not specified, automatically finds the next available number
 */
export async function batchCreatePhysicalCopies(
  db: D1Database,
  input: BatchCreateInput,
  orgId: OrgId,
): Promise<PhysicalCopy[]> {
  const {
    editionId,
    count,
    prefix = "",
    condition = "good",
    acquiredAt,
  } = input;

  if (count <= 0) {
    throw new Error("Count must be positive");
  }

  const startNumber =
    input.startNumber ??
    (await getNextAvailableCopyNumber(db, editionId, prefix));
  const copies = generateCopyNumbers(startNumber, count, prefix);

  // Batch insert
  const statements = copies.map((copy) =>
    db
      .prepare(
        `INSERT INTO physical_copies (id, edition_id, copy_number, condition, acquired_at)
				 VALUES (?, ?, ?, ?, ?)`,
      )
      .bind(copy.id, editionId, copy.copyNumber, condition, acquiredAt ?? null),
  );

  await db.batch(statements);

  return getPhysicalCopiesByEdition(db, editionId, orgId);
}

/**
 * Find the next available copy number for an edition
 * Parses existing copy numbers to find the highest and returns highest + 1
 */
async function getNextAvailableCopyNumber(
  db: D1Database,
  editionId: string,
  prefix: string,
): Promise<number> {
  // Get all existing copy numbers for this edition
  const { results } = await db
    .prepare("SELECT copy_number FROM physical_copies WHERE edition_id = ?")
    .bind(editionId)
    .all<{ copy_number: string }>();

  if (!results || results.length === 0) {
    return 1;
  }

  // Find the highest number
  let maxNum = 0;
  for (const row of results) {
    const copyNumber = row.copy_number;
    // Try to extract the numeric part
    let numStr: string;
    if (prefix && copyNumber.startsWith(`${prefix}-`)) {
      numStr = copyNumber.slice(prefix.length + 1);
    } else if (!prefix) {
      numStr = copyNumber;
    } else {
      // Different prefix, skip
      continue;
    }

    const num = parseInt(numStr, 10);
    if (!isNaN(num) && num > maxNum) {
      maxNum = num;
    }
  }

  return maxNum + 1;
}

/**
 * Get a physical copy by ID, scoped to organization (via editions → works JOIN)
 */
export async function getPhysicalCopyById(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<PhysicalCopy | null> {
  const row = await db
    .prepare(
      `
			SELECT pc.id, pc.edition_id, pc.copy_number, pc.condition,
				pc.acquired_at, pc.notes, pc.created_at
			FROM physical_copies pc
			JOIN editions e ON pc.edition_id = e.id
			JOIN works w ON e.work_id = w.id
			WHERE pc.id = ? AND w.org_id = ?
		`,
    )
    .bind(id, orgId)
    .first<PhysicalCopyRow>();

  return row ? rowToCopy(row) : null;
}

/**
 * Get all physical copies for an edition, scoped to organization (via editions → works JOIN)
 */
export async function getPhysicalCopiesByEdition(
  db: D1Database,
  editionId: string,
  orgId: OrgId,
): Promise<PhysicalCopy[]> {
  const { results } = await db
    .prepare(
      `SELECT pc.id, pc.edition_id, pc.copy_number, pc.condition,
				pc.acquired_at, pc.notes, pc.created_at
			 FROM physical_copies pc
			 JOIN editions e ON pc.edition_id = e.id
			 JOIN works w ON e.work_id = w.id
			 WHERE pc.edition_id = ? AND w.org_id = ?
			 ORDER BY pc.copy_number COLLATE NOCASE`,
    )
    .bind(editionId, orgId)
    .all<PhysicalCopyRow>();

  return results.map(rowToCopy);
}

interface UpdateQuery {
  updates: string[];
  values: (string | null)[];
}

function buildUpdateQuery(input: UpdatePhysicalCopyInput): UpdateQuery {
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (input.condition !== undefined) {
    updates.push("condition = ?");
    values.push(input.condition);
  }
  if (input.notes !== undefined) {
    updates.push("notes = ?");
    values.push(input.notes);
  }
  if (input.acquiredAt !== undefined) {
    updates.push("acquired_at = ?");
    values.push(input.acquiredAt);
  }
  return { updates, values };
}

/**
 * Update a physical copy (condition, notes, acquired_at), scoped to organization
 */
export async function updatePhysicalCopy(
  db: D1Database,
  id: string,
  input: UpdatePhysicalCopyInput,
  orgId: OrgId,
): Promise<PhysicalCopy | null> {
  // Verify the copy belongs to this org before updating
  const existing = await getPhysicalCopyById(db, id, orgId);
  if (!existing) return null;

  const { updates, values } = buildUpdateQuery(input);
  if (updates.length === 0) return existing;

  values.push(id);
  await db
    .prepare(`UPDATE physical_copies SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();

  return getPhysicalCopyById(db, id, orgId);
}

/**
 * Delete a physical copy, scoped to organization
 */
export async function deletePhysicalCopy(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<boolean> {
  // Verify the copy belongs to this org before deleting
  const existing = await getPhysicalCopyById(db, id, orgId);
  if (!existing) return false;

  const result = await db
    .prepare("DELETE FROM physical_copies WHERE id = ?")
    .bind(id)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Check if a copy number already exists for an edition
 */
export async function copyNumberExists(
  db: D1Database,
  editionId: string,
  copyNumber: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT 1 FROM physical_copies WHERE edition_id = ? AND copy_number = ?",
    )
    .bind(editionId, copyNumber)
    .first();

  return row !== null;
}

/**
 * Get copy counts by condition for an edition
 */
export async function getCopyStats(
  db: D1Database,
  editionId: string,
): Promise<{
  total: number;
  good: number;
  fair: number;
  poor: number;
  lost: number;
}> {
  const { results } = await db
    .prepare(
      `SELECT condition, COUNT(*) as count 
			 FROM physical_copies 
			 WHERE edition_id = ? 
			 GROUP BY condition`,
    )
    .bind(editionId)
    .all<{ condition: string; count: number }>();

  const stats = { total: 0, good: 0, fair: 0, poor: 0, lost: 0 };

  for (const row of results) {
    const count = row.count;
    stats.total += count;
    if (row.condition in stats) {
      stats[row.condition as keyof typeof stats] = count;
    }
  }

  return stats;
}

// ============================================================================
// INVENTORY REPORT QUERIES (Issue #118)
// ============================================================================

export interface EditionInventorySummary {
  editionId: string;
  editionName: string;
  workTitle: string;
  composer: string | null;
  total: number;
  available: number; // good/fair/poor AND not assigned
  assigned: number; // currently checked out
  lost: number;
}

/**
 * Get inventory summary for all editions with physical copies, scoped to organization
 */
export async function getEditionInventorySummaries(
  db: D1Database,
  orgId: OrgId,
): Promise<EditionInventorySummary[]> {
  const query = `
		SELECT
			e.id as edition_id,
			e.name as edition_name,
			w.title as work_title,
			w.composer,
			COUNT(pc.id) as total,
			COUNT(CASE WHEN pc.condition = 'lost' THEN 1 END) as lost,
			COUNT(CASE WHEN pc.condition != 'lost' AND ca.id IS NOT NULL THEN 1 END) as assigned
		FROM editions e
		JOIN works w ON e.work_id = w.id
		JOIN physical_copies pc ON pc.edition_id = e.id
		LEFT JOIN copy_assignments ca ON ca.copy_id = pc.id AND ca.returned_at IS NULL
		WHERE w.org_id = ?
		GROUP BY e.id
		ORDER BY w.title, e.name
	`;

  const { results } = await db.prepare(query).bind(orgId).all<{
    edition_id: string;
    edition_name: string;
    work_title: string;
    composer: string | null;
    total: number;
    lost: number;
    assigned: number;
  }>();

  return results.map((row) => ({
    editionId: row.edition_id,
    editionName: row.edition_name,
    workTitle: row.work_title,
    composer: row.composer,
    total: row.total,
    available: row.total - row.lost - row.assigned,
    assigned: row.assigned,
    lost: row.lost,
  }));
}

/**
 * Get unassigned copies for an edition (available for checkout)
 */
export async function getUnassignedCopies(
  db: D1Database,
  editionId: string,
): Promise<PhysicalCopy[]> {
  const query = `
		SELECT pc.* FROM physical_copies pc
		LEFT JOIN copy_assignments ca ON ca.copy_id = pc.id AND ca.returned_at IS NULL
		WHERE pc.edition_id = ? 
			AND pc.condition != 'lost'
			AND ca.id IS NULL
		ORDER BY pc.copy_number COLLATE NOCASE
	`;

  const { results } = await db
    .prepare(query)
    .bind(editionId)
    .all<PhysicalCopyRow>();
  return results.map(rowToCopy);
}

/**
 * Get copies by condition for an edition
 */
export async function getCopiesByCondition(
  db: D1Database,
  editionId: string,
  condition: CopyCondition,
): Promise<PhysicalCopy[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM physical_copies WHERE edition_id = ? AND condition = ? ORDER BY copy_number COLLATE NOCASE`,
    )
    .bind(editionId, condition)
    .all<PhysicalCopyRow>();

  return results.map(rowToCopy);
}
