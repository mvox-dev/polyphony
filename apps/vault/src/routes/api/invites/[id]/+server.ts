// DELETE /api/invites/[id] - Revoke a pending invite
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { revokeInvite } from "$lib/server/db/invites";

export const DELETE: RequestHandler = async ({
  params,
  platform,
  cookies,
  locals,
}) => {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Auth: get member and check admin role
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  const inviteId = params.id;
  if (!inviteId) {
    throw error(400, "Invite ID required");
  }

  const revoked = await revokeInvite(db, inviteId);

  if (!revoked) {
    throw error(404, "Invite not found or already accepted");
  }

  return json({ success: true });
};
