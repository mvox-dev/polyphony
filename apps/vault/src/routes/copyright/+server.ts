// POST /copyright - Public copyright takedown request endpoint
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { createTakedownRequest } from "$lib/server/db/takedowns";

interface TakedownRequestBody {
  edition_id: string;
  claimant_name: string;
  claimant_email: string;
  reason: string;
  attestation: boolean;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateRequest(
  body: unknown,
):
  | { valid: true; data: TakedownRequestBody }
  | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a valid JSON object" };
  }

  const data = body as Record<string, unknown>;

  if (!data.edition_id || typeof data.edition_id !== "string") {
    return { valid: false, error: "edition_id is required" };
  }

  if (!data.claimant_name || typeof data.claimant_name !== "string") {
    return { valid: false, error: "claimant_name is required" };
  }

  if (!data.claimant_email || typeof data.claimant_email !== "string") {
    return { valid: false, error: "claimant_email is required" };
  }

  if (!isValidEmail(data.claimant_email)) {
    return {
      valid: false,
      error: "claimant_email must be a valid email address",
    };
  }

  if (!data.reason || typeof data.reason !== "string") {
    return { valid: false, error: "reason is required" };
  }

  if (data.attestation !== true) {
    return {
      valid: false,
      error: "attestation must be true to submit a takedown request",
    };
  }

  return {
    valid: true,
    data: {
      edition_id: data.edition_id,
      claimant_name: data.claimant_name,
      claimant_email: data.claimant_email,
      reason: data.reason,
      attestation: true,
    },
  };
}

export const POST: RequestHandler = async ({ request, platform, locals }) => {
  try {
    const org = locals.org;
    if (!org) {
      return json({ error: "Organization context required" }, { status: 500 });
    }

    const body = await request.json();
    const validation = validateRequest(body);

    if (!validation.valid) {
      return json({ error: validation.error }, { status: 400 });
    }

    const db = platform?.env?.DB;
    if (!db) {
      return json({ error: "Database unavailable" }, { status: 500 });
    }

    const takedown = await createTakedownRequest(db, {
      ...validation.data,
      org_id: org.id,
    });

    if (!takedown) {
      return json(
        { error: "Edition not found or already deleted" },
        { status: 404 },
      );
    }

    return json(
      {
        id: takedown.id,
        message:
          "Your takedown request has been received and will be reviewed by our team.",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Takedown request error:", error);
    return json({ error: "Internal server error" }, { status: 500 });
  }
};
