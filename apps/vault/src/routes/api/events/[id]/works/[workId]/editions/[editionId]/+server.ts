// Event work edition API
// DELETE /api/events/:id/works/:workId/editions/:editionId - Remove edition from work
// PATCH /api/events/:id/works/:workId/editions/:editionId - Set as primary or update notes
// Issue #121
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  removeEditionFromEventWork,
  setPrimaryEdition,
  updateEventWorkEditionNotes,
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
  if (!eventWork || eventWork.event_id !== eventId) {
    throw error(404, "Work not found in event");
  }
  return eventWork;
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

  await requireEventWork(db, params.id, params.workId, locals.org.id);
  const deleted = await removeEditionFromEventWork(db, params.editionId);
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

  await requireEventWork(db, params.id, params.workId, locals.org.id);

  let body: { isPrimary?: boolean; notes?: string | null };
  try {
    body = await request.json();
  } catch {
    throw error(400, "Invalid JSON body");
  }

  if (body.isPrimary === true) {
    await setPrimaryEdition(db, params.workId, params.editionId);
  }

  if (body.notes !== undefined) {
    await updateEventWorkEditionNotes(db, params.editionId, body.notes ?? null);
  }

  return json({ success: true });
};
