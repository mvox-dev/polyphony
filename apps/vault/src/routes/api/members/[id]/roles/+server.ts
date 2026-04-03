// API endpoint for managing member roles
import { error, json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  getAuthenticatedMember,
  assertAdmin,
  isOwner as checkIsOwner,
} from "$lib/server/auth/middleware";
import { parseBody, updateRolesSchema } from "$lib/server/validation/schemas";
import {
  addMemberRole,
  removeMemberRole,
  countMembersWithRole,
} from "$lib/server/db/roles";

export const POST: RequestHandler = async ({
  params,
  request,
  platform,
  cookies,
  locals,
}) => {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  const orgId = locals.org.id;

  // Auth: get member and check admin role
  const currentMember = await getAuthenticatedMember(
    db,
    cookies,
    locals.org.id,
  );
  assertAdmin(currentMember);
  const isOwner = checkIsOwner(currentMember);

  // Validate request body with Zod
  const { role, action } = await parseBody(request, updateRolesSchema);

  // Only owners can manage owner role
  if (role === "owner" && !isOwner) {
    throw error(403, "Only owners can manage owner role");
  }

  const targetMemberId = params.id;

  // Prevent removing last owner
  if (role === "owner" && action === "remove") {
    const ownerCount = await countMembersWithRole(db, "owner", orgId);
    if (ownerCount <= 1) {
      throw error(400, "Cannot remove the last owner");
    }
  }

  try {
    if (action === "add") {
      await addMemberRole(db, targetMemberId, role, currentMember.id, orgId);
    } else {
      await removeMemberRole(db, targetMemberId, role, orgId);
    }

    return json({ success: true });
  } catch (err) {
    console.error("Failed to update role:", err);
    throw error(500, "Failed to update role");
  }
};
