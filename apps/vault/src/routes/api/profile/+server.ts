// API endpoint for updating user profile
// PATCH /api/profile
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import { updateMemberName } from "$lib/server/db/members";

interface UpdateProfileRequest {
  name: string;
}

export const PATCH: RequestHandler = async ({
  request,
  platform,
  cookies,
  locals,
}) => {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Authenticate
  const currentMember = await getAuthenticatedMember(
    db,
    cookies,
    locals.org.id,
  );

  // Parse and validate request body
  const body = (await request.json()) as UpdateProfileRequest;

  if (!body.name || typeof body.name !== "string") {
    return json({ error: "Name is required" }, { status: 400 });
  }

  const trimmedName = body.name.trim();
  if (trimmedName.length === 0) {
    return json({ error: "Name cannot be empty" }, { status: 400 });
  }

  // Update name with uniqueness validation
  try {
    const updated = await updateMemberName(
      db,
      currentMember.id,
      trimmedName,
      locals.org.id,
    );
    return json(updated);
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      return json(
        { error: "A member with this name already exists" },
        { status: 409 },
      );
    }
    console.error("Failed to update member name:", err);
    return json(
      { error: err instanceof Error ? err.message : "Failed to update name" },
      { status: 500 },
    );
  }
};
