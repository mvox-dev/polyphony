// API endpoint: Assign copy to member
// POST /api/copies/[id]/assign
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import { getPhysicalCopyById } from "$lib/server/db/physical-copies";
import { getMemberById } from "$lib/server/db/members";
import { assignCopy, isAssigned } from "$lib/server/db/copy-assignments";

interface AssignInput {
  memberId: string;
  notes?: string;
}

function validateInput(body: AssignInput): string | null {
  return !body.memberId || typeof body.memberId !== "string"
    ? "memberId is required"
    : null;
}

async function validateEntities(
  db: D1Database,
  copyId: string,
  memberId: string,
  orgId: import("@polyphony/shared").OrgId,
) {
  const copy = await getPhysicalCopyById(db, copyId, orgId);
  if (!copy) throw error(404, "Copy not found");
  const member = await getMemberById(db, memberId, orgId);
  if (!member) throw error(404, "Member not found");
  if (await isAssigned(db, copyId)) return "Copy is already assigned";
  return null;
}

export async function POST({
  params,
  request,
  platform,
  cookies,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) throw error(500, "Database not available");

  const currentUser = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertLibrarian(currentUser);

  const copyId = params.id;
  if (!copyId) throw error(400, "Copy ID is required");

  const body = (await request.json()) as AssignInput;
  const inputError = validateInput(body);
  if (inputError) return json({ error: inputError }, { status: 400 });

  const entityError = await validateEntities(
    db,
    copyId,
    body.memberId,
    locals.org.id,
  );
  if (entityError) return json({ error: entityError }, { status: 409 });

  const assignment = await assignCopy(db, {
    copyId,
    memberId: body.memberId,
    assignedBy: currentUser.id,
    notes: body.notes,
  });
  return json(assignment, { status: 201 });
}
