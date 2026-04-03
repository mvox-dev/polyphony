// API endpoint for member i18n preferences (Issue #186)
// GET /api/profile/preferences - Get member preferences
// PATCH /api/profile/preferences - Update member preferences

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import {
  getMemberPreferences,
  setMemberPreferences,
} from "$lib/server/db/member-preferences";
import type { UpdateMemberPreferencesInput } from "$lib/types";

interface UpdatePreferencesBody {
  language?: string | null;
  locale?: string | null;
  timezone?: string | null;
}

/** Parse request body into UpdateMemberPreferencesInput */
function parseUpdateInput(
  body: UpdatePreferencesBody,
): UpdateMemberPreferencesInput {
  const input: UpdateMemberPreferencesInput = {};
  if ("language" in body) input.language = body.language;
  if ("locale" in body) input.locale = body.locale;
  if ("timezone" in body) input.timezone = body.timezone;
  return input;
}

export const GET: RequestHandler = async ({ platform, cookies, locals }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(500, "Database not available");

  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  const prefs = await getMemberPreferences(db, member.id);

  return json(prefs);
};

export const PATCH: RequestHandler = async ({
  request,
  platform,
  cookies,
  locals,
}) => {
  const db = platform?.env?.DB;
  if (!db) throw error(500, "Database not available");

  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  const body = (await request.json()) as UpdatePreferencesBody;
  const updated = await setMemberPreferences(
    db,
    member.id,
    parseUpdateInput(body),
  );

  // Set Paraglide locale cookie when language changes
  // This syncs the DB preference with Paraglide's cookie-based strategy
  if (updated.language) {
    cookies.set("PARAGLIDE_LOCALE", updated.language, {
      path: "/",
      maxAge: 60 * 60 * 24 * 400, // ~400 days (same as Paraglide default)
      httpOnly: false, // Paraglide needs to read this client-side
      sameSite: "lax",
    });
  } else {
    // Clear cookie if language is set to null (use system default)
    cookies.delete("PARAGLIDE_LOCALE", { path: "/" });
  }

  return json(updated);
};
