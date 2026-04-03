// Participation database operations
import type {
  Participation,
  ParticipationSummary,
  CreateParticipationInput,
  UpdateParticipationInput,
  PlannedStatus,
  ActualStatus,
} from "$lib/types";
import { generateId } from "$lib/server/utils/id";

/**
 * Create a new participation record
 */
export async function createParticipation(
  db: D1Database,
  input: CreateParticipationInput,
): Promise<Participation> {
  const id = generateId();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO participation (
        id, member_id, event_id, planned_status, planned_at, planned_notes
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.memberId,
      input.eventId,
      input.plannedStatus ?? null,
      input.plannedStatus ? now : null,
      input.plannedNotes ?? null,
    )
    .run();

  const participation = await getParticipation(
    db,
    input.memberId,
    input.eventId,
  );
  if (!participation) {
    throw new Error("Failed to create participation");
  }

  return participation;
}

/**
 * Get participation by member and event
 */
export async function getParticipation(
  db: D1Database,
  memberId: string,
  eventId: string,
): Promise<Participation | null> {
  const row = await db
    .prepare(
      `SELECT * FROM participation 
       WHERE member_id = ? AND event_id = ?`,
    )
    .bind(memberId, eventId)
    .first<Record<string, unknown>>();

  if (!row) return null;

  return mapRowToParticipation(row);
}

/**
 * Build UPDATE SET clauses for participation changes
 */
function buildParticipationUpdateSet(
  input: UpdateParticipationInput,
  now: string,
): { updates: string[]; bindings: unknown[] } {
  const updates: string[] = ["updated_at = ?"];
  const bindings: unknown[] = [now];

  if (input.plannedStatus !== undefined) {
    updates.push("planned_status = ?", "planned_at = ?");
    bindings.push(input.plannedStatus, now);
  }
  if (input.plannedNotes !== undefined) {
    updates.push("planned_notes = ?");
    bindings.push(input.plannedNotes);
  }
  if (input.actualStatus !== undefined) {
    updates.push("actual_status = ?", "recorded_at = ?");
    bindings.push(input.actualStatus, now);
  }
  if (input.recordedBy !== undefined) {
    updates.push("recorded_by = ?");
    bindings.push(input.recordedBy);
  }

  return { updates, bindings };
}

/**
 * Update participation (RSVP or record attendance)
 */
export async function updateParticipation(
  db: D1Database,
  memberId: string,
  eventId: string,
  input: UpdateParticipationInput,
): Promise<Participation | null> {
  const now = new Date().toISOString();
  const { updates, bindings } = buildParticipationUpdateSet(input, now);

  bindings.push(memberId, eventId);

  const result = await db
    .prepare(
      `UPDATE participation SET ${updates.join(", ")} WHERE member_id = ? AND event_id = ?`,
    )
    .bind(...bindings)
    .run();

  if ((result.meta.changes ?? 0) === 0) return null;
  return getParticipation(db, memberId, eventId);
}

/**
 * Get all participation for an event
 */
export async function getEventParticipation(
  db: D1Database,
  eventId: string,
): Promise<Participation[]> {
  const { results } = await db
    .prepare("SELECT * FROM participation WHERE event_id = ?")
    .bind(eventId)
    .all<Record<string, unknown>>();

  if (!results || results.length === 0) return [];

  return results.map(mapRowToParticipation);
}

/**
 * Get participation summary statistics for an event
 */
export async function getParticipationSummary(
  db: D1Database,
  eventId: string,
): Promise<ParticipationSummary> {
  // Get total active members
  const totalResult = await db
    .prepare("SELECT COUNT(*) as count FROM members")
    .first<{ count: number }>();

  const totalMembers = totalResult?.count ?? 0;

  // Get participation counts
  const { results } = await db
    .prepare(
      "SELECT planned_status, actual_status FROM participation WHERE event_id = ?",
    )
    .bind(eventId)
    .all<{ planned_status: string | null; actual_status: string | null }>();

  const participation = results ?? [];

  // Count planned statuses
  const plannedYes = participation.filter(
    (p) => p.planned_status === "yes",
  ).length;
  const plannedNo = participation.filter(
    (p) => p.planned_status === "no",
  ).length;
  const plannedMaybe = participation.filter(
    (p) => p.planned_status === "maybe",
  ).length;
  const plannedLate = participation.filter(
    (p) => p.planned_status === "late",
  ).length;
  const noResponse = totalMembers - participation.length;

  // Count actual statuses
  const actualPresent = participation.filter(
    (p) => p.actual_status === "present",
  ).length;
  const actualAbsent = participation.filter(
    (p) => p.actual_status === "absent",
  ).length;
  const actualLate = participation.filter(
    (p) => p.actual_status === "late",
  ).length;
  const notRecorded = participation.filter((p) => !p.actual_status).length;

  return {
    eventId,
    totalMembers,
    plannedYes,
    plannedNo,
    plannedMaybe,
    plannedLate,
    noResponse,
    actualPresent,
    actualAbsent,
    actualLate,
    notRecorded,
  };
}

/**
 * Delete participation record
 */
export async function deleteParticipation(
  db: D1Database,
  memberId: string,
  eventId: string,
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM participation WHERE member_id = ? AND event_id = ?")
    .bind(memberId, eventId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Helper to map database row to Participation type
 */
function mapRowToParticipation(row: Record<string, unknown>): Participation {
  return {
    id: row.id as string,
    memberId: row.member_id as string,
    eventId: row.event_id as string,
    plannedStatus: (row.planned_status as PlannedStatus | null) ?? null,
    plannedAt: (row.planned_at as string | null) ?? null,
    plannedNotes: (row.planned_notes as string | null) ?? null,
    actualStatus: (row.actual_status as ActualStatus | null) ?? null,
    recordedAt: (row.recorded_at as string | null) ?? null,
    recordedBy: (row.recorded_by as string | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}
