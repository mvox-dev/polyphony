// Profile page - redirects to member detail page
// GET /profile → /members/{currentUserId}
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";

export const load: PageServerLoad = async ({ platform, cookies, locals }) => {
  const db = platform?.env?.DB;
  if (!db) {
    throw new Error("Database not available");
  }

  // Authenticate member - redirects to /login if not authenticated
  let member;
  try {
    member = await getAuthenticatedMember(db, cookies, locals.org.id);
  } catch {
    // Not authenticated - redirect to login
    redirect(302, "/login");
  }

  // Redirect to member detail page (must be outside try/catch - redirect throws)
  redirect(302, `/members/${member.id}`);
};
