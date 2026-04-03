// API endpoint for managing individual sections
// PATCH /api/sections/[id] - Toggle section active status
// DELETE /api/sections/[id] - Delete section (if no assignments)
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  toggleSectionActive,
  getSectionById,
  deleteSection,
} from "$lib/server/db/sections";

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

  // Auth: require admin
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  const sectionId = params.id;
  if (!sectionId) {
    throw error(400, "Section ID is required");
  }

  // Parse request body
  const body = (await request.json()) as { isActive?: boolean };

  if (typeof body.isActive !== "boolean") {
    return json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  // Toggle the section
  const updated = await toggleSectionActive(
    db,
    sectionId,
    body.isActive,
    locals.org.id,
  );

  if (!updated) {
    throw error(404, "Section not found");
  }

  // Return updated section
  const section = await getSectionById(db, sectionId, locals.org.id);
  return json(section);
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

  // Auth: require admin
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  const sectionId = params.id;
  if (!sectionId) {
    throw error(400, "Section ID is required");
  }

  try {
    const deleted = await deleteSection(db, sectionId, locals.org.id);
    if (!deleted) {
      throw error(404, "Section not found");
    }
    return json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("assignments")) {
      return json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
