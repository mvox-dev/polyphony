// Event repertoire (works) API
// GET /api/events/:id/works - Get all works in event
// POST /api/events/:id/works - Add work to event
// Issue #121
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getEventRepertoire,
  addWorkToEvent,
} from "$lib/server/db/event-repertoire";
import { getEventById } from "$lib/server/db/events";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";

async function requireEvent(
  db: D1Database,
  eventId: string,
  orgId: import("@polyphony/shared").OrgId,
) {
  const event = await getEventById(db, eventId, orgId);
  if (!event) throw error(404, "Event not found");
  return event;
}

export const GET: RequestHandler = async ({ params, platform, locals }) => {
  if (!platform?.env?.DB) throw error(500, "Database not available");
  const db = platform.env.DB;

  await requireEvent(db, params.id, locals.org.id);
  const repertoire = await getEventRepertoire(db, params.id);
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
  await requireEvent(db, params.id, locals.org.id);

  const body = (await request.json()) as { workId?: string; notes?: string };
  if (!body.workId || typeof body.workId !== "string") {
    return json({ error: "workId is required" }, { status: 400 });
  }

  try {
    const eventWork = await addWorkToEvent(
      db,
      params.id,
      body.workId,
      member.id,
      body.notes ?? null,
    );
    return json(eventWork, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already in this event")) {
      return json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
};
