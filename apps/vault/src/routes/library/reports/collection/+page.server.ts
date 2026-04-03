// Collection Reminders page server
// Issue #126 - Outstanding copies that need to be collected after a season
import type { PageServerLoad } from "./$types";
import { error, redirect } from "@sveltejs/kit";
import { getMemberById } from "$lib/server/db/members";
import { canUploadScores } from "$lib/server/auth/permissions";
import { getOutstandingCopiesForSeason } from "$lib/server/db/inventory-reports";
import { getAllSeasons } from "$lib/server/db/seasons";

export const load: PageServerLoad = async ({
  platform,
  cookies,
  url,
  locals,
}) => {
  const db = platform?.env?.DB;
  if (!db) throw error(500, "Database not available");

  // Auth check
  const memberId = cookies.get("member_id");
  if (!memberId) throw redirect(302, "/");

  // Permission check
  const member = await getMemberById(db, memberId, locals.org.id);
  if (!canUploadScores(member)) throw redirect(302, "/");

  const orgId = locals.org.id;

  // Get all seasons for this organization
  const seasons = await getAllSeasons(db, orgId);

  // Get selected season from query param, or default to most recent season
  const seasonId = url.searchParams.get("season");
  const selectedSeasonId = seasonId ?? seasons[0]?.id ?? null;

  // Get outstanding copies for selected season
  let outstandingByMember: Awaited<
    ReturnType<typeof getOutstandingCopiesForSeason>
  > = [];
  if (selectedSeasonId) {
    outstandingByMember = await getOutstandingCopiesForSeason(
      db,
      selectedSeasonId,
    );
  }

  // Calculate total
  const totalOutstanding = outstandingByMember.reduce(
    (sum, m) => sum + m.copies.length,
    0,
  );

  return {
    seasons,
    selectedSeasonId,
    outstandingByMember,
    totalOutstanding,
    memberCount: outstandingByMember.length,
  };
};
