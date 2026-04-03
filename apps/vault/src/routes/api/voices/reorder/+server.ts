// API endpoint for reordering voices
// POST /api/voices/reorder - Update display order
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { reorderVoices, getAllVoicesWithCounts } from "$lib/server/db/voices";

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

  // Auth: require admin
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  // Parse request body
  const body = (await request.json()) as { voiceIds?: string[] };

  if (!Array.isArray(body.voiceIds) || body.voiceIds.length === 0) {
    return json(
      { error: "voiceIds must be a non-empty array" },
      { status: 400 },
    );
  }

  // Validate all IDs are strings
  if (!body.voiceIds.every((id) => typeof id === "string")) {
    return json(
      { error: "voiceIds must contain only strings" },
      { status: 400 },
    );
  }

  await reorderVoices(db, body.voiceIds, locals.org.id);

  // Return updated voices list
  const voices = await getAllVoicesWithCounts(db, locals.org.id);
  return json(voices);
}
