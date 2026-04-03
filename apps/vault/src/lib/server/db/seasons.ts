// Seasons database operations
// Seasons define date-based groupings for events
// Events belong to seasons by date, not explicit FK

import { createOrgId, type OrgId } from "@polyphony/shared";
import { nanoid } from "nanoid";
import type { Event } from "./events";

export interface Season {
  id: string;
  orgId: OrgId;
  name: string;
  start_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
}

interface SeasonRow {
  id: string;
  org_id: string;
  name: string;
  start_date: string;
  created_at: string;
  updated_at: string;
}

/**
 * Convert database row to Season interface (snake_case → camelCase)
 */
function rowToSeason(row: SeasonRow): Season {
  return {
    id: row.id,
    orgId: createOrgId(row.org_id),
    name: row.name,
    start_date: row.start_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export interface CreateSeasonInput {
  orgId: OrgId;
  name: string;
  start_date: string; // YYYY-MM-DD
}

export interface UpdateSeasonInput {
  name?: string;
  start_date?: string;
}

/**
 * Create a new season
 * @throws Error if start_date already exists for this org (UNIQUE constraint)
 */
export async function createSeason(
  db: D1Database,
  input: CreateSeasonInput,
): Promise<Season> {
  const id = nanoid();
  const now = new Date().toISOString();

  try {
    await db
      .prepare(
        "INSERT INTO seasons (id, org_id, name, start_date, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .bind(id, input.orgId, input.name, input.start_date, now, now)
      .run();
  } catch (error) {
    // Check for UNIQUE constraint violation on (org_id, start_date)
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error(
        `Season with start date ${input.start_date} already exists`,
      );
    }
    throw error;
  }

  return {
    id,
    orgId: input.orgId,
    name: input.name,
    start_date: input.start_date,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Get a season by ID, scoped to organization
 */
export async function getSeason(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<Season | null> {
  const row = await db
    .prepare(
      "SELECT id, org_id, name, start_date, created_at, updated_at FROM seasons WHERE id = ? AND org_id = ?",
    )
    .bind(id, orgId)
    .first<SeasonRow>();

  return row ? rowToSeason(row) : null;
}

/**
 * Get all seasons for an organization ordered by start_date DESC (most recent first)
 */
export async function getAllSeasons(
  db: D1Database,
  orgId: OrgId,
): Promise<Season[]> {
  const result = await db
    .prepare(
      "SELECT id, org_id, name, start_date, created_at, updated_at FROM seasons WHERE org_id = ? ORDER BY start_date DESC",
    )
    .bind(orgId)
    .all<SeasonRow>();

  return result.results.map(rowToSeason);
}

/**
 * Find which season a given date falls into for an organization
 * A date belongs to the season with the largest start_date <= the given date
 */
export async function getSeasonByDate(
  db: D1Database,
  orgId: OrgId,
  date: string, // YYYY-MM-DD
): Promise<Season | null> {
  const row = await db
    .prepare(
      "SELECT id, org_id, name, start_date, created_at, updated_at FROM seasons WHERE org_id = ? AND start_date <= ? ORDER BY start_date DESC LIMIT 1",
    )
    .bind(orgId, date)
    .first<SeasonRow>();

  return row ? rowToSeason(row) : null;
}

/**
 * Get all events within a season's date range, scoped to organization
 * A season's range is from its start_date to the day before the next season's start_date
 * (or unbounded if it's the most recent season)
 */
export async function getSeasonEvents(
  db: D1Database,
  seasonId: string,
  orgId: OrgId,
): Promise<Event[]> {
  // First get the season
  const season = await getSeason(db, seasonId, orgId);
  if (!season) {
    return [];
  }

  // Find the next season's start date (if any) for this org
  const nextSeason = await db
    .prepare(
      "SELECT start_date FROM seasons WHERE org_id = ? AND start_date > ? ORDER BY start_date ASC LIMIT 1",
    )
    .bind(season.orgId, season.start_date)
    .first<{ start_date: string }>();

  // Build query based on whether there's a next season
  // Filter by org_id to only get events for this organization
  if (nextSeason) {
    // Events from this season's start to before next season's start
    const result = await db
      .prepare(
        `SELECT id, org_id, title, description, location, starts_at, ends_at, event_type, created_by, created_at 
				 FROM events 
				 WHERE org_id = ? AND DATE(starts_at) >= ? AND DATE(starts_at) < ?
				 ORDER BY starts_at ASC`,
      )
      .bind(season.orgId, season.start_date, nextSeason.start_date)
      .all();

    return result.results.map((row: any) => ({
      id: row.id,
      orgId: row.org_id,
      title: row.title,
      description: row.description,
      location: row.location,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      event_type: row.event_type,
      created_by: row.created_by,
      created_at: row.created_at,
    }));
  } else {
    // This is the most recent season - all events from start_date onwards
    const result = await db
      .prepare(
        `SELECT id, org_id, title, description, location, starts_at, ends_at, event_type, created_by, created_at 
				 FROM events 
				 WHERE org_id = ? AND DATE(starts_at) >= ?
				 ORDER BY starts_at ASC`,
      )
      .bind(season.orgId, season.start_date)
      .all();

    return result.results.map((row: any) => ({
      id: row.id,
      orgId: row.org_id,
      title: row.title,
      description: row.description,
      location: row.location,
      starts_at: row.starts_at,
      ends_at: row.ends_at,
      event_type: row.event_type,
      created_by: row.created_by,
      created_at: row.created_at,
    }));
  }
}

/**
 * Get the date range for a season (start and end dates)
 * End date is the day before the next season's start, or null if unbounded (most recent season)
 */
export async function getSeasonDateRange(
  db: D1Database,
  season: Season,
): Promise<{ start: string; end: string | null }> {
  // Find the next season's start date (if any) for this org
  const nextSeason = await db
    .prepare(
      "SELECT start_date FROM seasons WHERE org_id = ? AND start_date > ? ORDER BY start_date ASC LIMIT 1",
    )
    .bind(season.orgId, season.start_date)
    .first<{ start_date: string }>();

  return {
    start: season.start_date,
    end: nextSeason?.start_date ?? null,
  };
}

/**
 * Build UPDATE SET clause for partial updates
 */
function buildSeasonUpdateSet(input: UpdateSeasonInput): {
  updates: string[];
  values: (string | null)[];
} {
  const updates: string[] = [];
  const values: (string | null)[] = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    values.push(input.name);
  }
  if (input.start_date !== undefined) {
    updates.push("start_date = ?");
    values.push(input.start_date);
  }

  return { updates, values };
}

/**
 * Update a season, scoped to organization
 * @throws Error if start_date already exists on another season
 */
export async function updateSeason(
  db: D1Database,
  id: string,
  input: UpdateSeasonInput,
  orgId: OrgId,
): Promise<Season | null> {
  const existing = await getSeason(db, id, orgId);
  if (!existing) return null;

  const { updates, values } = buildSeasonUpdateSet(input);
  if (updates.length === 0) return existing;

  updates.push("updated_at = ?");
  values.push(new Date().toISOString(), id);

  try {
    await db
      .prepare(`UPDATE seasons SET ${updates.join(", ")} WHERE id = ?`)
      .bind(...values)
      .run();
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) {
      throw new Error(
        `Season with start date ${input.start_date} already exists`,
      );
    }
    throw error;
  }

  return getSeason(db, id, orgId);
}

/**
 * Delete a season, scoped to organization
 * @returns true if deleted, false if not found
 */
export async function deleteSeason(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<boolean> {
  // Verify the season belongs to this org
  const existing = await getSeason(db, id, orgId);
  if (!existing) return false;

  const result = await db
    .prepare("DELETE FROM seasons WHERE id = ? AND org_id = ?")
    .bind(id, orgId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Season navigation links (prev/next)
 */
export interface SeasonNav {
  prev: { id: string; name: string } | null;
  next: { id: string; name: string } | null;
}

/**
 * Get navigation links (prev/next seasons) for a given season
 */
export async function getSeasonNavigation(
  db: D1Database,
  orgId: OrgId,
  currentSeasonId: string,
): Promise<SeasonNav> {
  const seasons = await getAllSeasons(db, orgId); // Ordered by start_date DESC
  const currentIndex = seasons.findIndex((s) => s.id === currentSeasonId);

  if (currentIndex === -1) {
    return { prev: null, next: null };
  }

  // Since seasons are DESC, prev is index+1 (older), next is index-1 (newer)
  const prev =
    currentIndex < seasons.length - 1
      ? {
          id: seasons[currentIndex + 1].id,
          name: seasons[currentIndex + 1].name,
        }
      : null;
  const next =
    currentIndex > 0
      ? {
          id: seasons[currentIndex - 1].id,
          name: seasons[currentIndex - 1].name,
        }
      : null;

  return { prev, next };
}
