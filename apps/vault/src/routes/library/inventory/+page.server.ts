// Inventory reports page server loader
// Issue #118: Librarian tools for managing physical inventory
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getMemberById } from "$lib/server/db/members";
import { canUploadScores } from "$lib/server/auth/permissions";
import { getEditionInventorySummaries } from "$lib/server/db/physical-copies";

export const load: PageServerLoad = async ({ platform, cookies, locals }) => {
  if (!platform?.env?.DB) {
    throw error(500, "Database unavailable");
  }

  const db = platform.env.DB;
  const memberId = cookies.get("member_id");

  // Require authentication
  if (!memberId) {
    throw redirect(303, "/welcome");
  }

  // Get member and check permissions
  const member = await getMemberById(db, memberId, locals.org.id);
  if (!member) {
    throw redirect(303, "/welcome");
  }

  // Permission check: librarian/admin/owner only
  if (!canUploadScores(member)) {
    throw redirect(303, "/works");
  }

  // Load inventory summaries
  const summaries = await getEditionInventorySummaries(db, locals.org.id);

  return {
    summaries,
  };
};
