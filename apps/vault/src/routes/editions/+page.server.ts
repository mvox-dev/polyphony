import type { PageServerLoad } from "./$types";
import { getMemberById } from "$lib/server/db/members";
import { getAllEditions, type EditionWithWork } from "$lib/server/db/editions";
import { canUploadScores } from "$lib/server/auth/permissions";
import { getAllSections } from "$lib/server/db/sections";
import type { Section } from "$lib/types";

export const load: PageServerLoad = async ({ platform, cookies, locals }) => {
  const db = platform?.env?.DB;
  if (!db) {
    return { editions: [], sections: [], canManage: false };
  }

  const orgId = locals.org.id;

  const [editions, sections] = await Promise.all([
    getAllEditions(db, orgId),
    getAllSections(db, orgId),
  ]);

  // Get current user's permissions (librarian can manage editions)
  let canManage = false;
  const memberId = cookies.get("member_id");

  if (memberId) {
    const member = await getMemberById(db, memberId, locals.org.id);
    if (member) {
      canManage = canUploadScores(member);
    }
  }

  return {
    editions: editions as EditionWithWork[],
    sections: sections as Section[],
    canManage,
  };
};
