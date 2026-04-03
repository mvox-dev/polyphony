// Event repertoire work API
// DELETE /api/events/:id/works/:workId - Remove work from event
// PATCH /api/events/:id/works/:workId - Update work notes
// Issue #121
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  removeWorkFromEvent,
  updateEventWorkNotes,
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
  await removeWorkFromEvent(db, params.workId);

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

  let body: { notes?: string | null };
  try {
    body = await request.json();
  } catch {
    throw error(400, "Invalid JSON body");
  }

  if (body.notes !== undefined) {
    await updateEventWorkNotes(db, params.workId, body.notes ?? null);
  }

  const updated = await getEventWork(db, params.workId);
  return json(updated);
};
