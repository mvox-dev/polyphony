// Bulk return copies API
// Issue #126 - Collection Reminders
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getMemberById } from "$lib/server/db/members";
import { canUploadScores } from "$lib/server/auth/permissions";
import { bulkReturnCopies } from "$lib/server/db/inventory-reports";

interface BulkReturnBody {
  assignmentIds?: unknown;
}

/** Parse and validate the request body, returning assignment IDs or an error response */
async function parseAndValidateBody(
  request: Request,
): Promise<{ assignmentIds: string[] } | { error: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { error: json({ error: "Invalid JSON" }, { status: 400 }) };
  }

  if (typeof body !== "object" || body === null) {
    return {
      error: json({ error: "Request body must be an object" }, { status: 400 }),
    };
  }

  const { assignmentIds } = body as BulkReturnBody;

  if (!Array.isArray(assignmentIds)) {
    return {
      error: json({ error: "assignmentIds must be an array" }, { status: 400 }),
    };
  }

  if (!assignmentIds.every((id) => typeof id === "string")) {
    return {
      error: json(
        { error: "All assignment IDs must be strings" },
        { status: 400 },
      ),
    };
  }

  return { assignmentIds };
}

export const POST: RequestHandler = async ({
  request,
  platform,
  cookies,
  locals,
}) => {
  const db = platform?.env?.DB;
  if (!db) {
    return json({ error: "Database unavailable" }, { status: 500 });
  }

  // Auth check
  const memberId = cookies.get("member_id");
  if (!memberId) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  // Permission check - must be librarian/admin/owner
  const member = await getMemberById(db, memberId, locals.org.id);
  if (!canUploadScores(member)) {
    return json({ error: "Permission denied" }, { status: 403 });
  }

  // Parse and validate request body
  const result = await parseAndValidateBody(request);
  if ("error" in result) {
    return result.error;
  }

  // Perform bulk return
  const count = await bulkReturnCopies(db, result.assignmentIds);

  return json({ returned: count });
};
