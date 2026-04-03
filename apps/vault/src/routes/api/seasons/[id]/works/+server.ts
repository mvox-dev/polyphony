// Season repertoire (works) API
// GET /api/seasons/:id/works - Get all works in season
// POST /api/seasons/:id/works - Add work to season
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getSeasonRepertoire,
  addWorkToSeason,
} from "$lib/server/db/season-repertoire";
import { getSeason } from "$lib/server/db/seasons";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";

async function requireSeason(
  db: D1Database,
  seasonId: string,
  orgId: import("@polyphony/shared").OrgId,
) {
  const season = await getSeason(db, seasonId, orgId);
  if (!season) throw error(404, "Season not found");
  return season;
}

export const GET: RequestHandler = async ({ params, platform, locals }) => {
  if (!platform?.env?.DB) throw error(500, "Database not available");
  const db = platform.env.DB;

  await requireSeason(db, params.id, locals.org.id);
  const repertoire = await getSeasonRepertoire(db, params.id);
  return json(repertoire);
};

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
  await requireSeason(db, params.id, locals.org.id);

  const body = (await request.json()) as { workId?: string; notes?: string };
  if (!body.workId || typeof body.workId !== "string") {
    return json({ error: "workId is required" }, { status: 400 });
  }

  try {
    const seasonWork = await addWorkToSeason(
      db,
      params.id,
      body.workId,
      member.id,
      body.notes ?? null,
    );
    return json(seasonWork, { status: 201 });
  } catch (err) {
    if (
      err instanceof Error &&
      err.message.includes("already in this season")
    ) {
      return json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
};
