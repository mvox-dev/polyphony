import type { PageServerLoad } from "./$types";
import type { OrgId } from "@polyphony/shared";
import { error } from "@sveltejs/kit";
import {
  getMemberById,
  getAllMembers,
  type Member,
} from "$lib/server/db/members";
import { getEditionById } from "$lib/server/db/editions";
import { getWorkById } from "$lib/server/db/works";
import { getAllSections } from "$lib/server/db/sections";
import { canUploadScores } from "$lib/server/auth/permissions";
import { getPhysicalCopiesByEdition } from "$lib/server/db/physical-copies";
import {
  getActiveAssignments,
  getEditionAssignmentHistory,
  getCurrentHolders,
  type AssignmentHistoryEntry,
  type CurrentHolder,
} from "$lib/server/db/copy-assignments";

interface CopyWithAssignment {
  id: string;
  copyNumber: string;
  condition: string;
  assignment: {
    id: string;
    memberId: string;
    memberName: string;
    assignedAt: string;
  } | null;
}

interface MemberForAssignment {
  id: string;
  name: string;
  nickname: string | null;
  primarySection: { id: string; name: string; displayOrder: number } | null;
}

async function loadCopiesWithAssignments(
  db: D1Database,
  editionId: string,
  orgId: OrgId,
): Promise<CopyWithAssignment[]> {
  const copies = await getPhysicalCopiesByEdition(db, editionId, orgId);
  const members = await getAllMembers(db, orgId);
  const memberMap = new Map(members.map((m) => [m.id, m.name]));

  const copiesWithAssignments: CopyWithAssignment[] = [];

  for (const copy of copies) {
    const activeAssignments = await getActiveAssignments(db, copy.id);
    const assignment = activeAssignments[0]; // Should only be one active

    copiesWithAssignments.push({
      id: copy.id,
      copyNumber: copy.copyNumber,
      condition: copy.condition,
      assignment: assignment
        ? {
            id: assignment.id,
            memberId: assignment.memberId,
            memberName: memberMap.get(assignment.memberId) ?? "Unknown",
            assignedAt: assignment.assignedAt,
          }
        : null,
    });
  }

  return copiesWithAssignments;
}

async function checkCanManage(
  db: D1Database,
  memberId: string | undefined,
  orgId: OrgId,
): Promise<boolean> {
  if (!memberId) return false;
  const member = await getMemberById(db, memberId, orgId);
  return member ? canUploadScores(member) : false;
}

async function loadLibrarianData(
  db: D1Database,
  editionId: string,
  canManage: boolean,
  orgId: OrgId,
) {
  if (!canManage) {
    return {
      copies: [] as CopyWithAssignment[],
      members: [] as MemberForAssignment[],
      assignmentHistory: [] as AssignmentHistoryEntry[],
      currentHolders: [] as CurrentHolder[],
    };
  }
  const [copies, members, assignmentHistory, currentHolders] =
    await Promise.all([
      loadCopiesWithAssignments(db, editionId, orgId),
      getAllMembers(db, orgId),
      getEditionAssignmentHistory(db, editionId),
      getCurrentHolders(db, editionId),
    ]);
  // Transform members for assignment dropdown with section info
  const membersForAssignment: MemberForAssignment[] = members.map((m) => ({
    id: m.id,
    name: m.name,
    nickname: m.nickname,
    primarySection: m.sections[0]
      ? {
          id: m.sections[0].id,
          name: m.sections[0].name,
          displayOrder: m.sections[0].displayOrder,
        }
      : null,
  }));
  return {
    copies,
    members: membersForAssignment,
    assignmentHistory,
    currentHolders,
  };
}

export const load: PageServerLoad = async ({
  params,
  platform,
  cookies,
  locals,
}) => {
  const db = platform?.env?.DB;
  if (!db) throw error(500, "Database not available");

  const orgId = locals.org.id;

  const edition = await getEditionById(db, params.id, orgId);
  if (!edition) throw error(404, "Edition not found");

  const work = await getWorkById(db, edition.workId, orgId);
  if (!work) throw error(404, "Work not found");
  const canManage = await checkCanManage(db, cookies.get("member_id"), orgId);

  const [sections, librarianData] = await Promise.all([
    getAllSections(db, orgId),
    loadLibrarianData(db, params.id, canManage, orgId),
  ]);

  return {
    edition,
    work,
    sections,
    canManage,
    copies: librarianData.copies,
    members: librarianData.members,
    assignmentHistory: librarianData.assignmentHistory,
    currentHolders: librarianData.currentHolders,
  };
};
