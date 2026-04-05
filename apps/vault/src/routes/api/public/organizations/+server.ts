// Public API: Organization management for Registry
// GET /api/public/organizations - List all organizations (for directory)
// POST /api/public/organizations - Create new organization (for registration)
// No authentication required - used by Registry

import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  createOrganization,
  getAllOrganizations,
} from "$lib/server/db/organizations";
import { registerSubdomain } from "$lib/server/cloudflare/domains";
import type { CreateOrganizationInput } from "$lib/types";
import { generateId } from "$lib/server/utils/id";
import { flattenPreset, getPresetIds } from "@polyphony/shared";

/**
 * GET /api/public/organizations
 * Returns list of all organizations for Registry directory
 */
export const GET: RequestHandler = async ({ platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, "Database not available");
  }

  const organizations = await getAllOrganizations(platform.env.DB);

  return json({
    organizations: organizations.map((org) => ({
      id: org.id,
      name: org.name,
      subdomain: org.subdomain,
      type: org.type,
      contactEmail: org.contactEmail,
      createdAt: org.createdAt,
    })),
  });
};

/**
 * Validate a required string field
 */
function validateStringField(
  input: Record<string, unknown>,
  fieldName: string,
): string {
  const value = input[fieldName];
  if (!value || typeof value !== "string" || value.trim() === "") {
    throw error(400, `Missing or invalid field: ${fieldName}`);
  }
  return value.trim();
}

interface OrgCreationParsed {
  org: CreateOrganizationInput;
  sectionPresetId: string | null;
}

/**
 * Parse and validate organization creation request body
 */
function parseOrgCreationInput(body: unknown): OrgCreationParsed {
  if (!body || typeof body !== "object") {
    throw error(400, "Request body must be an object");
  }

  const input = body as Record<string, unknown>;

  const name = validateStringField(input, "name");
  const subdomain = validateStringField(input, "subdomain");
  const contactEmail = validateStringField(input, "contactEmail");

  if (
    !input.type ||
    (input.type !== "collective" && input.type !== "umbrella")
  ) {
    throw error(
      400,
      'Invalid field: type (must be "collective" or "umbrella")',
    );
  }

  let sectionPresetId: string | null = null;
  if (input.sections !== undefined) {
    if (typeof input.sections !== "string") {
      throw error(400, "Invalid field: sections (must be a preset ID string)");
    }
    const validIds = getPresetIds();
    if (!validIds.includes(input.sections)) {
      throw error(
        400,
        `Invalid sections preset: "${input.sections}". Valid: ${validIds.join(", ")}`,
      );
    }
    sectionPresetId = input.sections;
  }

  return {
    org: {
      name,
      subdomain: subdomain.toLowerCase(),
      type: input.type,
      contactEmail,
    },
    sectionPresetId,
  };
}

async function createOwnerMember(
  db: D1Database,
  orgId: string,
  contactEmail: string,
) {
  const memberId = generateId();
  const now = new Date().toISOString();

  // Create member record with contactEmail as both name and email_id
  await db
    .prepare(
      "INSERT INTO members (id, name, email_id, email_contact, invited_by) VALUES (?, ?, ?, NULL, NULL)",
    )
    .bind(memberId, contactEmail, contactEmail)
    .run();

  // Link member to organization
  await db
    .prepare(
      "INSERT INTO member_organizations (member_id, org_id, invited_by, joined_at) VALUES (?, ?, NULL, ?)",
    )
    .bind(memberId, orgId, now)
    .run();

  // Grant owner role
  await db
    .prepare(
      "INSERT INTO member_roles (member_id, org_id, role, granted_at, granted_by) VALUES (?, ?, ?, ?, NULL)",
    )
    .bind(memberId, orgId, "owner", now)
    .run();

  return { memberId, email: contactEmail };
}

async function createPresetSections(
  db: D1Database,
  orgId: string,
  presetId: string,
): Promise<void> {
  const flat = flattenPreset(presetId);

  // First pass: insert all sections (without parent references)
  const idMap = new Map<string, string>(); // name → generated section id
  const statements: D1PreparedStatement[] = [];

  for (const section of flat) {
    const id = generateId();
    idMap.set(section.name, id);

    statements.push(
      db
        .prepare(
          "INSERT INTO sections (id, org_id, name, abbreviation, parent_section_id, display_order, is_active) VALUES (?, ?, ?, ?, NULL, ?, 1)",
        )
        .bind(
          id,
          orgId,
          section.name,
          section.abbreviation,
          section.displayOrder,
        ),
    );
  }

  await db.batch(statements);

  // Second pass: set parent references for sections that have them
  const parentUpdates: D1PreparedStatement[] = [];
  for (const section of flat) {
    if (section.parentName) {
      const childId = idMap.get(section.name);
      const parentId = idMap.get(section.parentName);
      if (childId && parentId) {
        parentUpdates.push(
          db
            .prepare("UPDATE sections SET parent_section_id = ? WHERE id = ?")
            .bind(parentId, childId),
        );
      }
    }
  }

  if (parentUpdates.length > 0) {
    await db.batch(parentUpdates);
  }
}

async function performOrganizationCreation(
  db: D1Database,
  orgInput: CreateOrganizationInput,
  sectionPresetId: string | null,
  env: {
    CF_ACCOUNT_ID?: string;
    CF_API_TOKEN?: string;
    CF_PAGES_PROJECT?: string;
  },
) {
  const organization = await createOrganization(db, orgInput);

  // Create owner member from contact email
  const owner = await createOwnerMember(
    db,
    organization.id,
    orgInput.contactEmail,
  );

  // Create preset sections if specified
  if (sectionPresetId) {
    await createPresetSections(db, organization.id, sectionPresetId);
  }

  const domainResult = await registerSubdomain(orgInput.subdomain, {
    CF_ACCOUNT_ID: env.CF_ACCOUNT_ID,
    CF_API_TOKEN: env.CF_API_TOKEN,
    CF_PAGES_PROJECT: env.CF_PAGES_PROJECT,
  });

  if (!domainResult.success) {
    console.error(
      "[Org Creation] Domain registration failed:",
      domainResult.error,
    );
  } else {
    console.log(
      "[Org Creation] Domain registered:",
      domainResult.domain,
      domainResult.status,
    );
  }

  return { organization, owner };
}

/**
 * POST /api/public/organizations
 * Creates a new organization
 * Called by Registry during registration flow
 */
export const POST: RequestHandler = async ({ request, platform }) => {
  if (!platform?.env?.DB) {
    throw error(500, "Database not available");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, "Invalid JSON body");
  }

  const { org: orgInput, sectionPresetId } = parseOrgCreationInput(body);

  try {
    const { organization, owner } = await performOrganizationCreation(
      platform.env.DB,
      orgInput,
      sectionPresetId,
      {
        CF_ACCOUNT_ID: platform.env.CF_ACCOUNT_ID,
        CF_API_TOKEN: platform.env.CF_API_TOKEN,
        CF_PAGES_PROJECT: platform.env.CF_PAGES_PROJECT,
      },
    );

    return json({ organization, owner }, { status: 201 });
  } catch (err) {
    console.error("[Org Creation] Error:", err);
    if (
      err instanceof Error &&
      err.message.includes("UNIQUE constraint failed")
    ) {
      throw error(409, "Organization with this subdomain already exists");
    }
    throw error(
      500,
      err instanceof Error ? err.message : "Failed to create organization",
    );
  }
};
