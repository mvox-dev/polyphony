// Server-side loader for events list page
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import { canCreateEvents } from "$lib/server/auth/permissions";
import { getParticipation } from "$lib/server/db/participation";
import {
  getSeasonByDate,
  getSeason,
  getSeasonEvents,
  getSeasonNavigation,
  type Season,
} from "$lib/server/db/seasons";

export const load: PageServerLoad = async ({
  platform,
  cookies,
  url,
  locals,
}) => {
  if (!platform) throw error(500, "Platform not available");
  const db = platform.env.DB;

  // Require authentication
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);

  const orgId = locals.org.id;

  // Determine which season to show
  const seasonIdParam = url.searchParams.get("seasonId");
  let season: Season | null = null;

  if (seasonIdParam) {
    // Specific season requested
    season = await getSeason(db, seasonIdParam, orgId);
  }

  if (!season) {
    // Default to current season (by today's date)
    const today = new Date().toISOString().split("T")[0];
    season = await getSeasonByDate(db, orgId, today);
  }

  // Load events for the season (or empty if no season)
  const events = season ? await getSeasonEvents(db, season.id, orgId) : [];

  // Load participation status for each event
  const eventsWithParticipation = await Promise.all(
    events.map(async (event) => {
      const participation = await getParticipation(db, member.id, event.id);
      const now = new Date();
      const eventStart = new Date(event.starts_at);
      const hasStarted = now >= eventStart;

      return {
        ...event,
        myRsvp: participation?.plannedStatus ?? null,
        rsvpLocked: hasStarted,
      };
    }),
  );

  // Get navigation to adjacent seasons
  const seasonNav = season
    ? await getSeasonNavigation(db, orgId, season.id)
    : { prev: null, next: null };

  // Check if user can create events
  const canCreate = canCreateEvents(member);

  return {
    events: eventsWithParticipation,
    season: season ? { id: season.id, name: season.name } : null,
    seasonNav,
    canCreate,
    currentMemberId: member.id,
  };
};
