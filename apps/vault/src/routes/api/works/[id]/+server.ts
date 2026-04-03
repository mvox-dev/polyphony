// API endpoint for individual work operations
// GET /api/works/[id] - Get a work by ID
// PATCH /api/works/[id] - Update a work
// DELETE /api/works/[id] - Delete a work
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import { getWorkById, updateWork, deleteWork } from "$lib/server/db/works";
import type { UpdateWorkInput } from "$lib/types";

export async function GET({ params, platform, cookies, locals }: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Auth: any authenticated member can view works
  await getAuthenticatedMember(db, cookies, locals.org.id);

  const workId = params.id;
  if (!workId) {
    throw error(400, "Work ID is required");
  }

  const work = await getWorkById(db, workId, locals.org.id);
  if (!work) {
    throw error(404, "Work not found");
  }

  return json(work);
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

  // Auth: require librarian role to update works
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertLibrarian(member);

  const workId = params.id;
  if (!workId) {
    throw error(400, "Work ID is required");
  }

  // Parse request body
  const body = (await request.json()) as Partial<UpdateWorkInput>;

  // Build update input (only include provided fields)
  const input: UpdateWorkInput = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim().length === 0) {
      return json({ error: "Title cannot be empty" }, { status: 400 });
    }
    input.title = body.title.trim();
  }

  if (body.composer !== undefined) {
    // Allow null to clear, or string value
    if (body.composer === null) {
      input.composer = null;
    } else if (typeof body.composer === "string") {
      input.composer = body.composer.trim() || null;
    }
  }

  if (body.lyricist !== undefined) {
    // Allow null to clear, or string value
    if (body.lyricist === null) {
      input.lyricist = null;
    } else if (typeof body.lyricist === "string") {
      input.lyricist = body.lyricist.trim() || null;
    }
  }

  const work = await updateWork(db, workId, input, locals.org.id);
  if (!work) {
    throw error(404, "Work not found");
  }

  return json(work);
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

  // Auth: require librarian role to delete works
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertLibrarian(member);

  const workId = params.id;
  if (!workId) {
    throw error(400, "Work ID is required");
  }

  const deleted = await deleteWork(db, workId, locals.org.id);
  if (!deleted) {
    throw error(404, "Work not found");
  }

  return json({ success: true });
}
