// Event repertoire database operations
// Two-stage: Works assigned to events, then Editions selected per work
// Events can have ad-hoc works not in the season
// Issue #121

import { nanoid } from "nanoid";
import type {
  Work,
  Edition,
  EventRepertoireWork,
  EventRepertoireEdition,
  EventRepertoire,
} from "$lib/types";

// Database row types
export interface EventWork {
  id: string;
  event_id: string;
  work_id: string;
  display_order: number;
  notes: string | null;
  added_at: string;
  added_by: string | null;
}

export interface EventWorkEdition {
  id: string;
  event_work_id: string;
  edition_id: string;
  is_primary: boolean;
  notes: string | null;
  added_at: string;
  added_by: string | null;
}

// Re-export rich types for convenience
export type {
  EventRepertoireWork,
  EventRepertoireEdition,
  EventRepertoire,
} from "$lib/types";

// ============================================================================
// EVENT WORKS OPERATIONS
// ============================================================================

/**
 * Add a work to an event's repertoire
 * @throws Error if work already exists in event (UNIQUE constraint)
 */
export async function addWorkToEvent(
  db: D1Database,
  eventId: string,
  workId: string,
  addedBy: string | null = null,
  notes: string | null = null,
): Promise<EventWork> {
  const id = nanoid();

  // Get next display order
  const maxOrder = await db
    .prepare(
      "SELECT MAX(display_order) as max FROM event_works WHERE event_id = ?",
    )
    .bind(eventId)
    .first<{ max: number | null }>();

  const displayOrder = (maxOrder?.max ?? -1) + 1;

  try {
    await db
      .prepare(
        "INSERT INTO event_works (id, event_id, work_id, display_order, notes, added_by) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(id, eventId, workId, displayOrder, notes, addedBy)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error("Work is already in this event's repertoire");
    }
    throw error;
  }

  return {
    id,
    event_id: eventId,
    work_id: workId,
    display_order: displayOrder,
    notes,
    added_at: new Date().toISOString(),
    added_by: addedBy,
  };
}

/**
 * Remove a work from an event's repertoire
 * Also removes all associated edition selections (CASCADE)
 */
