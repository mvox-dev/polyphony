// Missing Copies Report page server loader
// Issue #123: Report showing members who need copies but don't have them
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getMemberById } from "$lib/server/db/members";
import { canUploadScores } from "$lib/server/auth/permissions";
import { getUpcomingEvents } from "$lib/server/db/events";
import {
  getMissingCopiesForEvent,
  getMissingCopiesForSeason,
  type MissingCopiesReport,
} from "$lib/server/db/inventory-reports";

interface SeasonOption {
  id: string;
  name: string;
}

export const load: PageServerLoad = async ({
  platform,
  cookies,
  url,
  locals,
}) => {
  if (!platform?.env?.DB) {
    throw error(500, "Database unavailable");
  }

  const db = platform.env.DB;
  const memberId = cookies.get("member_id");

  // Require authentication
  if (!memberId) {
    throw redirect(303, "/welcome");
  }

  // Get member and check permissions
  const member = await getMemberById(db, memberId, locals.org.id);
  if (!member) {
    throw redirect(303, "/welcome");
  }

  // Permission check: librarian/admin/owner only
  if (!canUploadScores(member)) {
    throw redirect(303, "/works");
  }

  const orgId = locals.org.id;

  // Load filter options
  const events = await getUpcomingEvents(db, orgId);

  // Load seasons for this organization (query directly - simple read)
  const { results: seasonRows } = await db
    .prepare(
      "SELECT id, name FROM seasons WHERE org_id = ? ORDER BY start_date DESC",
    )
    .bind(orgId)
    .all<{ id: string; name: string }>();
  const seasons: SeasonOption[] = seasonRows;

  // Get filter params
  const eventId = url.searchParams.get("event");
  const seasonId = url.searchParams.get("season");

  // Generate report based on filter
  let report: MissingCopiesReport | null = null;
  let filterType: "event" | "season" | null = null;
  let filterName: string | null = null;

  if (eventId) {
    const selectedEvent = events.find((e) => e.id === eventId);
    if (selectedEvent) {
      report = await getMissingCopiesForEvent(db, eventId);
      filterType = "event";
      filterName = selectedEvent.title;
    }
  } else if (seasonId) {
    const selectedSeason = seasons.find((s) => s.id === seasonId);
    if (selectedSeason) {
      report = await getMissingCopiesForSeason(db, seasonId);
      filterType = "season";
      filterName = selectedSeason.name;
    }
  }

  return {
    events,
    seasons,
    report,
    filterType,
    filterName,
    selectedEventId: eventId,
    selectedSeasonId: seasonId,
  };
};
