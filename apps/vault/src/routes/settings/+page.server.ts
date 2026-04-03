// Settings page server load function
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { getAllSettings } from "$lib/server/db/settings";
import { getAllVoicesWithCounts } from "$lib/server/db/voices";
import { getAllSectionsWithCounts } from "$lib/server/db/sections";
import { getOrganizationById } from "$lib/server/db/organizations";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform, cookies, locals }) => {
  if (!platform) throw new Error("Platform not available");
  const db = platform.env.DB;

  // Require admin role
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  const orgId = locals.org.id;

  // Load settings, voices (with counts), sections (with counts), and organization
  const [settings, voices, sections, organization] = await Promise.all([
    getAllSettings(db, orgId),
    getAllVoicesWithCounts(db, orgId),
    getAllSectionsWithCounts(db, orgId),
    getOrganizationById(db, orgId),
  ]);

  return {
    settings,
    voices,
    sections,
    organization,
  };
};
