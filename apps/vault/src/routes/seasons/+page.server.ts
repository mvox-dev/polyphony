import type { PageServerLoad } from "./$types";
import { getMemberById } from "$lib/server/db/members";
import { canManageEvents } from "$lib/server/auth/permissions";
import type { Season } from "$lib/server/db/seasons";

export const load: PageServerLoad = async ({
  fetch,
  platform,
  cookies,
  locals,
}) => {
  const response = await fetch("/api/seasons");
  const seasons = (await response.json()) as Season[];

  // Get current user's permissions (admins can manage seasons)
  let canManage = false;

  const db = platform?.env?.DB;
  const memberId = cookies.get("member_id");

  if (db && memberId) {
    const member = await getMemberById(db, memberId, locals.org.id);
    if (member) {
      // Admins and owners can manage seasons
      canManage = canManageEvents(member);
    }
  }

  return {
    seasons: seasons ?? [],
    canManage,
  };
};
