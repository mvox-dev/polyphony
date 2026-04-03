// Works database operations
import type { OrgId } from "@polyphony/shared";
import type { Work, CreateWorkInput, UpdateWorkInput } from "$lib/types";
import { generateId } from "$lib/server/utils/id";

interface WorkRow {
  id: string;
  org_id: string;
  title: string;
  composer: string | null;
  lyricist: string | null;
  created_at: string;
}

/**
 * Convert database row to Work interface (snake_case → camelCase)
 */
function rowToWork(row: WorkRow): Work {
  return {
    id: row.id,
    orgId: row.org_id,
    title: row.title,
    composer: row.composer,
    lyricist: row.lyricist,
    createdAt: row.created_at,
  };
}

/**
 * Create a new work
 */
export async function createWork(
  db: D1Database,
  input: CreateWorkInput,
): Promise<Work> {
  const id = generateId();
  const now = new Date().toISOString();
  const composer = input.composer ?? null;
  const lyricist = input.lyricist ?? null;

  await db
    .prepare(
      "INSERT INTO works (id, org_id, title, composer, lyricist, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, input.orgId, input.title, composer, lyricist, now)
    .run();

  return {
    id,
    orgId: input.orgId,
    title: input.title,
    composer,
    lyricist,
    createdAt: now,
  };
}

/**
 * Get a work by ID, scoped to organization
 */
export async function getWorkById(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<Work | null> {
  const row = await db
    .prepare(
      "SELECT id, org_id, title, composer, lyricist, created_at FROM works WHERE id = ? AND org_id = ?",
    )
    .bind(id, orgId)
    .first<WorkRow>();

  return row ? rowToWork(row) : null;
}

/**
 * Get all works for an organization, ordered by title
 */
export async function getAllWorks(
  db: D1Database,
  orgId: OrgId,
): Promise<Work[]> {
  const { results } = await db
    .prepare(
      "SELECT id, org_id, title, composer, lyricist, created_at FROM works WHERE org_id = ? ORDER BY title ASC",
    )
    .bind(orgId)
    .all<WorkRow>();

  return results.map(rowToWork);
}

/**
 * Build SET clause for partial updates
 * Returns { updates: [SET clauses], values: [values] }
 */
function buildUpdateSet(input: UpdateWorkInput): {
  updates: string[];
  values: (string | null)[];
} {
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (input.title !== undefined) {
    updates.push("title = ?");
    values.push(input.title);
  }
  if (input.composer !== undefined) {
    updates.push("composer = ?");
    values.push(input.composer);
  }
  if (input.lyricist !== undefined) {
    updates.push("lyricist = ?");
    values.push(input.lyricist);
  }

  return { updates, values };
}

/**
 * Execute update and fetch result, scoped to organization
 */
async function executeUpdate(
  db: D1Database,
  id: string,
  updates: string[],
  values: (string | null)[],
  orgId: OrgId,
): Promise<Work | null> {
  if (updates.length === 0) {
    // No updates provided, return current state
    return getWorkById(db, id, orgId);
  }

  values.push(id, orgId);
  const result = await db
    .prepare(
      `UPDATE works SET ${updates.join(", ")} WHERE id = ? AND org_id = ?`,
    )
    .bind(...values)
    .run();

  // Return null if work not found
  if ((result.meta.changes ?? 0) === 0) {
    return null;
  }

  return getWorkById(db, id, orgId);
}

/**
 * Update a work, scoped to organization
 * Returns the updated work, or null if not found
 */
export async function updateWork(
  db: D1Database,
  id: string,
  input: UpdateWorkInput,
  orgId: OrgId,
): Promise<Work | null> {
  const { updates, values } = buildUpdateSet(input);
  return executeUpdate(db, id, updates, values, orgId);
}

/**
 * Delete a work, scoped to organization
 * Returns true if deleted, false if not found
 */
export async function deleteWork(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM works WHERE id = ? AND org_id = ?")
    .bind(id, orgId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Search works by title or composer (case-insensitive) within an organization
 */
export async function searchWorks(
  db: D1Database,
  orgId: OrgId,
  query: string,
): Promise<Work[]> {
  const pattern = `%${query}%`;

  const { results } = await db
    .prepare(
      `
			SELECT id, org_id, title, composer, lyricist, created_at 
			FROM works 
			WHERE org_id = ? AND (title LIKE ? OR composer LIKE ?)
			ORDER BY title ASC
		`,
    )
    .bind(orgId, pattern, pattern)
    .all<WorkRow>();

  return results.map(rowToWork);
}
