// API endpoint for voice collection operations
// POST /api/voices - Create a new voice
import { json, error, type RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { createVoice } from "$lib/server/db/voices";
import type { CreateVoiceInput } from "$lib/types";

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

  // Parse request body
  const body = (await request.json()) as Partial<CreateVoiceInput>;

  // Validate required fields
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

  // Validate category
  const validCategories = ["vocal", "instrumental"];
  if (!body.category || !validCategories.includes(body.category)) {
    return json(
      { error: 'Category must be "vocal" or "instrumental"' },
      { status: 400 },
    );
  }

  // Build input with defaults
  const input: CreateVoiceInput = {
    orgId: locals.org.id,
    name: body.name.trim(),
    abbreviation: body.abbreviation.trim(),
    category: body.category,
    rangeGroup: body.rangeGroup ?? undefined,
    displayOrder: body.displayOrder ?? 0,
    isActive: body.isActive ?? true,
  };

  try {
    const voice = await createVoice(db, input);
    return json(voice, { status: 201 });
  } catch (err) {
    if (err instanceof Error && err.message.includes("already exists")) {
      return json({ error: err.message }, { status: 409 });
    }
    throw err;
  }
}
