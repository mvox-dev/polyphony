// API endpoint for section collection operations
// POST /api/sections - Create a new section
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { createSection } from "$lib/server/db/sections";
import type { CreateSectionInput } from "$lib/types";

export async function POST({
  request,
  platform,
  cookies,
  locals,
}: RequestEvent) {
  const db = platform?.env?.DB;
  if (!db) {
    throw error(500, "Database not available");
  }

  // Auth: require admin
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  // Parse request body — orgId comes from locals.org.id (NOT request body) to prevent spoofing
  const body = (await request.json()) as Partial<
    Omit<CreateSectionInput, "orgId">
  >;

  if (
    !body.name ||
    typeof body.name !== "string" ||
    body.name.trim().length === 0
  ) {
    return json({ error: "Name is required" }, { status: 400 });
  }

  if (
    !body.abbreviation ||
    typeof body.abbreviation !== "string" ||
    body.abbreviation.trim().length === 0
  ) {
    return json({ error: "Abbreviation is required" }, { status: 400 });
  }

  // Build input with defaults — always use server-side org context
  const input: CreateSectionInput = {
    orgId: locals.org.id,
    name: body.name.trim(),
    abbreviation: body.abbreviation.trim(),
    parentSectionId: body.parentSectionId ?? undefined,
    displayOrder: body.displayOrder ?? 0,
    isActive: body.isActive ?? true,
  };

  try {
    const section = await createSection(db, input);
    return json(section, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      return json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
