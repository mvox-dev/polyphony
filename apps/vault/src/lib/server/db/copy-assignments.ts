// Copy assignments database operations
// Issue #116 - Copy Assignment/Return workflow
// Part of Epic #106 - Phase B: Physical Inventory

import { generateId } from "$lib/server/utils/id";

export interface CopyAssignment {
  id: string;
  copyId: string;
  memberId: string;
  assignedAt: string;
  assignedBy: string | null;
  returnedAt: string | null;
  notes: string | null;
}

export interface AssignCopyInput {
  copyId: string;
  memberId: string;
  assignedBy: string;
  notes?: string;
}

export interface GetMemberAssignmentsOptions {
  includeReturned?: boolean;
}

interface CopyAssignmentRow {
  id: string;
  copy_id: string;
  member_id: string;
  assigned_at: string;
  assigned_by: string | null;
  returned_at: string | null;
  notes: string | null;
}

/**
 * Convert database row to CopyAssignment interface
 */
function rowToAssignment(row: CopyAssignmentRow): CopyAssignment {
  return {
    id: row.id,
    copyId: row.copy_id,
    memberId: row.member_id,
    assignedAt: row.assigned_at,
    assignedBy: row.assigned_by,
    returnedAt: row.returned_at,
    notes: row.notes,
  };
}

/**
 * Check if a copy is currently assigned (has active assignment)
 */
export async function isAssigned(
  db: D1Database,
  copyId: string,
): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT id FROM copy_assignments WHERE copy_id = ? AND returned_at IS NULL",
    )
    .bind(copyId)
    .first();
  return row !== null;
}

/**
 * Assign a copy to a member
 * @throws Error if copy is already assigned
 */
