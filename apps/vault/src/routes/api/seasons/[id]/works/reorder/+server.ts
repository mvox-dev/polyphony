// Season works reorder API
// POST /api/seasons/:id/works/reorder - Reorder works in season
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { reorderSeasonWorks } from "$lib/server/db/season-repertoire";
import { getSeason } from "$lib/server/db/seasons";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";

export const POST: RequestHandler = async ({
  params,
  request,
  platform,
  cookies,
  locals,
}) => {
  if (!platform?.env?.DB) throw error(500, "Database not available");

  const db = platform.env.DB;
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertLibrarian(member);

  const season = await getSeason(db, params.id, locals.org.id);
  if (!season) throw error(404, "Season not found");

  let body: { seasonWorkIds: string[] };
  try {
    body = await request.json();
  } catch {
    throw error(400, "Invalid JSON body");
  }

  if (!Array.isArray(body.seasonWorkIds) || body.seasonWorkIds.length === 0) {
    throw error(400, "seasonWorkIds array is required");
  }

  await reorderSeasonWorks(db, params.id, body.seasonWorkIds);
  return json({ success: true });
};
