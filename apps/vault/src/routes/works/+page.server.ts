import type { PageServerLoad } from "./$types";
import type { OrgId } from "@polyphony/shared";
import { getMemberById } from "$lib/server/db/members";
import { canUploadScores } from "$lib/server/auth/permissions";

interface WorksResponse {
  id: string;
  orgId: OrgId;
  title: string;
  composer: string | null;
  lyricist: string | null;
  createdAt: string;
}

export const load: PageServerLoad = async ({
  fetch,
  platform,
  cookies,
  locals,
}) => {
  const response = await fetch("/api/works");
  const works = (await response.json()) as WorksResponse[];

  // Get current user's permissions (librarian can manage works)
  let canManage = false;

  const db = platform?.env?.DB;
  const memberId = cookies.get("member_id");

  if (db && memberId) {
    const member = await getMemberById(db, memberId, locals.org.id);
    if (member) {
      // Librarians, admins, and owners can manage works
      canManage = canUploadScores(member);
    }
  }

  return {
    works: works ?? [],
    canManage,
  };
};
