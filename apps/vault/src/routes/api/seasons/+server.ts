// API endpoint for seasons collection operations
// GET /api/seasons - List all seasons
// POST /api/seasons - Create a new season
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  createSeason,
  getAllSeasons,
  getSeasonByDate,
} from "$lib/server/db/seasons";

export async function GET({ url, platform, cookies, locals }: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Auth: any authenticated member can view seasons
  await getAuthenticatedMember(db, cookies, locals.org.id);

  const orgId = locals.org.id;

  // Check for date query parameter
  const dateParam = url.searchParams.get("date");

  if (dateParam) {
    // Find which season contains this date
    const season = await getSeasonByDate(db, orgId, dateParam);
    return json(season);
  }

  const seasons = await getAllSeasons(db, orgId);
  return json(seasons);
}

export async function POST({
  request,
  platform,
  cookies,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Auth: require admin role to create seasons
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  const orgId = locals.org.id;

  // Parse request body
  const body = (await request.json()) as { name?: string; start_date?: string };

  // Validate required fields
  if (
    !body.name ||
    typeof body.name !== "string" ||
    body.name.trim().length === 0
  ) {
    return json({ error: "Name is required" }, { status: 400 });
  }

  if (!body.start_date || typeof body.start_date !== "string") {
    return json({ error: "Start date is required" }, { status: 400 });
  }

  // Validate date format (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(body.start_date)) {
    return json(
      { error: "Start date must be in YYYY-MM-DD format" },
      { status: 400 },
    );
  }

  try {
    const season = await createSeason(db, {
      orgId,
      name: body.name.trim(),
      start_date: body.start_date,
    });
    return json(season, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      return json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
