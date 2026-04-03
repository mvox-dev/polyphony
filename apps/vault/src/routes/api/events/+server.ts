// API endpoints for events management
/// <reference types="@cloudflare/workers-types" />
import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { createEvents, getUpcomingEvents } from "$lib/server/db/events";
import { parseBody, createEventsSchema } from "$lib/server/validation/schemas";
import { canCreateEvents } from "$lib/server/auth/permissions";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";

/**
 * GET /api/events
 * Returns list of upcoming events
 * Requires: Authentication
 */
export async function GET(event: RequestEvent) {
  const { platform, cookies, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require authentication
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);

  const orgId = locals.org.id;

  const events = await getUpcomingEvents(db, orgId);
  return json(events);
}

/**
 * POST /api/events
 * Creates one or more events (batch creation)
 * Requires: Conductor role
 * Body: { events: [{ title, starts_at, event_type, description?, location?, ends_at? }] }
 */
export async function POST(event: RequestEvent) {
  const { platform, cookies, request, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require conductor permission
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  if (!canCreateEvents(member)) {
    throw error(403, "Only conductors and admins can create events");
  }

  const orgId = locals.org.id;

  const body = await parseBody(request, createEventsSchema);
  const createdEvents = await createEvents(db, orgId, body.events, member.id);

  return json({ events: createdEvents });
}
