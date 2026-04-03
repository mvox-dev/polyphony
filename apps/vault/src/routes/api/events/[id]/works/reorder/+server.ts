// Event works reorder API
// POST /api/events/:id/works/reorder - Reorder works in event
// Issue #121
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { reorderEventWorks } from "$lib/server/db/event-repertoire";
import { getEventById } from "$lib/server/db/events";
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

  const event = await getEventById(db, params.id, locals.org.id);
  if (!event) throw error(404, "Event not found");

  let body: { eventWorkIds: string[] };
  try {
    body = await request.json();
  } catch {
    throw error(400, "Invalid JSON body");
  }

  if (!Array.isArray(body.eventWorkIds) || body.eventWorkIds.length === 0) {
    throw error(400, "eventWorkIds array is required");
  }

  await reorderEventWorks(db, params.id, body.eventWorkIds);
  return json({ success: true });
};
