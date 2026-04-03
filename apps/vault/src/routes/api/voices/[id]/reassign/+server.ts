// API endpoint for reassigning voice assignments
// POST /api/voices/[id]/reassign - Move all assignments to another voice
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { reassignVoice, getVoiceById } from "$lib/server/db/voices";

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

  const sourceVoiceId = params.id;
  if (!sourceVoiceId) {
    throw error(400, "Source voice ID is required");
  }

  // Parse request body
  const body = (await request.json()) as { targetVoiceId?: string };

  if (!body.targetVoiceId || typeof body.targetVoiceId !== "string") {
    return json({ error: "Target voice ID is required" }, { status: 400 });
  }

  // Validate source voice exists
  const sourceVoice = await getVoiceById(db, sourceVoiceId, locals.org.id);
  if (!sourceVoice) {
    throw error(404, "Source voice not found");
  }

  // Validate target voice exists
  const targetVoice = await getVoiceById(db, body.targetVoiceId, locals.org.id);
  if (!targetVoice) {
    return json({ error: "Target voice not found" }, { status: 400 });
  }

  // Can't reassign to self
  if (sourceVoiceId === body.targetVoiceId) {
    return json(
      { error: "Cannot reassign to the same voice" },
      { status: 400 },
    );
  }

  // Perform reassignment
  const movedCount = await reassignVoice(
    db,
    sourceVoiceId,
    body.targetVoiceId,
    locals.org.id,
  );

  return json({
    success: true,
    movedCount,
    sourceVoice: sourceVoice.name,
    targetVoice: targetVoice.name,
  });
}
