// API endpoint for event participation (RSVP)
/// <reference types="@cloudflare/workers-types" />
import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import {
  getParticipation,
  createParticipation,
  updateParticipation,
  getEventParticipation,
} from "$lib/server/db/participation";
import { getEventById } from "$lib/server/db/events";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import { getOrganizationById } from "$lib/server/db/organizations";
import { getAllMembers } from "$lib/server/db/members";
import type { PlannedStatus } from "$lib/types";

/**
 * GET /api/events/[id]/participation
 * Get all participation records for an event with member details
 * Requires: Authentication
 */
export async function GET(event: RequestEvent) {
  const { platform, cookies, params, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require authentication
  await getAuthenticatedMember(db, cookies, locals.org.id);

  const eventId = params.id;
  if (!eventId) {
    throw error(400, "Event ID required");
  }

  // Check event exists
  const eventData = await getEventById(db, eventId, locals.org.id);
  if (!eventData) {
    throw error(404, "Event not found");
  }

  // Get all participation records
  const participation = await getEventParticipation(db, eventId);

  // Get all members with sections (scoped to org)
  const members = await getAllMembers(db, event.locals.org.id);

  // Build response with member details and participation status
  const participationWithMembers = members.map((member) => {
    const record = participation.find((p) => p.memberId === member.id);
    // Get primary section (is_primary = 1) that is active
    // Note: member.sections from getAllMembers() are already filtered by isActive and sorted
    // The first section in the array is the primary one (from member_sections query)
    const primarySection =
      member.sections.find((s) => s.isActive) ?? member.sections[0];

    return {
      memberId: member.id,
      memberName: member.name || member.email_id || "Unknown",
      memberEmail: member.email_id,
      primarySection: primarySection
        ? {
            id: primarySection.id,
            abbreviation: primarySection.abbreviation,
            name: primarySection.name,
            displayOrder: primarySection.displayOrder,
          }
        : null,
      plannedStatus: record?.plannedStatus ?? null,
      plannedAt: record?.plannedAt ?? null,
      plannedNotes: record?.plannedNotes ?? null,
      actualStatus: record?.actualStatus ?? null,
      recordedAt: record?.recordedAt ?? null,
    };
  });

  return json(participationWithMembers);
}

/**
 * POST /api/events/[id]/participation
 * Update RSVP for current member
 * Requires: Authentication
 * Body: { status: 'yes' | 'no' | 'maybe' | 'late', notes?: string }
 */
export async function POST(event: RequestEvent) {
  const { platform, cookies, params, request, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require authentication
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);

  const eventId = params.id;
  if (!eventId) {
    throw error(400, "Event ID required");
  }

  // Parse request body early
  const body = (await request.json()) as { status?: string; notes?: string };
  const status = body.status as PlannedStatus;
  const notes = body.notes as string | undefined;

  // Check event exists
  const eventData = await getEventById(db, eventId, locals.org.id);
  if (!eventData) {
    throw error(404, "Event not found");
  }

  // Check if event has started (RSVP locked after start, unless trust setting is enabled)
  const now = new Date();
  const eventStart = new Date(eventData.starts_at);
  if (now >= eventStart) {
    // Issue #240: When trust setting is enabled, members can still update own RSVP for past events
    const org = await getOrganizationById(db, locals.org.id);
    const trustSetting = org?.trustIndividualResponsibility ?? false;
    if (!trustSetting) {
      throw error(403, "Cannot RSVP after event has started");
    }
  }

  // Validate status
  const validStatuses: PlannedStatus[] = ["yes", "no", "maybe", "late"];
  if (!validStatuses.includes(status)) {
    throw error(400, "Invalid status. Must be one of: yes, no, maybe, late");
  }

  // Check if participation record exists
  const existing = await getParticipation(db, member.id, eventId);

  let participation;
  if (existing) {
    // Update existing record
    participation = await updateParticipation(db, member.id, eventId, {
      plannedStatus: status,
      plannedNotes: notes,
    });
  } else {
    // Create new record
    participation = await createParticipation(db, {
      memberId: member.id,
      eventId,
      plannedStatus: status,
      plannedNotes: notes,
    });
  }

  return json(participation);
}
