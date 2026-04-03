// GET /api/internal/stats — Platform-wide aggregate statistics
// Issue #275 — Internal API authenticated via shared NOTIFY_API_KEY

import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ request, platform }) => {
  const env = platform?.env;
  const apiKey = env?.NOTIFY_API_KEY;

  // Validate Bearer token against NOTIFY_API_KEY
  if (!apiKey) {
    throw error(401, "Unauthorized");
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== apiKey) {
    throw error(401, "Unauthorized");
  }

  const db = env!.DB;

  // Run aggregate queries in parallel
  const [members, orgs, works, editions, fileSize, eventRows] =
    await Promise.all([
      db
        .prepare("SELECT COUNT(*) AS count FROM members")
        .first<{ count: number }>(),
      db
        .prepare("SELECT COUNT(*) AS count FROM organizations")
        .first<{ count: number }>(),
      db
        .prepare("SELECT COUNT(*) AS count FROM works")
        .first<{ count: number }>(),
      db
        .prepare("SELECT COUNT(*) AS count FROM editions")
        .first<{ count: number }>(),
      db
        .prepare(
          "SELECT COALESCE(SUM(size), 0) AS total_size FROM edition_files",
        )
        .first<{ total_size: number }>(),
      db
        .prepare(
          `SELECT event_type, COUNT(*) AS count FROM events WHERE date(starts_at) = date('now') GROUP BY event_type`,
        )
        .all<{ event_type: string; count: number }>(),
    ]);

  // Build events_today with all 4 types defaulting to 0
  const events_today: Record<string, number> = {
    rehearsal: 0,
    concert: 0,
    retreat: 0,
    festival: 0,
  };
  for (const row of eventRows.results) {
    if (row.event_type in events_today) {
      events_today[row.event_type] = row.count;
    }
  }

  return json({
    member_count: members?.count ?? 0,
    org_count: orgs?.count ?? 0,
    works_count: works?.count ?? 0,
    editions_count: editions?.count ?? 0,
    total_file_size: fileSize?.total_size ?? 0,
    events_today,
  });
};
