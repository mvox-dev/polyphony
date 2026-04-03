// API endpoint for reassigning section assignments
// POST /api/sections/[id]/reassign - Move all assignments to another section
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { reassignSection, getSectionById } from "$lib/server/db/sections";

export async function POST({
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

  const sourceSectionId = params.id;
  if (!sourceSectionId) {
    throw error(400, "Source section ID is required");
  }

  // Parse request body
  const body = (await request.json()) as { targetSectionId?: string };

  if (!body.targetSectionId || typeof body.targetSectionId !== "string") {
    return json({ error: "Target section ID is required" }, { status: 400 });
  }

  const orgId = locals.org.id;

  // Validate source section exists
  const sourceSection = await getSectionById(db, sourceSectionId, orgId);
  if (!sourceSection) {
    throw error(404, "Source section not found");
  }

  // Validate target section exists
  const targetSection = await getSectionById(db, body.targetSectionId, orgId);
  if (!targetSection) {
    return json({ error: "Target section not found" }, { status: 400 });
  }

  // Can't reassign to self
  if (sourceSectionId === body.targetSectionId) {
    return json(
      { error: "Cannot reassign to the same section" },
      { status: 400 },
    );
  }

  // Perform reassignment
  const movedCount = await reassignSection(
    db,
    sourceSectionId,
    body.targetSectionId,
    orgId,
  );

  return json({
    success: true,
    movedCount,
    sourceSection: sourceSection.name,
    targetSection: targetSection.name,
  });
}
