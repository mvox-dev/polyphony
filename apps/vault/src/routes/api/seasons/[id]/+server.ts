// API endpoint for individual season operations
// GET /api/seasons/[id] - Get a season by ID (with optional events)
// PATCH /api/seasons/[id] - Update a season
// DELETE /api/seasons/[id] - Delete a season
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  getSeason,
  getSeasonEvents,
  updateSeason,
  deleteSeason,
} from "$lib/server/db/seasons";

export async function GET({
  params,
  url,
  platform,
  cookies,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Auth: any authenticated member can view seasons
  await getAuthenticatedMember(db, cookies, locals.org.id);

  const seasonId = params.id;
  if (!seasonId) {
    throw error(400, "Season ID is required");
  }

  const orgId = locals.org.id;
  const season = await getSeason(db, seasonId, orgId);
  if (!season) {
    throw error(404, "Season not found");
  }

  // Check if events should be included
  const includeEvents = url.searchParams.get("events") === "true";

  if (includeEvents) {
    const events = await getSeasonEvents(db, seasonId, orgId);
    return json({ ...season, events });
  }

  return json(season);
}

export async function PATCH({
  params,
  request,
  platform,
  cookies,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Auth: require admin role to update seasons
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  const seasonId = params.id;
  if (!seasonId) {
    throw error(400, "Season ID is required");
  }

  // Parse request body
  const body = (await request.json()) as { name?: string; start_date?: string };

  // Build update input (only include provided fields)
  const input: { name?: string; start_date?: string } = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return json({ error: "Name cannot be empty" }, { status: 400 });
    }
    input.name = body.name.trim();
  }

  if (body.start_date !== undefined) {
    if (typeof body.start_date !== "string") {
      return json({ error: "Start date must be a string" }, { status: 400 });
    }
    // Validate date format (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(body.start_date)) {
      return json(
        { error: "Start date must be in YYYY-MM-DD format" },
        { status: 400 },
      );
    }
    input.start_date = body.start_date;
  }

  try {
    const updated = await updateSeason(db, seasonId, input, locals.org.id);
    if (!updated) {
      throw error(404, "Season not found");
    }
    return json(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      return json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}

export async function DELETE({
  params,
  platform,
  cookies,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Auth: require admin role to delete seasons
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  const seasonId = params.id;
  if (!seasonId) {
    throw error(400, "Season ID is required");
  }

  const deleted = await deleteSeason(db, seasonId, locals.org.id);
  if (!deleted) {
    throw error(404, "Season not found");
  }

  return json({ success: true });
}
