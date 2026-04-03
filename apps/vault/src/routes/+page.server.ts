// Redirect authenticated users to the roster (their "home" view)
import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ cookies }) => {
  const memberId = cookies.get("member_id");
  if (memberId) {
    redirect(302, "/events/roster");
  }
};
