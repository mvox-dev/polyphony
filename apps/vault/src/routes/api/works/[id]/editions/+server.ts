// API endpoint for editions collection under a work
// GET /api/works/[id]/editions - List all editions for a work
// POST /api/works/[id]/editions - Create a new edition
import { error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import { getWorkById } from "$lib/server/db/works";
import { createEdition, getEditionsByWorkId } from "$lib/server/db/editions";
import type { CreateEditionInput } from "$lib/types";
import { EDITION_TYPES, LICENSE_TYPES } from "$lib/types";
import {
  validationError,
  serverError,
  notFoundError,
} from "$lib/server/utils/api-responses";
import { trimOrUndefined } from "$lib/server/utils/strings";

function validateCreateInput(body: Partial<CreateEditionInput>): string | null {
  if (
    !body.name ||
    typeof body.name !== "string" ||
    body.name.trim().length === 0
  )
    return "Name is required";
  if (body.editionType && !EDITION_TYPES.includes(body.editionType))
    return "Invalid edition type";
  if (body.licenseType && !LICENSE_TYPES.includes(body.licenseType))
    return "Invalid license type";
  if (body.sectionIds !== undefined && !Array.isArray(body.sectionIds))
    return "sectionIds must be an array";
  return null;
}

function buildCreateInput(
  workId: string,
  body: Partial<CreateEditionInput>,
): CreateEditionInput {
  return {
    workId,
    name: body.name!.trim(),
    arranger: trimOrUndefined(body.arranger),
    publisher: trimOrUndefined(body.publisher),
    voicing: trimOrUndefined(body.voicing),
    editionType: body.editionType,
    licenseType: body.licenseType,
    notes: trimOrUndefined(body.notes),
    externalUrl: trimOrUndefined(body.externalUrl),
    sectionIds: body.sectionIds,
  };
}

export async function GET({ params, platform, cookies, locals }: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) throw serverError();

  await getAuthenticatedMember(db, cookies, locals.org.id);

  const workId = params.id;
  if (!workId) throw error(400, "Work ID is required");

  const work = await getWorkById(db, workId, locals.org.id);
  if (!work) throw notFoundError("Work");

  const editions = await getEditionsByWorkId(db, workId, locals.org.id);
  return new Response(JSON.stringify(editions), {
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST({
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

  const workId = params.id;
  if (!workId) throw error(400, "Work ID is required");

  const work = await getWorkById(db, workId, locals.org.id);
  if (!work) throw notFoundError("Work");

  const body = (await request.json()) as Partial<CreateEditionInput>;
  const validationErr = validateCreateInput(body);
  if (validationErr) return validationError(validationErr);

  const edition = await createEdition(db, buildCreateInput(workId, body));
  return new Response(JSON.stringify(edition), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
}
