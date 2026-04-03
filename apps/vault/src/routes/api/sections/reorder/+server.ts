// API endpoint for reordering sections
// POST /api/sections/reorder - Update display order
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  reorderSections,
  getAllSectionsWithCounts,
} from "$lib/server/db/sections";

/** Validate request body for section reordering */
function validateReorderRequest(body: {
  sectionIds?: string[];
}): string | null {
  if (!Array.isArray(body.sectionIds) || body.sectionIds.length === 0) {
    return "sectionIds must be a non-empty array";
  }
  if (!body.sectionIds.every((id) => typeof id === "string")) {
    return "All section IDs must be strings";
  }
  return null;
}

export async function POST({
  request,
  platform,
  cookies,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) throw error(500, "Database not available");

  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  const body = (await request.json()) as { sectionIds?: string[] };
  const validationError = validateReorderRequest(body);
  if (validationError) return json({ error: validationError }, { status: 400 });

  try {
    await reorderSections(db, body.sectionIds!, locals.org.id);
    const sections = await getAllSectionsWithCounts(db, locals.org.id);
    return json(sections);
  } catch (err) {
    console.error("Failed to reorder sections:", err);
    return json(
      {
        error:
          err instanceof Error ? err.message : "Failed to reorder sections",
      },
      { status: 500 },
    );
  }
}
