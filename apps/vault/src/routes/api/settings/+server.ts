// API endpoint for vault settings
// GET - retrieve all settings (admin only)
// PATCH - update settings (admin only)
import { json } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { getAllSettings, setSetting } from "$lib/server/db/settings";
import {
  parseBody,
  updateSettingsSchema,
} from "$lib/server/validation/schemas";

/**
 * GET /api/settings
 * Retrieve all vault settings (admin only)
 */
export async function GET(event: RequestEvent) {
  const { platform, cookies, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require admin role
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  const settings = await getAllSettings(db, locals.org.id);
  return json(settings);
}

/**
 * PATCH /api/settings
 * Update vault settings (admin only)
 */
export async function PATCH(event: RequestEvent) {
  const { request, platform, cookies, locals } = event;
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require admin role
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  // Validate request body
  const updates = await parseBody(request, updateSettingsSchema);

  // Update each provided setting
  const updatePromises = Object.entries(updates).map(([key, value]) =>
    setSetting(db, key, String(value), member.id, locals.org.id),
  );
  await Promise.all(updatePromises);

  // Return updated settings
  const settings = await getAllSettings(db, locals.org.id);
  return json(settings);
}
