// Events database operations
import { createOrgId, type OrgId } from "@polyphony/shared";
import type { EventType } from "$lib/types";
import { nanoid } from "nanoid";

export interface Event {
  id: string;
  orgId: OrgId;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string;
  ends_at: string | null;
  event_type: EventType;
  created_by: string;
  created_at: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  location?: string;
  starts_at: string;
  ends_at?: string;
  event_type: EventType;
}

export interface UpdateEventInput {
  title?: string;
  description?: string;
  location?: string;
  starts_at?: string;
  ends_at?: string;
  event_type?: EventType;
}

/**
 * Create multiple events (for batch operations like recurring events)
 */
export async function createEvents(
  db: D1Database,
  orgId: OrgId,
  events: CreateEventInput[],
  createdBy: string,
): Promise<Event[]> {
  if (!orgId) {
    throw new Error("Organization ID is required");
  }

  const createdEvents: Event[] = [];

  // Batch insert all events
  const statements = events.map((event) => {
    const id = nanoid();
    const created_at = new Date().toISOString();

    createdEvents.push({
      id,
      orgId,
      title: event.title,
      description: event.description ?? null,
      location: event.location ?? null,
      starts_at: event.starts_at,
      ends_at: event.ends_at ?? null,
      event_type: event.event_type,
      created_by: createdBy,
      created_at,
    });

    return db
      .prepare(
        "INSERT INTO events (id, org_id, title, description, location, starts_at, ends_at, event_type, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        id,
        orgId,
        event.title,
        event.description ?? null,
        event.location ?? null,
        event.starts_at,
        event.ends_at ?? null,
        event.event_type,
        createdBy,
      );
  });

  await db.batch(statements);

  return createdEvents;
}

/**
 * Get upcoming events (starts_at >= now) ordered by start time
 * Filtered by organization
 */
export async function getUpcomingEvents(
  db: D1Database,
  orgId: OrgId,
): Promise<Event[]> {
  const { results } = await db
    .prepare(
      `SELECT id, org_id, title, description, location, starts_at, ends_at, event_type, created_by, created_at 
			FROM events 
			WHERE org_id = ? AND starts_at >= datetime('now') 
			ORDER BY starts_at ASC`,
    )
    .bind(orgId)
    .all<{
      id: string;
      org_id: string;
      title: string;
      description: string | null;
      location: string | null;
      starts_at: string;
      ends_at: string | null;
      event_type: EventType;
      created_by: string;
      created_at: string;
    }>();

  return results.map((row) => ({
    id: row.id,
    orgId: createOrgId(row.org_id),
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

/**
 * Get event by ID, scoped to organization
 */
export async function getEventById(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<Event | null> {
  const row = await db
    .prepare(
      "SELECT id, org_id, title, description, location, starts_at, ends_at, event_type, created_by, created_at FROM events WHERE id = ? AND org_id = ?",
    )
    .bind(id, orgId)
    .first<{
      id: string;
      org_id: string;
      title: string;
      description: string | null;
      location: string | null;
      starts_at: string;
      ends_at: string | null;
      event_type: EventType;
      created_by: string;
      created_at: string;
    }>();

  if (!row) return null;

  return {
    id: row.id,
    orgId: createOrgId(row.org_id),
    title: row.title,
    description: row.description,
    location: row.location,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    event_type: row.event_type,
    created_by: row.created_by,
    created_at: row.created_at,
  };
}

/**
 * Update event fields, scoped to organization
 */
export async function updateEvent(
  db: D1Database,
  id: string,
  input: UpdateEventInput,
  orgId: OrgId,
): Promise<boolean> {
  // Get current event to merge with updates
  const current = await getEventById(db, id, orgId);
  if (!current) {
    return false;
  }

  const result = await db
    .prepare(
      "UPDATE events SET title = ?, description = ?, location = ?, starts_at = ?, ends_at = ?, event_type = ? WHERE id = ? AND org_id = ?",
    )
    .bind(
      input.title ?? current.title,
      input.description ?? current.description,
      input.location ?? current.location,
      input.starts_at ?? current.starts_at,
      input.ends_at ?? current.ends_at,
      input.event_type ?? current.event_type,
      id,
      orgId,
    )
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Delete event (cascades to event_programs via ON DELETE CASCADE), scoped to organization
 */
export async function deleteEvent(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM events WHERE id = ? AND org_id = ?")
    .bind(id, orgId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}
