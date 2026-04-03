// API endpoint for physical copies of an edition
// GET /api/editions/[id]/copies - List all copies for edition
// POST /api/editions/[id]/copies - Create copy(ies)
import { json, error, type RequestEvent } from "@sveltejs/kit";
import type { OrgId } from "@polyphony/shared";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import { getEditionById } from "$lib/server/db/editions";
import {
  getPhysicalCopiesByEdition,
  createPhysicalCopy,
  batchCreatePhysicalCopies,
  getCopyStats,
} from "$lib/server/db/physical-copies";
import type { CopyCondition } from "$lib/types";
import { COPY_CONDITIONS } from "$lib/types";

interface CreateSingleInput {
  copyNumber: string;
  condition?: CopyCondition;
  acquiredAt?: string;
  notes?: string;
}

interface CreateBatchInput {
  count: number;
  prefix?: string;
  startNumber?: number;
  condition?: CopyCondition;
  acquiredAt?: string;
}

type CreateInput = CreateSingleInput | CreateBatchInput;

function isBatchInput(input: CreateInput): input is CreateBatchInput {
  return "count" in input && typeof input.count === "number";
}

function validateBatchInput(body: CreateBatchInput): string | null {
  if (!Number.isInteger(body.count) || body.count <= 0) {
    return "Count must be a positive integer";
  }
  if (body.count > 100) {
    return "Cannot create more than 100 copies at once";
  }
  if (body.prefix !== undefined && typeof body.prefix !== "string") {
    return "Prefix must be a string";
  }
  if (
    body.startNumber !== undefined &&
    (!Number.isInteger(body.startNumber) || body.startNumber < 0)
  ) {
    return "Start number must be a non-negative integer";
  }
  return null;
}

function validateSingleInput(body: CreateSingleInput): string | null {
  if (
    !body.copyNumber ||
    typeof body.copyNumber !== "string" ||
    body.copyNumber.trim().length === 0
  ) {
    return "Copy number is required";
  }
  return null;
}

function validateCommonFields(body: CreateInput): string | null {
  if (
    body.condition !== undefined &&
    !COPY_CONDITIONS.includes(body.condition)
  ) {
    return `Invalid condition. Must be one of: ${COPY_CONDITIONS.join(", ")}`;
  }
  if (
    "acquiredAt" in body &&
    body.acquiredAt !== undefined &&
    body.acquiredAt !== null
  ) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.acquiredAt)) {
      return "Acquired date must be in YYYY-MM-DD format";
    }
  }
  return null;
}

function validateCreateInput(body: CreateInput): string | null {
  const typeError = isBatchInput(body)
    ? validateBatchInput(body)
    : validateSingleInput(body);
  return typeError ?? validateCommonFields(body);
}

export async function GET({
  params,
  platform,
  cookies,
  url,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) throw error(500, "Database not available");

  // Auth: any authenticated member can view copies
  await getAuthenticatedMember(db, cookies, locals.org.id);

  const editionId = params.id;
  if (!editionId) throw error(400, "Edition ID is required");

  // Verify edition exists
  const edition = await getEditionById(db, editionId, locals.org.id);
  if (!edition) throw error(404, "Edition not found");

  const copies = await getPhysicalCopiesByEdition(db, editionId, locals.org.id);

  // Include stats if requested
  const includeStats = url.searchParams.get("stats") === "true";
  if (includeStats) {
    const stats = await getCopyStats(db, editionId);
    return json({ copies, stats });
  }

  return json(copies);
}

async function handleBatchCreate(
  db: D1Database,
  editionId: string,
  body: CreateBatchInput,
  orgId: OrgId,
) {
  const copies = await batchCreatePhysicalCopies(
    db,
    {
      editionId,
      count: body.count,
      prefix: body.prefix,
      startNumber: body.startNumber,
      condition: body.condition,
      acquiredAt: body.acquiredAt,
    },
    orgId,
  );
  const stats = await getCopyStats(db, editionId);
  return json({ copies, stats }, { status: 201 });
}

async function handleSingleCreate(
  db: D1Database,
  editionId: string,
  body: CreateSingleInput,
) {
  const copy = await createPhysicalCopy(db, {
    editionId,
    copyNumber: body.copyNumber.trim(),
    condition: body.condition,
    acquiredAt: body.acquiredAt,
    notes: body.notes,
  });
  return json(copy, { status: 201 });
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

  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertLibrarian(member);

  const editionId = params.id;
  if (!editionId) throw error(400, "Edition ID is required");

  const edition = await getEditionById(db, editionId, locals.org.id);
  if (!edition) throw error(404, "Edition not found");

  const body = (await request.json()) as CreateInput;
  const validationError = validateCreateInput(body);
  if (validationError) return json({ error: validationError }, { status: 400 });

  return isBatchInput(body)
    ? handleBatchCreate(db, editionId, body, locals.org.id)
    : handleSingleCreate(db, editionId, body);
}
