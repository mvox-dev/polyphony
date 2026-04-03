// API endpoint: Return copy (mark assignment as returned)
// POST /api/copies/[id]/return
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import { getPhysicalCopyById } from "$lib/server/db/physical-copies";
import { returnCopy, getAssignmentById } from "$lib/server/db/copy-assignments";

interface ReturnInput {
  assignmentId: string;
}

function validateInput(body: ReturnInput): string | null {
  return !body.assignmentId || typeof body.assignmentId !== "string"
    ? "assignmentId is required"
    : null;
}

async function validateAssignment(
  db: D1Database,
  copyId: string,
  assignmentId: string,
  orgId: import("@polyphony/shared").OrgId,
) {
  const copy = await getPhysicalCopyById(db, copyId, orgId);
  if (!copy) throw error(404, "Copy not found");
  const assignment = await getAssignmentById(db, assignmentId);
  if (!assignment) throw error(404, "Assignment not found");
  if (assignment.copyId !== copyId)
    return "Assignment does not belong to this copy";
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

  const body = (await request.json()) as ReturnInput;
  const inputError = validateInput(body);
  if (inputError) return json({ error: inputError }, { status: 400 });

  const assignmentError = await validateAssignment(
    db,
    copyId,
    body.assignmentId,
    locals.org.id,
  );
  if (assignmentError) return json({ error: assignmentError }, { status: 400 });

  const updated = await returnCopy(db, body.assignmentId);
  return json(updated, { status: 200 });
}