export async function removeWorkFromEvent(
  db: D1Database,
  eventWorkId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM event_works WHERE id = ?")
    .bind(eventWorkId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Reorder works in an event's repertoire
 * @param eventWorkIds - Array of event_work IDs in desired order
 */
export async function reorderEventWorks(
  db: D1Database,
  eventId: string,
  eventWorkIds: string[],
): Promise<void> {
  const statements = eventWorkIds.map((id, index) =>
    db
      .prepare(
        "UPDATE event_works SET display_order = ? WHERE id = ? AND event_id = ?",
      )
      .bind(index, id, eventId),
  );

  await db.batch(statements);
}

/**
 * Update notes for an event work
 */
export async function updateEventWorkNotes(
  db: D1Database,
  eventWorkId: string,
  notes: string | null,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE event_works SET notes = ? WHERE id = ?")
    .bind(notes, eventWorkId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

// ============================================================================
// EVENT WORK EDITIONS OPERATIONS
// ============================================================================

/** Options for adding an edition to an event work */
export interface AddEditionOptions {
  eventWorkId: string;
  editionId: string;
  addedBy?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
}

/** Determine if edition should be primary (first edition or explicitly set) */
async function shouldBePrimaryEdition(
  db: D1Database,
  eventWorkId: string,
  isPrimary: boolean,
): Promise<boolean> {
  if (isPrimary) return true;
  const result = await db
    .prepare(
      "SELECT COUNT(*) as count FROM event_work_editions WHERE event_work_id = ?",
    )
    .bind(eventWorkId)
    .first<{ count: number }>();
  return (result?.count ?? 0) === 0;
}

/**
 * Add an edition to an event work
 * @throws Error if edition already exists for this event work (UNIQUE constraint)
 */
export async function addEditionToEventWork(
  db: D1Database,
  options: AddEditionOptions,
): Promise<EventWorkEdition> {
  const {
    eventWorkId,
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
        "UPDATE event_work_editions SET is_primary = 0 WHERE event_work_id = ?",
      )
      .bind(eventWorkId)
      .run();
  }

  const finalIsPrimary = await shouldBePrimaryEdition(
    db,
    eventWorkId,
    isPrimary,
  );

  try {
    await db
      .prepare(
        "INSERT INTO event_work_editions (id, event_work_id, edition_id, is_primary, notes, added_by) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(id, eventWorkId, editionId, finalIsPrimary ? 1 : 0, notes, addedBy)
      .run();
  } catch (e) {
    if (e instanceof Error && e.message.includes("UNIQUE"))
      throw new Error("Edition is already selected for this work");
    throw e;
  }

  return {
    id,
    event_work_id: eventWorkId,
    edition_id: editionId,
    is_primary: finalIsPrimary,
    notes,
    added_at: new Date().toISOString(),
    added_by: addedBy,
  };
}

/**
 * Remove an edition from an event work
 */
export async function removeEditionFromEventWork(
  db: D1Database,
  eventWorkEditionId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM event_work_editions WHERE id = ?")
    .bind(eventWorkEditionId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Set an edition as primary for an event work
 */
export async function setPrimaryEdition(
  db: D1Database,
  eventWorkId: string,
  eventWorkEditionId: string,
): Promise<void> {
  // Clear all primaries for this event work
  await db
    .prepare(
      "UPDATE event_work_editions SET is_primary = 0 WHERE event_work_id = ?",
    )
    .bind(eventWorkId)
    .run();

  // Set the new primary
  await db
    .prepare("UPDATE event_work_editions SET is_primary = 1 WHERE id = ?")
    .bind(eventWorkEditionId)
    .run();
}

/**
 * Update notes for an event work edition
 */
export async function updateEventWorkEditionNotes(
  db: D1Database,
  eventWorkEditionId: string,
  notes: string | null,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE event_work_editions SET notes = ? WHERE id = ?")
    .bind(notes, eventWorkEditionId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

// ============================================================================
// EVENT REPERTOIRE QUERIES
// ============================================================================

// Row types for queries
interface EventWorkRow {
  id: string;
  event_id: string;
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
  event_work_id: string;
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

/** Convert edition row to EventRepertoireEdition */
function mapEditionRow(e: EditionRow): EventRepertoireEdition {
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

/** Group editions by event work ID */
function groupEditionsByEventWork(
  editions: EditionRow[],
): Map<string, EventRepertoireEdition[]> {
  const map = new Map<string, EventRepertoireEdition[]>();
  for (const e of editions) {
    const arr = map.get(e.event_work_id) ?? [];
    arr.push(mapEditionRow(e));
    map.set(e.event_work_id, arr);
  }
  return map;
}

/** Convert event work row to EventRepertoireWork */
function mapEventWorkRow(
  ew: EventWorkRow,
  editionsMap: Map<string, EventRepertoireEdition[]>,
): EventRepertoireWork {
  return {
    eventWorkId: ew.id,
    work: {
      id: ew.w_id,
      orgId: ew.w_org_id,
      title: ew.w_title,
      composer: ew.w_composer,
      lyricist: ew.w_lyricist,
      createdAt: ew.w_created_at,
    },
    displayOrder: ew.display_order,
    notes: ew.notes,
    editions: editionsMap.get(ew.id) ?? [],
  };
}

/**
 * Get full repertoire for an event: works with their editions
 */
export async function getEventRepertoire(
  db: D1Database,
  eventId: string,
): Promise<EventRepertoire> {
  const eventWorks = await db
    .prepare(
      `SELECT ew.id, ew.event_id, ew.work_id, ew.display_order, ew.notes, ew.added_at, ew.added_by,
				w.id as w_id, w.org_id as w_org_id, w.title as w_title, w.composer as w_composer, w.lyricist as w_lyricist, w.created_at as w_created_at
			FROM event_works ew JOIN works w ON ew.work_id = w.id WHERE ew.event_id = ? ORDER BY ew.display_order ASC`,
    )
    .bind(eventId)
    .all<EventWorkRow>();

  if (eventWorks.results.length === 0) return { eventId, works: [] };

  const eventWorkIds = eventWorks.results.map((ew) => ew.id);
  const placeholders = eventWorkIds.map(() => "?").join(",");

  const editions = await db
    .prepare(
      `SELECT ewe.id, ewe.event_work_id, ewe.edition_id, ewe.is_primary, ewe.notes,
				e.id as e_id, e.work_id as e_work_id, e.name as e_name, e.arranger as e_arranger,
				e.publisher as e_publisher, e.voicing as e_voicing, e.edition_type as e_edition_type,
				e.license_type as e_license_type, e.notes as e_notes, e.external_url as e_external_url,
				e.file_key as e_file_key, e.file_name as e_file_name, e.file_size as e_file_size, e.created_at as e_created_at
			FROM event_work_editions ewe JOIN editions e ON ewe.edition_id = e.id
			WHERE ewe.event_work_id IN (${placeholders}) ORDER BY ewe.is_primary DESC`,
    )
    .bind(...eventWorkIds)
    .all<EditionRow>();

  const editionsMap = groupEditionsByEventWork(editions.results);
  const works = eventWorks.results.map((ew) =>
    mapEventWorkRow(ew, editionsMap),
  );
  return { eventId, works };
}

/**
 * Get a single event work by ID
 */
export async function getEventWork(
  db: D1Database,
  eventWorkId: string,
): Promise<EventWork | null> {
  return await db
    .prepare(
      "SELECT id, event_id, work_id, display_order, notes, added_at, added_by FROM event_works WHERE id = ?",
    )
    .bind(eventWorkId)
    .first<EventWork>();
}

/**
 * Check if a work is in an event's repertoire
 */
export async function isWorkInEvent(
  db: D1Database,
  eventId: string,
  workId: string,
): Promise<boolean> {
  const result = await db
    .prepare("SELECT 1 FROM event_works WHERE event_id = ? AND work_id = ?")
    .bind(eventId, workId)
    .first();

  return result !== null;
}
