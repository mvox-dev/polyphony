// Season repertoire database operations
// Two-stage: Works assigned to seasons, then Editions selected per work

import { nanoid } from "nanoid";
import type {
  Work,
  Edition,
  SeasonRepertoireWork,
  SeasonRepertoireEdition,
  SeasonRepertoire,
} from "$lib/types";

// Database row types
export interface SeasonWork {
  id: string;
  season_id: string;
  work_id: string;
  display_order: number;
  notes: string | null;
  added_at: string;
  added_by: string | null;
}

export interface SeasonWorkEdition {
  id: string;
  season_work_id: string;
  edition_id: string;
  is_primary: boolean;
  notes: string | null;
  added_at: string;
  added_by: string | null;
}

// Re-export rich types for convenience
export type {
  SeasonRepertoireWork,
  SeasonRepertoireEdition,
  SeasonRepertoire,
} from "$lib/types";

// ============================================================================
// SEASON WORKS OPERATIONS
// ============================================================================

/**
 * Add a work to a season's repertoire
 * @throws Error if work already exists in season (UNIQUE constraint)
 */
export async function addWorkToSeason(
  db: D1Database,
  seasonId: string,
  workId: string,
  addedBy: string | null = null,
  notes: string | null = null,
): Promise<SeasonWork> {
  const id = nanoid();

  // Get next display order
  const maxOrder = await db
    .prepare(
      "SELECT MAX(display_order) as max FROM season_works WHERE season_id = ?",
    )
    .bind(seasonId)
    .first<{ max: number | null }>();

  const displayOrder = (maxOrder?.max ?? -1) + 1;

  try {
    await db
      .prepare(
        "INSERT INTO season_works (id, season_id, work_id, display_order, notes, added_by) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(id, seasonId, workId, displayOrder, notes, addedBy)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("Work is already in this season's repertoire");
    }
    throw error;
  }

  return {
    id,
    season_id: seasonId,
    work_id: workId,
    display_order: displayOrder,
    notes,
    added_at: new Date().toISOString(),
    added_by: addedBy,
  };
}

/**
 * Remove a work from a season's repertoire
 * Also removes all associated edition selections (CASCADE)
 */
