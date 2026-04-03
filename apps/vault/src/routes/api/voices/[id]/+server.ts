// API endpoint for managing individual voices
// PATCH /api/voices/[id] - Toggle voice active status
// DELETE /api/voices/[id] - Delete voice (if no assignments)
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  toggleVoiceActive,
  getVoiceById,
  deleteVoice,
} from "$lib/server/db/voices";

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

  const voiceId = params.id;
  if (!voiceId) {
    throw error(400, "Voice ID is required");
  }

  // Parse request body
  const body = (await request.json()) as { isActive?: boolean };

  if (typeof body.isActive !== "boolean") {
    return json({ error: "isActive must be a boolean" }, { status: 400 });
  }

  // Toggle the voice (org-scoped)
  const updated = await toggleVoiceActive(
    db,
    voiceId,
    body.isActive,
    locals.org.id,
  );

  if (!updated) {
    throw error(404, "Voice not found");
  }

  // Return updated voice
  const voice = await getVoiceById(db, voiceId, locals.org.id);
  return json(voice);
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

  const voiceId = params.id;
  if (!voiceId) {
    throw error(400, "Voice ID is required");
  }

  try {
    const deleted = await deleteVoice(db, voiceId, locals.org.id);
    if (!deleted) {
      throw error(404, "Voice not found");
    }
    return json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message.includes("assignments")) {
      return json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
