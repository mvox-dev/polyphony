// API endpoints for single event management
/// <reference types="@cloudflare/workers-types" />
import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { getEventById, updateEvent, deleteEvent } from "$lib/server/db/events";
import { parseBody, updateEventSchema } from "$lib/server/validation/schemas";
import { canManageEvents, canDeleteEvents } from "$lib/server/auth/permissions";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";

/**
 * GET /api/events/[id]
 * Returns details for a specific event
 * Requires: Authentication
 */
export async function GET(event: RequestEvent) {
  const { platform, cookies, params, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require authentication
  await getAuthenticatedMember(db, cookies, locals.org.id);

  const eventId = params.id;
  if (!eventId) {
    throw error(400, "Event ID required");
  }

  const eventData = await getEventById(db, eventId, locals.org.id);
  if (!eventData) {
    throw error(404, "Event not found");
  }

  return json(eventData);
}

/**
 * PATCH /api/events/[id]
 * Updates an event
 * Requires: Conductor role (manage events permission)
 */
export async function PATCH(event: RequestEvent) {
  const { platform, cookies, params, request, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require manage events permission
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  if (!canManageEvents(member)) {
    throw error(403, "Only conductors and admins can manage events");
  }

  const eventId = params.id;
  if (!eventId) {
    throw error(400, "Event ID required");
  }

  const body = await parseBody(request, updateEventSchema);
  const success = await updateEvent(db, eventId, body, locals.org.id);

  if (!success) {
    throw error(404, "Event not found");
  }

  // Fetch and return the updated event
  const updated = await getEventById(db, eventId, locals.org.id);
  return json(updated);
}

/**
 * DELETE /api/events/[id]
 * Deletes an event
 * Requires: Conductor role (delete events permission)
 */
export async function DELETE(event: RequestEvent) {
  const { platform, cookies, params, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require delete events permission
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  if (!canDeleteEvents(member)) {
    throw error(403, "Only conductors and admins can delete events");
  }

  const eventId = params.id;
  if (!eventId) {
    throw error(400, "Event ID required");
  }

  const deleted = await deleteEvent(db, eventId, locals.org.id);

  if (!deleted) {
    throw error(404, "Event not found");
  }

  return json({ message: "Event deleted successfully" });
}
