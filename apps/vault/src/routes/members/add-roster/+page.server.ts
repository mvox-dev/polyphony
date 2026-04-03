// Server load for add roster member page
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { getActiveVoices } from "$lib/server/db/voices";
import { getActiveSections } from "$lib/server/db/sections";

export const load: PageServerLoad = async ({ platform, cookies, locals }) => {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Authenticate and authorize
  const currentUser = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(currentUser);

  const orgId = locals.org.id;

  // Load available voices and sections for multi-select
  const availableVoices = await getActiveVoices(db, orgId);
  const availableSections = await getActiveSections(db, orgId);

  return {
    availableVoices,
    availableSections,
    isOwner: currentUser.roles.includes("owner"),
  };
};
