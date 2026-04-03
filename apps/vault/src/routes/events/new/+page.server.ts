// Server-side loader for create event page
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import { canCreateEvents } from "$lib/server/auth/permissions";
import { getSetting } from "$lib/server/db/settings";

export const load: PageServerLoad = async ({ platform, cookies, locals }) => {
  if (!platform) throw error(500, "Platform not available");
  const db = platform.env.DB;

  // Require authentication
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);

  // Redirect non-conductors
  if (!canCreateEvents(member)) {
    throw redirect(303, "/events");
  }

  // Load vault settings for default event duration
  const defaultDuration =
    (await getSetting(db, "default_event_duration", locals.org.id)) || "2";

  return {
    defaultDuration: parseInt(defaultDuration, 10),
  };
};
