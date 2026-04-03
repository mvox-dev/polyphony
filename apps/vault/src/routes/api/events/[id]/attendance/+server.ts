// API endpoint for recording attendance
/// <reference types="@cloudflare/workers-types" />
import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import {
  getParticipation,
  updateParticipation,
} from "$lib/server/db/participation";
import { getEventById } from "$lib/server/db/events";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import { canRecordAttendance } from "$lib/server/auth/permissions";
import { getOrganizationById } from "$lib/server/db/organizations";
import type { ActualStatus } from "$lib/types";

/**
 * POST /api/events/[id]/attendance
 * Record attendance for members (conductor only, after event starts)
 * Requires: Conductor role, event must have started
 * Body: { memberId: string, status: 'present' | 'absent' | 'late' }
 */
export async function POST(event: RequestEvent) {
  const { platform, cookies, params, request, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  const member = await getAuthenticatedMember(db, cookies, locals.org.id);

  const eventId = params.id;
  if (!eventId) {
    throw error(400, "Event ID required");
  }

  // Check event exists
  const eventData = await getEventById(db, eventId, locals.org.id);
  if (!eventData) {
    throw error(404, "Event not found");
  }

  // Check if event has started (can only record attendance after start)
  const now = new Date();
  const eventStart = new Date(eventData.starts_at);
  if (now < eventStart) {
    throw error(403, "Cannot record attendance before event starts");
  }

  // Parse request body
  const body = (await request.json()) as { memberId?: string; status?: string };
  const memberId = body.memberId as string;
  const status = body.status as ActualStatus;

  if (!memberId) {
    throw error(400, "memberId is required");
  }

  // Validate status
  const validStatuses: ActualStatus[] = ["present", "absent", "late"];
  if (!validStatuses.includes(status)) {
    throw error(400, "Invalid status. Must be one of: present, absent, late");
  }

  // Permission check: conductor/section_leader OR (trust setting + own record)
  const canManage = canRecordAttendance(member);
  if (!canManage) {
    // Issue #240: Check if trust setting allows self-service
    const isOwn = member.id === memberId;
    if (isOwn) {
      const org = await getOrganizationById(db, locals.org.id);
      const trustSetting = org?.trustIndividualResponsibility ?? false;
      if (!trustSetting) {
        throw error(
          403,
          "Only conductors and section leaders can record attendance",
        );
      }
    } else {
      throw error(
        403,
        "Only conductors and section leaders can record attendance",
      );
    }
  }

  // Check if participation record exists
  const existing = await getParticipation(db, memberId, eventId);

  let participation;
  if (existing) {
    // Update existing record
    participation = await updateParticipation(db, memberId, eventId, {
      actualStatus: status,
      recordedBy: member.id,
    });
  } else {
    // This shouldn't normally happen, but create a record if needed
    const { createParticipation } =
      await import("$lib/server/db/participation");
    const created = await createParticipation(db, {
      memberId,
      eventId,
    });
    // Now update with attendance
    participation = await updateParticipation(db, memberId, eventId, {
      actualStatus: status,
      recordedBy: member.id,
    });
  }

  return json(participation);
}

/**
 * PUT /api/events/[id]/attendance/bulk
 * Bulk update attendance for multiple members
 * Requires: Conductor role, event must have started
 * Body: { updates: Array<{ memberId: string, status: 'present' | 'absent' | 'late' }> }
 */
export async function PUT(event: RequestEvent) {
  const { platform, cookies, params, request, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require conductor/section_leader permission for bulk updates
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  if (!canRecordAttendance(member)) {
    throw error(
      403,
      "Only conductors and section leaders can bulk-record attendance",
    );
  }

  const eventId = params.id;
  if (!eventId) {
    throw error(400, "Event ID required");
  }

  // Check event exists
  const eventData = await getEventById(db, eventId, locals.org.id);
  if (!eventData) {
    throw error(404, "Event not found");
  }

  // Check if event has started
  const now = new Date();
  const eventStart = new Date(eventData.starts_at);
  if (now < eventStart) {
    throw error(403, "Cannot record attendance before event starts");
  }

  // Parse request body
  const body = (await request.json()) as {
    updates?: Array<{ memberId: string; status: ActualStatus }>;
  };
  const updates = body.updates as Array<{
    memberId: string;
    status: ActualStatus;
  }>;

  if (!Array.isArray(updates) || updates.length === 0) {
    throw error(400, "updates array is required");
  }

  // Validate all updates
  const validStatuses: ActualStatus[] = ["present", "absent", "late"];
  for (const update of updates) {
    if (!update.memberId || !update.status) {
      throw error(400, "Each update must have memberId and status");
    }
    if (!validStatuses.includes(update.status)) {
      throw error(400, "Invalid status. Must be one of: present, absent, late");
    }
  }

  // Process all updates
  const results = [];
  for (const update of updates) {
    const existing = await getParticipation(db, update.memberId, eventId);

    if (existing) {
      const participation = await updateParticipation(
        db,
        update.memberId,
        eventId,
        {
          actualStatus: update.status,
          recordedBy: member.id,
        },
      );
      results.push(participation);
    } else {
      // Create new record
      const { createParticipation } =
        await import("$lib/server/db/participation");
      const created = await createParticipation(db, {
        memberId: update.memberId,
        eventId,
      });
      const participation = await updateParticipation(
        db,
        update.memberId,
        eventId,
        {
          actualStatus: update.status,
          recordedBy: member.id,
        },
      );
      results.push(participation);
    }
  }

  return json({ updated: results.length, results });
}
