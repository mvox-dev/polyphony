// Member profile page server load - fetch member by ID
import { error, redirect } from "@sveltejs/kit";
import type { OrgId } from "@polyphony/shared";
import type { PageServerLoad } from "./$types";
import {
  getMemberById,
  getAllMembers,
  type Member,
} from "$lib/server/db/members";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import { getActiveVoices } from "$lib/server/db/voices";
import { getActiveSections } from "$lib/server/db/sections";
import {
  getMemberAssignedCopies,
  type AssignedCopyWithDetails,
} from "$lib/server/db/copy-assignments";
import { getPendingInviteToken, buildInviteLink } from "$lib/server/db/invites";
import {
  resolvePreferences,
  type ResolvedI18nPreferences,
} from "$lib/server/i18n/preferences";
import { getMemberPreferences } from "$lib/server/db/member-preferences";
import type { MemberPreferences } from "$lib/types";

interface AuthContext {
  currentUser: Member | null;
  isOwner: boolean;
  isAdmin: boolean;
  ownerCount: number;
}

async function loadAuthContext(
  db: D1Database,
  cookies: unknown,
  orgId: OrgId,
): Promise<AuthContext> {
  try {
    const currentUser = await getAuthenticatedMember(
      db,
      cookies as Parameters<typeof getAuthenticatedMember>[1],
      orgId,
    );
    const isOwner = currentUser.roles.includes("owner");
    const isAdmin = currentUser.roles.some((r) =>
      ["admin", "owner"].includes(r),
    );

    let ownerCount = 0;
    if (isOwner) {
      const allMembers = await getAllMembers(db, orgId);
      ownerCount = allMembers.filter((m) => m.roles.includes("owner")).length;
    }
    return { currentUser, isOwner, isAdmin, ownerCount };
  } catch {
    return { currentUser: null, isOwner: false, isAdmin: false, ownerCount: 0 };
  }
}

async function loadAdminData(db: D1Database, isAdmin: boolean, orgId: OrgId) {
  if (!isAdmin) return { availableVoices: [], availableSections: [] };
  const [availableVoices, availableSections] = await Promise.all([
    getActiveVoices(db, orgId),
    getActiveSections(db, orgId),
  ]);
  return { availableVoices, availableSections };
}

async function loadAssignedCopies(
  db: D1Database,
  profileMemberId: string,
  currentUserId: string | null,
  isAdmin: boolean,
): Promise<AssignedCopyWithDetails[]> {
  const canViewScores = currentUserId === profileMemberId || isAdmin;
  if (!canViewScores) return [];
  return getMemberAssignedCopies(db, profileMemberId);
}

function formatMemberData(member: Member) {
  return {
    id: member.id,
    email: member.email_id,
    email_id: member.email_id,
    name: member.name,
    nickname: member.nickname,
    voices: member.voices,
    sections: member.sections,
    joined_at: member.joined_at,
    roles: member.roles,
  };
}

async function loadI18nPreferences(
  db: D1Database,
  memberId: string,
  orgId: OrgId,
  isOwnProfile: boolean,
) {
  if (!isOwnProfile) return { resolvedPrefs: null, memberPrefs: null };

  const [resolvedPrefs, memberPrefs] = await Promise.all([
    resolvePreferences(db, memberId, orgId),
    getMemberPreferences(db, memberId),
  ]);
  return { resolvedPrefs, memberPrefs };
}

async function loadPendingInviteLink(
  db: D1Database,
  member: Member,
  isAdmin: boolean,
  urlOrigin: string,
): Promise<string | null> {
  if (!member.email_id && isAdmin) {
    const token = await getPendingInviteToken(db, member.id);
    if (token) {
      return buildInviteLink(urlOrigin, token);
    }
  }
  return null;
}

export const load: PageServerLoad = async ({
  params,
  platform,
  cookies,
  locals,
  url,
}) => {
  const db = platform?.env?.DB;
  if (!db) throw new Error("Database not available");

  const orgId = locals.org.id;
  const authContext = await loadAuthContext(db, cookies, orgId);
  const member = await getMemberById(db, params.id, orgId);
  if (!member) error(404, "Member not found");

  const isOwnProfile = authContext.currentUser?.id === params.id;

  const [adminData, assignedCopies, i18nPrefs, pendingInviteLink] =
    await Promise.all([
      loadAdminData(db, authContext.isAdmin, orgId),
      loadAssignedCopies(
        db,
        params.id,
        authContext.currentUser?.id ?? null,
        authContext.isAdmin,
      ),
      loadI18nPreferences(db, params.id, orgId, isOwnProfile),
      loadPendingInviteLink(db, member, authContext.isAdmin, url.origin),
    ]);

  return {
    member: formatMemberData(member),
    currentUserId: authContext.currentUser?.id ?? null,
    isOwner: authContext.isOwner,
    isAdmin: authContext.isAdmin,
    isOwnProfile,
    ownerCount: authContext.ownerCount,
    availableVoices: adminData.availableVoices,
    availableSections: adminData.availableSections,
    assignedCopies,
    pendingInviteLink,
    resolvedPrefs: i18nPrefs.resolvedPrefs,
    memberPrefs: i18nPrefs.memberPrefs,
  };
};
