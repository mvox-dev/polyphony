// Season work edition API
// DELETE /api/seasons/:id/works/:workId/editions/:editionId - Remove edition from work
// PATCH /api/seasons/:id/works/:workId/editions/:editionId - Set as primary
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  removeEditionFromSeasonWork,
  setPrimaryEdition,
  getSeasonWork,
} from "$lib/server/db/season-repertoire";
import { getSeason } from "$lib/server/db/seasons";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";

async function requireSeasonWork(
  db: D1Database,
  seasonId: string,
  seasonWorkId: string,
  orgId: import("@polyphony/shared").OrgId,
) {
  const season = await getSeason(db, seasonId, orgId);
  if (!season) throw error(404, "Season not found");

  const seasonWork = await getSeasonWork(db, seasonWorkId);
  if (!seasonWork || seasonWork.season_id !== seasonId) {
    throw error(404, "Work not found in season");
  }
  return seasonWork;
}

export const DELETE: RequestHandler = async ({
  params,
  platform,
  cookies,
  locals,
}) => {
  if (!platform?.env?.DB) throw error(500, "Database not available");

  const db = platform.env.DB;
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertLibrarian(member);

  await requireSeasonWork(db, params.id, params.workId, locals.org.id);
  const deleted = await removeEditionFromSeasonWork(db, params.editionId);
  if (!deleted) throw error(404, "Edition not found");

  return new Response(null, { status: 204 });
};

export const PATCH: RequestHandler = async ({
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

  await requireSeasonWork(db, params.id, params.workId, locals.org.id);

  let body: { isPrimary?: boolean };
  try {
    body = await request.json();
  } catch {
    throw error(400, "Invalid JSON body");
  }

  if (body.isPrimary === true) {
    await setPrimaryEdition(db, params.workId, params.editionId);
  }

  return json({ success: true });
};
