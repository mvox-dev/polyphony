import type { PageServerLoad } from "./$types";
import { error } from "@sveltejs/kit";
import { getMemberById } from "$lib/server/db/members";
import { canManageEvents, canUploadScores } from "$lib/server/auth/permissions";
import type { Season } from "$lib/server/db/seasons";
import { getSeasonNavigation } from "$lib/server/db/seasons";
import type { Event } from "$lib/server/db/events";
import type { SeasonRepertoire, Work, Edition } from "$lib/types";
import { getEditionsByWorkId } from "$lib/server/db/editions";

interface SeasonWithEvents extends Season {
  events: Event[];
}

export const load: PageServerLoad = async ({
  params,
  fetch,
  platform,
  cookies,
  locals,
}) => {
  const seasonId = params.id;
  if (!seasonId) {
    throw error(400, "Season ID is required");
  }

  // Fetch season with events
  const [seasonResponse, repertoireResponse, worksResponse] = await Promise.all(
    [
      fetch(`/api/seasons/${seasonId}?events=true`),
      fetch(`/api/seasons/${seasonId}/works`),
      fetch(`/api/works`),
    ],
  );

  if (!seasonResponse.ok) {
    if (seasonResponse.status === 404) {
      throw error(404, "Season not found");
    }
    throw error(seasonResponse.status, "Failed to load season");
  }

  const season = (await seasonResponse.json()) as SeasonWithEvents;
  const repertoire = repertoireResponse.ok
    ? ((await repertoireResponse.json()) as SeasonRepertoire)
    : { seasonId, works: [] };
  const allWorks = worksResponse.ok
    ? ((await worksResponse.json()) as Work[])
    : [];

  // Get current user's permissions
  let canManage = false;
  let canManageLibrary = false;
  let seasonNav = { prev: null, next: null } as {
    prev: { id: string; name: string } | null;
    next: { id: string; name: string } | null;
  };

  const db = platform?.env?.DB;
  const memberId = cookies.get("member_id");

  // Build map of work editions (editions available per work for adding to repertoire)
  const workEditionsMap: Record<string, Edition[]> = {};

  if (db && memberId) {
    const member = await getMemberById(db, memberId, locals.org.id);
    if (member) {
      canManage = canManageEvents(member);
      canManageLibrary = canUploadScores(member);
    }

    // Get season navigation (prev/next)
    seasonNav = await getSeasonNavigation(db, season.orgId, seasonId);

    // Load editions for each work in repertoire (for edition management UI)
    for (const repWork of repertoire.works) {
      const editions = await getEditionsByWorkId(
        db,
        repWork.work.id,
        locals.org.id,
      );
      workEditionsMap[repWork.work.id] = editions;
    }
  }

  // Filter out works already in repertoire for the add dropdown
  const repertoireWorkIds = new Set(repertoire.works.map((w) => w.work.id));
  const availableWorks = allWorks.filter((w) => !repertoireWorkIds.has(w.id));

  return {
    season,
    events: season.events ?? [],
    repertoire,
    availableWorks,
    workEditionsMap,
    canManage,
    canManageLibrary,
    seasonNav,
  };
};