export async function removeWorkFromSeason(
  db: D1Database,
  seasonWorkId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM season_works WHERE id = ?")
    .bind(seasonWorkId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Reorder works in a season's repertoire
 * @param seasonWorkIds - Array of season_work IDs in desired order
 */
export async function reorderSeasonWorks(
  db: D1Database,
  seasonId: string,
  seasonWorkIds: string[],
): Promise<void> {
  const statements = seasonWorkIds.map((id, index) =>
    db
      .prepare(
        "UPDATE season_works SET display_order = ? WHERE id = ? AND season_id = ?",
      )
      .bind(index, id, seasonId),
  );

  await db.batch(statements);
}

/**
 * Update notes for a season work
 */
export async function updateSeasonWorkNotes(
  db: D1Database,
  seasonWorkId: string,
  notes: string | null,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE season_works SET notes = ? WHERE id = ?")
    .bind(notes, seasonWorkId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

// ============================================================================
// SEASON WORK EDITIONS OPERATIONS
// ============================================================================

/** Options for adding an edition to a season work */
export interface AddEditionOptions {
  seasonWorkId: string;
  editionId: string;
  addedBy?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

/** Determine if edition should be primary (first edition or explicitly set) */
async function shouldBePrimaryEdition(
  db: D1Database,
  seasonWorkId: string,
  isPrimary: boolean,
): Promise<boolean> {
  if (isPrimary) return true;
  const result = await db
    .prepare(
      "SELECT COUNT(*) as count FROM season_work_editions WHERE season_work_id = ?",
    )
    .bind(seasonWorkId)
    .first<{ count: number }>();
  return (result?.count ?? 0) === 0;
}

/**
 * Add an edition to a season work
 * @throws Error if edition already exists for this season work (UNIQUE constraint)
 */
export async function addEditionToSeasonWork(
  db: D1Database,
  options: AddEditionOptions,
): Promise<SeasonWorkEdition> {
  const {
    seasonWorkId,
    editionId,
    addedBy = null,
    isPrimary = false,
    notes = null,
  } = options;
  const id = nanoid();

  // Clear existing primaries if this should be primary
  if (isPrimary) {
    await db
      .prepare(
        "UPDATE season_work_editions SET is_primary = 0 WHERE season_work_id = ?",
      )
      .bind(seasonWorkId)
      .run();
  }

  const finalIsPrimary = await shouldBePrimaryEdition(
    db,
    seasonWorkId,
    isPrimary,
  );

  try {
    await db
      .prepare(
        "INSERT INTO season_work_editions (id, season_work_id, edition_id, is_primary, notes, added_by) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(id, seasonWorkId, editionId, finalIsPrimary ? 1 : 0, notes, addedBy)
      .run();
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE"))
      throw new Error("Edition is already selected for this work");
    throw e;
  }

  return {
    id,
    season_work_id: seasonWorkId,
    edition_id: editionId,
    is_primary: finalIsPrimary,
    notes,
    added_at: new Date().toISOString(),
    added_by: addedBy,
  };
}

/**
 * Remove an edition from a season work
 */
export async function removeEditionFromSeasonWork(
  db: D1Database,
  seasonWorkEditionId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM season_work_editions WHERE id = ?")
    .bind(seasonWorkEditionId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Set an edition as primary for a season work
 */
export async function setPrimaryEdition(
  db: D1Database,
  seasonWorkId: string,
  seasonWorkEditionId: string,
): Promise<void> {
  // Clear all primaries for this season work
  await db
    .prepare(
      "UPDATE season_work_editions SET is_primary = 0 WHERE season_work_id = ?",
    )
    .bind(seasonWorkId)
    .run();

  // Set the new primary
  await db
    .prepare("UPDATE season_work_editions SET is_primary = 1 WHERE id = ?")
    .bind(seasonWorkEditionId)
    .run();
}

// ============================================================================
// SEASON REPERTOIRE QUERIES
// ============================================================================

// Row types for queries
interface SeasonWorkRow {
  id: string;
  season_id: string;
  work_id: string;
  display_order: number;
  notes: string | null;
  added_at: string;
  added_by: string | null;
  w_id: string;
  w_org_id: string;
  w_title: string;
  w_composer: string | null;
  w_lyricist: string | null;
  w_created_at: string;
}

interface EditionRow {
  id: string;
  season_work_id: string;
  edition_id: string;
  is_primary: number;
  notes: string | null;
  e_id: string;
  e_work_id: string;
  e_name: string;
  e_arranger: string | null;
  e_publisher: string | null;
  e_voicing: string | null;
  e_edition_type: string;
  e_license_type: string;
  e_notes: string | null;
  e_external_url: string | null;
  e_file_key: string | null;
  e_file_name: string | null;
  e_file_size: number | null;
  e_created_at: string;
}

/** Convert edition row to SeasonRepertoireEdition */
function mapEditionRow(e: EditionRow): SeasonRepertoireEdition {
  const edition: Edition = {
    id: e.e_id,
    workId: e.e_work_id,
    name: e.e_name,
    arranger: e.e_arranger,
    publisher: e.e_publisher,
    voicing: e.e_voicing,
    editionType: e.e_edition_type as Edition["editionType"],
    licenseType: e.e_license_type as Edition["licenseType"],
    notes: e.e_notes,
    externalUrl: e.e_external_url,
    fileKey: e.e_file_key,
    fileName: e.e_file_name,
    fileSize: e.e_file_size,
    fileUploadedAt: null,
    fileUploadedBy: null,
    createdAt: e.e_created_at,
  };
  return {
    workEditionId: e.id,
    edition,
    isPrimary: e.is_primary === 1,
    notes: e.notes,
  };
}

/** Group editions by season work ID */
function groupEditionsBySeasonWork(
  editions: EditionRow[],
): Map<string, SeasonRepertoireEdition[]> {
  const map = new Map<string, SeasonRepertoireEdition[]>();
  for (const e of editions) {
    const arr = map.get(e.season_work_id) ?? [];
    arr.push(mapEditionRow(e));
    map.set(e.season_work_id, arr);
  }
  return map;
}

/** Convert season work row to SeasonRepertoireWork */
function mapSeasonWorkRow(
  sw: SeasonWorkRow,
  editionsMap: Map<string, SeasonRepertoireEdition[]>,
): SeasonRepertoireWork {
  return {
    seasonWorkId: sw.id,
    work: {
      id: sw.w_id,
      orgId: sw.w_org_id,
      title: sw.w_title,
      composer: sw.w_composer,
      lyricist: sw.w_lyricist,
      createdAt: sw.w_created_at,
    },
    displayOrder: sw.display_order,
    notes: sw.notes,
    editions: editionsMap.get(sw.id) ?? [],
  };
}

/**
 * Get full repertoire for a season: works with their editions
 */
export async function getSeasonRepertoire(
  db: D1Database,
  seasonId: string,
): Promise<SeasonRepertoire> {
  const seasonWorks = await db
    .prepare(
      `SELECT sw.id, sw.season_id, sw.work_id, sw.display_order, sw.notes, sw.added_at, sw.added_by,
				w.id as w_id, w.org_id as w_org_id, w.title as w_title, w.composer as w_composer, w.lyricist as w_lyricist, w.created_at as w_created_at
			FROM season_works sw JOIN works w ON sw.work_id = w.id WHERE sw.season_id = ? ORDER BY sw.display_order ASC`,
    )
    .bind(seasonId)
    .all<SeasonWorkRow>();

  if (seasonWorks.results.length === 0) return { seasonId, works: [] };

  const seasonWorkIds = seasonWorks.results.map((sw) => sw.id);
  const placeholders = seasonWorkIds.map(() => "?").join(",");

  const editions = await db
    .prepare(
      `SELECT swe.id, swe.season_work_id, swe.edition_id, swe.is_primary, swe.notes,
				e.id as e_id, e.work_id as e_work_id, e.name as e_name, e.arranger as e_arranger,
				e.publisher as e_publisher, e.voicing as e_voicing, e.edition_type as e_edition_type,
				e.license_type as e_license_type, e.notes as e_notes, e.external_url as e_external_url,
				e.file_key as e_file_key, e.file_name as e_file_name, e.file_size as e_file_size, e.created_at as e_created_at
			FROM season_work_editions swe JOIN editions e ON swe.edition_id = e.id
			WHERE swe.season_work_id IN (${placeholders}) ORDER BY swe.is_primary DESC`,
    )
    .bind(...seasonWorkIds)
    .all<EditionRow>();

  const editionsMap = groupEditionsBySeasonWork(editions.results);
  const works = seasonWorks.results.map((sw) =>
    mapSeasonWorkRow(sw, editionsMap),
  );
  return { seasonId, works };
}

/**
 * Get a single season work by ID
 */
export async function getSeasonWork(
  db: D1Database,
  seasonWorkId: string,
): Promise<SeasonWork | null> {
  return await db
    .prepare(
      "SELECT id, season_id, work_id, display_order, notes, added_at, added_by FROM season_works WHERE id = ?",
    )
    .bind(seasonWorkId)
    .first<SeasonWork>();
}

/**
 * Check if a work is in a season's repertoire
 */
export async function isWorkInSeason(
  db: D1Database,
  seasonId: string,
  workId: string,
): Promise<boolean> {
  const result = await db
    .prepare("SELECT 1 FROM season_works WHERE season_id = ? AND work_id = ?")
    .bind(seasonId, workId)
    .first();

  return result !== null;
}
