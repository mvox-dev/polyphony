// POST /api/invites/[id]/renew - Extend invite expiration by 48 hours
import { json, error } from "@sveltejs/kit";
import { renewInvite } from "$lib/server/db/invites";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({
  params,
  platform,
  cookies,
  locals,
}) => {
  const db = platform?.env?.DB;
  if (!db) throw error(500, "Database not available");

  // Auth: get member and check admin role
  const currentMember = await getAuthenticatedMember(
    db,
    cookies,
    locals.org.id,
  );
  assertAdmin(currentMember);

  const invite = await renewInvite(db, params.id);

  if (!invite) {
    throw error(404, "Invite not found or already accepted");
  }

  return json(invite);
};
