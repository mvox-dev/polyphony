// Server load for members page - list all members with roles
import { error, redirect } from "@sveltejs/kit";
import type { OrgId } from "@polyphony/shared";
import type { PageServerLoad } from "./$types";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { getPendingInvites } from "$lib/server/db/invites";
import { getAllMembers } from "$lib/server/db/members";
import { getActiveVoices } from "$lib/server/db/voices";
import { getActiveSections } from "$lib/server/db/sections";

function formatMembers(allMembers: Awaited<ReturnType<typeof getAllMembers>>) {
  return allMembers
    .map((m) => ({
      id: m.id,
      email: m.email_id,
      email_id: m.email_id,
      name: m.name,
      nickname: m.nickname,
      voices: m.voices,
      sections: m.sections,
      joinedAt: m.joined_at,
      roles: m.roles,
    }))
    .sort((a, b) => {
      const nameA = (a.nickname ?? a.name).toLowerCase();
      const nameB = (b.nickname ?? b.name).toLowerCase();
      return nameA.localeCompare(nameB);
    });
}

function formatInvites(
  pendingInvites: Awaited<ReturnType<typeof getPendingInvites>>,
  baseUrl: string,
) {
  return pendingInvites.map((inv) => ({
    id: inv.id,
    rosterId: inv.roster_member_id,
    name: inv.roster_member_name,
    voices: inv.voices,
    sections: inv.sections,
    createdAt: inv.created_at,
    expiresAt: inv.expires_at,
    invitedBy: inv.inviter_name ?? inv.inviter_email ?? "Unknown",
    inviteLink: `${baseUrl}?token=${inv.token}`,
  }));
}

async function loadMemberPageData(db: D1Database, orgId: OrgId, url: URL) {
  const allMembers = await getAllMembers(db, orgId);
  const members = formatMembers(allMembers);

  const pendingInvites = await getPendingInvites(db, orgId);
  const baseUrl = `${url.origin}/invite/accept`;
  const invites = formatInvites(pendingInvites, baseUrl);

  const [availableVoices, availableSections] = await Promise.all([
    getActiveVoices(db, orgId),
    getActiveSections(db, orgId),
  ]);

  return { members, invites, availableVoices, availableSections };
}

export const load: PageServerLoad = async ({
  platform,
  cookies,
  url,
  locals,
}) => {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  let currentUser;
  try {
    currentUser = await getAuthenticatedMember(db, cookies, locals.org.id);
  } catch (err) {
    redirect(302, "/login");
  }

  const canManage = currentUser.roles.some((r) =>
    ["admin", "owner"].includes(r),
  );
  if (!canManage) {
    throw error(403, "Insufficient permissions - admin or owner role required");
  }

  const orgId = locals.org.id;
  const data = await loadMemberPageData(db, orgId, url);

  return {
    ...data,
    currentUserId: currentUser.id,
    isOwner: currentUser.roles.includes("owner"),
    isAdmin: currentUser.roles.some((r) => ["admin", "owner"].includes(r)),
  };
};
