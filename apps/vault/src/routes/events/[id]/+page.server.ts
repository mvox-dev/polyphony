// Server-side loader for event detail page
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import {
  canManageEvents,
  canRecordAttendance,
  canUploadScores,
} from "$lib/server/auth/permissions";
import { getEventById } from "$lib/server/db/events";
import { getEditionsByWorkId } from "$lib/server/db/editions";
import { getParticipation } from "$lib/server/db/participation";
import { getEventRepertoire } from "$lib/server/db/event-repertoire";
import { getEventMaterialsForMember } from "$lib/server/db/event-materials";
import { getOrganizationById } from "$lib/server/db/organizations";
import { getAllWorks } from "$lib/server/db/works";
import type { Edition } from "$lib/types";

export const load: PageServerLoad = async ({
  platform,
  cookies,
  params,
  locals,
}) => {
  if (!platform) throw error(500, "Platform not available");
  const db = platform.env.DB;

  // Require authentication
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);

  const orgId = locals.org.id;

  const eventId = params.id;
  if (!eventId) {
    throw error(400, "Event ID required");
  }

  // Load event details
  const event = await getEventById(db, eventId, orgId);
  if (!event) {
    throw error(404, "Event not found");
  }

  // Check if user can manage this event
  const canManage = canManageEvents(member);
  const canManageLibrary = canUploadScores(member);

  // Get current member's participation status
  const myParticipation = await getParticipation(db, member.id, eventId);

  // Check if event has started (for RSVP lock and attendance visibility)
  const now = new Date();
  const eventStart = new Date(event.starts_at);
  const hasStarted = now >= eventStart;

  // Check if member can record attendance
  const canRecordAttendanceFlag = canRecordAttendance(member);

  // Issue #240: Trust Individual Responsibility setting
  const org = await getOrganizationById(db, orgId);
  const trustIndividualResponsibility =
    org?.trustIndividualResponsibility ?? false;

  // ============================================================================
  // EVENT REPERTOIRE (Issue #121)
  // ============================================================================

  // Load event repertoire (works + editions)
  const repertoire = await getEventRepertoire(db, eventId);

  // Load all works for this organization for adding to repertoire
  const allWorks = await getAllWorks(db, orgId);

  // Works already in event repertoire
  const eventWorkIds = new Set(repertoire.works.map((w) => w.work.id));

  // Note: Season integration is a future feature. For now, events don't have season_id.
  // When that's added, we'll load season repertoire for suggestions.
  const seasonWorkIds: string[] = [];

  // Available works: not already in event, sorted alphabetically
  const availableWorks = allWorks
    .filter((w) => !eventWorkIds.has(w.id))
    .sort((a, b) => a.title.localeCompare(b.title));

  // Build map of work -> editions for repertoire management
  const workEditionsMap: Record<string, Edition[]> = {};
  for (const repWork of repertoire.works) {
    workEditionsMap[repWork.work.id] = await getEditionsByWorkId(
      db,
      repWork.work.id,
      orgId,
    );
  }
  // Also load editions for available works (for when adding)
  for (const work of availableWorks.slice(0, 20)) {
    // Limit to first 20 for performance
    if (!workEditionsMap[work.id]) {
      workEditionsMap[work.id] = await getEditionsByWorkId(db, work.id, orgId);
    }
  }

  // ============================================================================
  // WHAT TO BRING (Issue #122)
  // ============================================================================

  // Load personalized materials for the current member
  const myMaterials = await getEventMaterialsForMember(db, eventId, member.id);

  return {
    event,
    canManage,
    canManageLibrary,
    myParticipation,
    hasStarted,
    canRecordAttendance: canRecordAttendanceFlag,
    trustIndividualResponsibility,
    currentMemberId: member.id,
    // Event repertoire (Issue #121)
    repertoire,
    availableWorks,
    seasonWorkIds,
    workEditionsMap,
    // What to bring (Issue #122)
    myMaterials,
  };
};
