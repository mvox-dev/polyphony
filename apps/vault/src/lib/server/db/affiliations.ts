// Affiliations database layer
// Tracks collective ↔ umbrella relationships with history

import type { Affiliation, CreateAffiliationInput } from "$lib/types";
import { generateId } from "$lib/server/utils/id";

// Database row interface (snake_case)
interface AffiliationRow {
  id: string;
  collective_id: string;
  umbrella_id: string;
  joined_at: string;
  left_at: string | null;
}

/**
 * Map database row (snake_case) to TypeScript type (camelCase)
 */
function rowToAffiliation(row: AffiliationRow): Affiliation {
  return {
    id: row.id,
    collectiveId: row.collective_id,
    umbrellaId: row.umbrella_id,
    joinedAt: row.joined_at,
    leftAt: row.left_at,
  };
}

/**
 * Create a new affiliation between a collective and an umbrella
 * @throws Error if active affiliation already exists
 */
export async function createAffiliation(
  db: D1Database,
  input: CreateAffiliationInput,
): Promise<Affiliation> {
  const id = generateId();
  const joinedAt = new Date().toISOString();

  // The partial unique index will reject if an active affiliation already exists
  // This will throw a UNIQUE constraint error
  await db
    .prepare(
      `INSERT INTO affiliations (id, collective_id, umbrella_id, joined_at)
			 VALUES (?, ?, ?, ?)`,
    )
    .bind(id, input.collectiveId, input.umbrellaId, joinedAt)
    .run();

  return {
    id,
    collectiveId: input.collectiveId,
    umbrellaId: input.umbrellaId,
    joinedAt,
    leftAt: null,
  };
}

/**
 * End an active affiliation (sets left_at)
 * @returns true if affiliation was ended, false if not found or already ended
 */
export async function endAffiliation(
  db: D1Database,
  collectiveId: string,
  umbrellaId: string,
): Promise<boolean> {
  const leftAt = new Date().toISOString();

  const result = await db
    .prepare(
      `UPDATE affiliations
			 SET left_at = ?
			 WHERE collective_id = ? AND umbrella_id = ? AND left_at IS NULL`,
    )
    .bind(leftAt, collectiveId, umbrellaId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Get an affiliation by ID
 */
export async function getAffiliationById(
  db: D1Database,
  id: string,
): Promise<Affiliation | null> {
  const row = await db
    .prepare(
      `SELECT id, collective_id, umbrella_id, joined_at, left_at
			 FROM affiliations WHERE id = ?`,
    )
    .bind(id)
    .first<AffiliationRow>();

  return row ? rowToAffiliation(row) : null;
}

/**
 * Get all active affiliations for an organization (as collective or umbrella)
 */
export async function getActiveAffiliations(
  db: D1Database,
  orgId: string,
): Promise<Affiliation[]> {
  const { results } = await db
    .prepare(
      `SELECT id, collective_id, umbrella_id, joined_at, left_at
			 FROM affiliations
			 WHERE (collective_id = ? OR umbrella_id = ?) AND left_at IS NULL
			 ORDER BY joined_at ASC`,
    )
    .bind(orgId, orgId)
    .all<AffiliationRow>();

  return results.map(rowToAffiliation);
}

/**
 * Get full affiliation history for a collective-umbrella pair
 * Ordered by joined_at descending (most recent first)
 */
export async function getAffiliationHistory(
  db: D1Database,
  collectiveId: string,
  umbrellaId: string,
): Promise<Affiliation[]> {
  const { results } = await db
    .prepare(
      `SELECT id, collective_id, umbrella_id, joined_at, left_at
			 FROM affiliations
			 WHERE collective_id = ? AND umbrella_id = ?
			 ORDER BY joined_at DESC`,
    )
    .bind(collectiveId, umbrellaId)
    .all<AffiliationRow>();

  return results.map(rowToAffiliation);
}

/**
 * Get all active collectives under an umbrella
 */
export async function getUmbrellaMembers(
  db: D1Database,
  umbrellaId: string,
): Promise<Affiliation[]> {
  const { results } = await db
    .prepare(
      `SELECT id, collective_id, umbrella_id, joined_at, left_at
			 FROM affiliations
			 WHERE umbrella_id = ? AND left_at IS NULL
			 ORDER BY joined_at ASC`,
    )
    .bind(umbrellaId)
    .all<AffiliationRow>();

  return results.map(rowToAffiliation);
}

/**
 * Get all active umbrellas for a collective
 * (A collective can belong to multiple umbrellas)
 */
export async function getCollectiveUmbrellas(
  db: D1Database,
  collectiveId: string,
): Promise<Affiliation[]> {
  const { results } = await db
    .prepare(
      `SELECT id, collective_id, umbrella_id, joined_at, left_at
			 FROM affiliations
			 WHERE collective_id = ? AND left_at IS NULL
			 ORDER BY joined_at ASC`,
    )
    .bind(collectiveId)
    .all<AffiliationRow>();

  return results.map(rowToAffiliation);
}
