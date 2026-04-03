// Season work editions API
// POST /api/seasons/:id/works/:workId/editions - Add edition to work
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  addEditionToSeasonWork,
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
  if (!seasonWork || seasonWork.season_id !== seasonId)
    throw error(404, "Work not found in season");
  return seasonWork;
}

async function parseAndValidateBody(
  request: Request,
): Promise<{ editionId: string; isPrimary?: boolean; notes?: string }> {
  const body = (await request.json().catch(() => {
    throw error(400, "Invalid JSON body");
  })) as Record<string, unknown>;
  if (!body.editionId || typeof body.editionId !== "string")
    throw error(400, "editionId is required");
  return {
    editionId: body.editionId,
    isPrimary: body.isPrimary as boolean | undefined,
    notes: body.notes as string | undefined,
  };
}

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

  await requireSeasonWork(db, params.id, params.workId, locals.org.id);
  const body = await parseAndValidateBody(request);

  try {
    const workEdition = await addEditionToSeasonWork(db, {
      seasonWorkId: params.workId,
      editionId: body.editionId,
      addedBy: member.id,
      isPrimary: body.isPrimary ?? false,
      notes: body.notes ?? null,
    });
    return json(workEdition, { status: 201 });
  } catch (e) {
    if (e instanceof Error && e.message.includes("already selected"))
      throw error(409, e.message);
    throw e;
  }
};
