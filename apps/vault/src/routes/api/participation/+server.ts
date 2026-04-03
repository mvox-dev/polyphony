// API endpoint for updating participation from roster view
// Handles both RSVP and attendance with proper permission checks
/// <reference types="@cloudflare/workers-types" />
import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import {
  getParticipation,
  createParticipation,
  updateParticipation,
} from "$lib/server/db/participation";
import { getEventById } from "$lib/server/db/events";
import { getOrganizationById } from "$lib/server/db/organizations";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import { canRecordAttendance, type Member } from "$lib/server/auth/permissions";
import type {
  PlannedStatus,
  ActualStatus,
  UpdateParticipationInput,
} from "$lib/types";

interface UpdateBody {
  eventId: string;
  memberId: string;
  plannedStatus?: PlannedStatus | null;
  actualStatus?: ActualStatus | null;
}

const VALID_PLANNED: PlannedStatus[] = ["yes", "no", "maybe", "late"];
const VALID_ACTUAL: ActualStatus[] = ["present", "absent", "late"];

function validateRsvp(
  status: PlannedStatus | null | undefined,
  isOwn: boolean,
  isPast: boolean,
  canManage: boolean,
  trustIndividualResponsibility: boolean,
): void {
  if (status === undefined) return;
  if (status !== null && !VALID_PLANNED.includes(status)) {
    throw error(400, "Invalid planned status");
  }
  // Issue #240: When trust setting is enabled, members can edit their own RSVP even for past events
  const canEdit =
    canManage || (isOwn && !isPast) || (isOwn && trustIndividualResponsibility);
  if (!canEdit) throw error(403, "Cannot update RSVP for this member/event");
}

function validateAttendance(
  status: ActualStatus | null | undefined,
  isPast: boolean,
  canManage: boolean,
  isOwn: boolean,
  trustIndividualResponsibility: boolean,
): void {
  if (status === undefined) return;
  if (status !== null && !VALID_ACTUAL.includes(status)) {
    throw error(400, "Invalid actual status");
  }
  if (!isPast) throw error(400, "Cannot record attendance for future events");
  // Issue #240: When trust setting is enabled, members can update their own attendance
  const canEdit = canManage || (isOwn && trustIndividualResponsibility);
  if (!canEdit)
    throw error(403, "Only conductors/section leaders can record attendance");
}

async function applyUpdate(
  db: D1Database,
  body: UpdateBody,
  recorderId: string,
) {
  const { eventId, memberId, plannedStatus, actualStatus } = body;
  let participation = await getParticipation(db, memberId, eventId);

  const updates: UpdateParticipationInput = {};
  if (plannedStatus !== undefined) updates.plannedStatus = plannedStatus;
  if (actualStatus !== undefined) {
    updates.actualStatus = actualStatus;
    updates.recordedBy = recorderId;
  }

  if (participation) {
    return updateParticipation(db, memberId, eventId, updates);
  }

  participation = await createParticipation(db, {
    memberId,
    eventId,
    plannedStatus: plannedStatus ?? undefined,
  });

  if (actualStatus !== undefined) {
    return updateParticipation(db, memberId, eventId, {
      actualStatus,
      recordedBy: recorderId,
    });
  }

  return participation;
}

/**
 * POST /api/participation - Update RSVP or attendance for a member/event
 */
export async function POST(event: RequestEvent) {
  const { platform, cookies, request, locals } = event;
  if (!platform) throw new Error("Platform not available");

  const db = platform.env.DB;
  const [currentMember, body] = await Promise.all([
    getAuthenticatedMember(db, cookies, locals.org.id),
    request.json() as Promise<UpdateBody>,
  ]);

  if (!body.eventId || !body.memberId)
    throw error(400, "eventId and memberId are required");

  const eventData = await getEventById(db, body.eventId, locals.org.id);
  if (!eventData) throw error(404, "Event not found");

  // Issue #240: Check organization trust setting
  const org = await getOrganizationById(db, locals.org.id);
  const trustSetting = org?.trustIndividualResponsibility ?? false;

  const isPast = new Date() >= new Date(eventData.starts_at);
  const canManage = canRecordAttendance(currentMember);
  const isOwn = currentMember.id === body.memberId;

  validateRsvp(body.plannedStatus, isOwn, isPast, canManage, trustSetting);
  validateAttendance(body.actualStatus, isPast, canManage, isOwn, trustSetting);

  return json(await applyUpdate(db, body, currentMember.id));
}
