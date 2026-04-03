// Event work editions API
// POST /api/events/:id/works/:workId/editions - Add edition to work
// Issue #121
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  addEditionToEventWork,
  getEventWork,
} from "$lib/server/db/event-repertoire";
import { getEventById } from "$lib/server/db/events";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";

async function requireEventWork(
  db: D1Database,
  eventId: string,
  eventWorkId: string,
  orgId: import("@polyphony/shared").OrgId,
) {
  const event = await getEventById(db, eventId, orgId);
  if (!event) throw error(404, "Event not found");

  const eventWork = await getEventWork(db, eventWorkId);
  if (!eventWork || eventWork.event_id !== eventId)
    throw error(404, "Work not found in event");
  return eventWork;
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

  await requireEventWork(db, params.id, params.workId, locals.org.id);
  const body = await parseAndValidateBody(request);

  try {
    const workEdition = await addEditionToEventWork(db, {
      eventWorkId: params.workId,
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
