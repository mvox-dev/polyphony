// API endpoint for roster view
/// <reference types="@cloudflare/workers-types" />
import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import { getRosterView } from "$lib/server/db/roster";
import { getRosterQuerySchema } from "$lib/server/validation/schemas";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";

/**
 * GET /api/events/roster
 * Returns roster view with events, members, and participation data
 * Requires: Authentication
 *
 * Query parameters:
 * - start: ISO 8601 datetime (required) - Start date for event filter
 * - end: ISO 8601 datetime (required) - End date for event filter
 * - sectionId: string (optional) - Filter members by section
 */
function parseQueryParams(url: URL) {
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const sectionIdParam = url.searchParams.get("sectionId");

  const queryParams: Record<string, unknown> = {};
  if (startParam) queryParams.start = startParam;
  if (endParam) queryParams.end = endParam;
  if (sectionIdParam) queryParams.sectionId = sectionIdParam;

  const result = getRosterQuerySchema.safeParse(queryParams);
  if (!result.success) {
    const errorMessage =
      result.error.issues?.[0]?.message || "Invalid query parameters";
    throw error(400, errorMessage);
  }

  return result.data;
}

export async function GET(event: RequestEvent) {
  const { platform, cookies, url, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  await getAuthenticatedMember(db, cookies, locals.org.id);

  const { start, end, sectionId } = parseQueryParams(url);

  const filters = {
    orgId: event.locals.org.id,
    start,
    end,
    ...(sectionId && { sectionId }),
  };

  const roster = await getRosterView(db, locals.org.id, filters);

  return json(roster);
}
