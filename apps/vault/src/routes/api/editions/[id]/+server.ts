// API endpoint for individual edition operations
// GET /api/editions/[id] - Get edition by ID
// PATCH /api/editions/[id] - Update edition
// DELETE /api/editions/[id] - Delete edition
import { error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import {
  getEditionById,
  updateEdition,
  deleteEdition,
} from "$lib/server/db/editions";
import type { UpdateEditionInput } from "$lib/types";
import { EDITION_TYPES, LICENSE_TYPES } from "$lib/types";
import {
  validationError,
  serverError,
  notFoundError,
} from "$lib/server/utils/api-responses";
import { trimOrNull } from "$lib/server/utils/strings";

function validateUpdateInput(body: Partial<UpdateEditionInput>): string | null {
  if (
    body.name !== undefined &&
    (typeof body.name !== "string" || body.name.trim().length === 0)
  )
    return "Name cannot be empty";
  if (
    body.editionType !== undefined &&
    !EDITION_TYPES.includes(body.editionType)
  )
    return "Invalid edition type";
  if (
    body.licenseType !== undefined &&
    !LICENSE_TYPES.includes(body.licenseType)
  )
    return "Invalid license type";
  if (body.sectionIds !== undefined && !Array.isArray(body.sectionIds))
    return "sectionIds must be an array";
  return null;
}

function buildUpdateInput(
  body: Partial<UpdateEditionInput>,
): UpdateEditionInput {
  const input: UpdateEditionInput = {};
  if (body.name !== undefined) input.name = body.name.trim();
  if (body.arranger !== undefined) input.arranger = trimOrNull(body.arranger);
  if (body.publisher !== undefined)
    input.publisher = trimOrNull(body.publisher);
  if (body.voicing !== undefined) input.voicing = trimOrNull(body.voicing);
  if (body.editionType !== undefined) input.editionType = body.editionType;
  if (body.licenseType !== undefined) input.licenseType = body.licenseType;
  if (body.notes !== undefined) input.notes = trimOrNull(body.notes);
  if (body.externalUrl !== undefined)
    input.externalUrl = trimOrNull(body.externalUrl);
  if (body.sectionIds !== undefined) input.sectionIds = body.sectionIds;
  return input;
}

export async function GET({ params, platform, cookies, locals }: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) throw serverError();

  await getAuthenticatedMember(db, cookies, locals.org.id);

  const editionId = params.id;
  if (!editionId) throw error(400, "Edition ID is required");

  const edition = await getEditionById(db, editionId, locals.org.id);
  if (!edition) throw notFoundError("Edition");

  return new Response(JSON.stringify(edition), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function PATCH({
  params,
  request,
  platform,
  cookies,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) throw serverError();

  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertLibrarian(member);

  const editionId = params.id;
  if (!editionId) throw error(400, "Edition ID is required");

  const body = (await request.json()) as Partial<UpdateEditionInput>;
  const validationErr = validateUpdateInput(body);
  if (validationErr) return validationError(validationErr);

  const edition = await updateEdition(
    db,
    editionId,
    buildUpdateInput(body),
    locals.org.id,
  );
  if (!edition) throw notFoundError("Edition");

  return new Response(JSON.stringify(edition), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function DELETE({
  params,
  platform,
  cookies,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) throw serverError();

  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertLibrarian(member);

  const editionId = params.id;
  if (!editionId) throw error(400, "Edition ID is required");

  const deleted = await deleteEdition(db, editionId, locals.org.id);
  if (!deleted) throw notFoundError("Edition");

  return new Response(JSON.stringify({ success: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