export async function assignCopy(
  db: D1Database,
  input: AssignCopyInput,
): Promise<CopyAssignment> {
  // Check if already assigned
  const alreadyAssigned = await isAssigned(db, input.copyId);
  if (alreadyAssigned) {
    throw new Error("Copy is already assigned");
  }

  const id = generateId();
  const notes = input.notes ?? null;

  await db
    .prepare(
      `INSERT INTO copy_assignments (id, copy_id, member_id, assigned_by, notes)
			 VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(id, input.copyId, input.memberId, input.assignedBy, notes)
    .run();

  const row = await db
    .prepare("SELECT * FROM copy_assignments WHERE id = ?")
    .bind(id)
    .first<CopyAssignmentRow>();

  if (!row) {
    throw new Error("Failed to create assignment");
  }

  return rowToAssignment(row);
}

/**
 * Mark an assignment as returned
 * @returns The updated assignment, or null if not found
 */
export async function returnCopy(
  db: D1Database,
  assignmentId: string,
): Promise<CopyAssignment | null> {
  const result = await db
    .prepare(
      `UPDATE copy_assignments SET returned_at = datetime('now') 
			 WHERE id = ? AND returned_at IS NULL`,
    )
    .bind(assignmentId)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return null;
  }

  const row = await db
    .prepare("SELECT * FROM copy_assignments WHERE id = ?")
    .bind(assignmentId)
    .first<CopyAssignmentRow>();

  return row ? rowToAssignment(row) : null;
}

/**
 * Get active (non-returned) assignments for a copy
 */
export async function getActiveAssignments(
  db: D1Database,
  copyId: string,
): Promise<CopyAssignment[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM copy_assignments WHERE copy_id = ? AND returned_at IS NULL ORDER BY assigned_at DESC",
    )
    .bind(copyId)
    .all<CopyAssignmentRow>();

  return results.map(rowToAssignment);
}

/**
 * Get full assignment history for a copy (including returned)
 */
export async function getAssignmentHistory(
  db: D1Database,
  copyId: string,
): Promise<CopyAssignment[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM copy_assignments WHERE copy_id = ? ORDER BY assigned_at DESC",
    )
    .bind(copyId)
    .all<CopyAssignmentRow>();

  return results.map(rowToAssignment);
}

/**
 * Get all assignments for a member
 * @param options.includeReturned - Include returned assignments (default: false)
 */
export async function getMemberAssignments(
  db: D1Database,
  memberId: string,
  options: GetMemberAssignmentsOptions = {},
): Promise<CopyAssignment[]> {
  const includeReturned = options.includeReturned ?? false;

  const query = includeReturned
    ? "SELECT * FROM copy_assignments WHERE member_id = ? ORDER BY assigned_at DESC"
    : "SELECT * FROM copy_assignments WHERE member_id = ? AND returned_at IS NULL ORDER BY assigned_at DESC";

  const { results } = await db
    .prepare(query)
    .bind(memberId)
    .all<CopyAssignmentRow>();

  return results.map(rowToAssignment);
}

/**
 * Get a single assignment by ID
 */
export async function getAssignmentById(
  db: D1Database,
  id: string,
): Promise<CopyAssignment | null> {
  const row = await db
    .prepare("SELECT * FROM copy_assignments WHERE id = ?")
    .bind(id)
    .first<CopyAssignmentRow>();

  return row ? rowToAssignment(row) : null;
}

// ============================================================================
// ENRICHED QUERIES (joins with works/editions for display)
// ============================================================================

/**
 * Assigned copy with full work/edition info for display
 */
export interface AssignedCopyWithDetails {
  assignmentId: string;
  copyId: string;
  copyNumber: string;
  condition: string;
  assignedAt: string;
  notes: string | null;
  edition: {
    id: string;
    name: string;
    type: string;
    fileKey: string | null;
    externalUrl: string | null;
  };
  work: {
    id: string;
    title: string;
    composer: string | null;
  };
  org: {
    id: string;
    name: string;
    subdomain: string;
  };
}

interface AssignedCopyRow {
  assignment_id: string;
  copy_id: string;
  copy_number: string;
  condition: string;
  assigned_at: string;
  notes: string | null;
  edition_id: string;
  edition_name: string;
  edition_type: string;
  file_key: string | null;
  external_url: string | null;
  work_id: string;
  work_title: string;
  composer: string | null;
  org_id: string;
  org_name: string;
  org_subdomain: string;
}

function rowToAssignedCopyWithDetails(
  row: AssignedCopyRow,
): AssignedCopyWithDetails {
  return {
    assignmentId: row.assignment_id,
    copyId: row.copy_id,
    copyNumber: row.copy_number,
    condition: row.condition,
    assignedAt: row.assigned_at,
    notes: row.notes,
    edition: {
      id: row.edition_id,
      name: row.edition_name,
      type: row.edition_type,
      fileKey: row.file_key,
      externalUrl: row.external_url,
    },
    work: {
      id: row.work_id,
      title: row.work_title,
      composer: row.composer,
    },
    org: {
      id: row.org_id,
      name: row.org_name,
      subdomain: row.org_subdomain,
    },
  };
}

/**
 * Get member's assigned copies with full work/edition details
 * Joins: copy_assignments → physical_copies → editions → works
 */
export async function getMemberAssignedCopies(
  db: D1Database,
  memberId: string,
): Promise<AssignedCopyWithDetails[]> {
  const query = `
		SELECT 
			ca.id as assignment_id,
			pc.id as copy_id,
			pc.copy_number,
			pc.condition,
			ca.assigned_at,
			ca.notes,
			e.id as edition_id,
			e.name as edition_name,
			e.edition_type,
			e.file_key,
			e.external_url,
			w.id as work_id,
			w.title as work_title,
			w.composer,
			o.id as org_id,
			o.name as org_name,
			o.subdomain as org_subdomain
		FROM copy_assignments ca
		JOIN physical_copies pc ON ca.copy_id = pc.id
		JOIN editions e ON pc.edition_id = e.id
		JOIN works w ON e.work_id = w.id
		JOIN organizations o ON w.org_id = o.id
		WHERE ca.member_id = ? AND ca.returned_at IS NULL
		ORDER BY ca.assigned_at DESC
	`;

  const { results } = await db
    .prepare(query)
    .bind(memberId)
    .all<AssignedCopyRow>();
  return results.map(rowToAssignedCopyWithDetails);
}

// ============================================================================
// ASSIGNMENT HISTORY QUERIES (Issue #124)
// ============================================================================

/**
 * Assignment history entry with member name
 */
export interface AssignmentHistoryEntry {
  id: string;
  copyId: string;
  copyNumber: string;
  memberId: string;
  memberName: string;
  assignedAt: string;
  assignedById: string | null;
  assignedByName: string | null;
  returnedAt: string | null;
  notes: string | null;
}

interface AssignmentHistoryRow {
  id: string;
  copy_id: string;
  copy_number: string;
  member_id: string;
  member_name: string;
  assigned_at: string;
  assigned_by_id: string | null;
  assigned_by_name: string | null;
  returned_at: string | null;
  notes: string | null;
}

function rowToHistoryEntry(row: AssignmentHistoryRow): AssignmentHistoryEntry {
  return {
    id: row.id,
    copyId: row.copy_id,
    copyNumber: row.copy_number,
    memberId: row.member_id,
    memberName: row.member_name,
    assignedAt: row.assigned_at,
    assignedById: row.assigned_by_id,
    assignedByName: row.assigned_by_name,
    returnedAt: row.returned_at,
    notes: row.notes,
  };
}

/**
 * Get assignment history for a single copy with member names
 * Issue #124 - Copy-level history view
 */
export async function getCopyAssignmentHistory(
  db: D1Database,
  copyId: string,
): Promise<AssignmentHistoryEntry[]> {
  const query = `
		SELECT 
			ca.id,
			ca.copy_id,
			pc.copy_number,
			ca.member_id,
			m.name as member_name,
			ca.assigned_at,
			ca.assigned_by as assigned_by_id,
			ab.name as assigned_by_name,
			ca.returned_at,
			ca.notes
		FROM copy_assignments ca
		JOIN physical_copies pc ON ca.copy_id = pc.id
		JOIN members m ON ca.member_id = m.id
		LEFT JOIN members ab ON ca.assigned_by = ab.id
		WHERE ca.copy_id = ?
		ORDER BY ca.assigned_at DESC
	`;

  const { results } = await db
    .prepare(query)
    .bind(copyId)
    .all<AssignmentHistoryRow>();
  return results.map(rowToHistoryEntry);
}

/**
 * Get assignment history for all copies of an edition
 * Issue #124 - Edition-level history view
 */
export async function getEditionAssignmentHistory(
  db: D1Database,
  editionId: string,
): Promise<AssignmentHistoryEntry[]> {
  const query = `
		SELECT 
			ca.id,
			ca.copy_id,
			pc.copy_number,
			ca.member_id,
			m.name as member_name,
			ca.assigned_at,
			ca.assigned_by as assigned_by_id,
			ab.name as assigned_by_name,
			ca.returned_at,
			ca.notes
		FROM copy_assignments ca
		JOIN physical_copies pc ON ca.copy_id = pc.id
		JOIN members m ON ca.member_id = m.id
		LEFT JOIN members ab ON ca.assigned_by = ab.id
		WHERE pc.edition_id = ?
		ORDER BY ca.assigned_at DESC
	`;

  const { results } = await db
    .prepare(query)
    .bind(editionId)
    .all<AssignmentHistoryRow>();
  return results.map(rowToHistoryEntry);
}

// ============================================================================
// CURRENT HOLDERS QUERY (Issue #125 - Who Has Edition X)
// ============================================================================

/**
 * Current holder of a physical copy
 */
export interface CurrentHolder {
  memberId: string;
  memberName: string;
  copyId: string;
  copyNumber: string;
  condition: string;
  assignedAt: string;
  assignedBy: string | null;
}

interface CurrentHolderRow {
  member_id: string;
  member_name: string;
  copy_id: string;
  copy_number: string;
  condition: string;
  assigned_at: string;
  assigned_by: string | null;
}

/**
 * Get all members currently holding copies of an edition
 * Issue #125 - Quick lookup for "who has edition X"
 */
export async function getCurrentHolders(
  db: D1Database,
  editionId: string,
): Promise<CurrentHolder[]> {
  const query = `
		SELECT 
			m.id as member_id,
			m.name as member_name,
			pc.id as copy_id,
			pc.copy_number,
			pc.condition,
			ca.assigned_at,
			ca.assigned_by
		FROM copy_assignments ca
		JOIN physical_copies pc ON pc.id = ca.copy_id
		JOIN members m ON m.id = ca.member_id
		WHERE pc.edition_id = ?
			AND ca.returned_at IS NULL
		ORDER BY pc.copy_number COLLATE NOCASE
	`;

  const { results } = await db
    .prepare(query)
    .bind(editionId)
    .all<CurrentHolderRow>();

  return results.map((row) => ({
    memberId: row.member_id,
    memberName: row.member_name,
    copyId: row.copy_id,
    copyNumber: row.copy_number,
    condition: row.condition,
    assignedAt: row.assigned_at,
    assignedBy: row.assigned_by,
  }));
}
