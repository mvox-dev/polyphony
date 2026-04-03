// Organization database operations
// Part of Schema V2 multi-organization support

import { createOrgId } from "@polyphony/shared";
import type {
  Organization,
  CreateOrganizationInput,
  UpdateOrganizationInput,
} from "$lib/types";
import { generateId } from "$lib/server/utils/id";

/**
 * Create a new organization
 */
export async function createOrganization(
  db: D1Database,
  input: CreateOrganizationInput,
): Promise<Organization> {
  const id = generateId("org_");
  const now = new Date().toISOString();

  await db
    .prepare(
      "INSERT INTO organizations (id, name, subdomain, type, contact_email, created_at, language, locale, timezone, trust_individual_responsibility) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, 0)",
    )
    .bind(
      id,
      input.name,
      input.subdomain.toLowerCase(),
      input.type,
      input.contactEmail,
      now,
    )
    .run();

  return {
    id: createOrgId(id),
    name: input.name,
    subdomain: input.subdomain.toLowerCase(),
    type: input.type,
    contactEmail: input.contactEmail,
    createdAt: now,
    language: null,
    locale: null,
    timezone: null,
    trustIndividualResponsibility: false,
  };
}

/**
 * Get organization by ID
 */
export async function getOrganizationById(
  db: D1Database,
  id: string,
): Promise<Organization | null> {
  const row = await db
    .prepare(
      "SELECT id, name, subdomain, type, contact_email, created_at, language, locale, timezone, trust_individual_responsibility FROM organizations WHERE id = ?",
    )
    .bind(id)
    .first<OrganizationRow>();

  if (!row) {
    return null;
  }

  return mapRowToOrganization(row);
}

/**
 * Get organization by subdomain (used in routing)
 */
export async function getOrganizationBySubdomain(
  db: D1Database,
  subdomain: string,
): Promise<Organization | null> {
  const row = await db
    .prepare(
      "SELECT id, name, subdomain, type, contact_email, created_at, language, locale, timezone, trust_individual_responsibility FROM organizations WHERE subdomain = ?",
    )
    .bind(subdomain.toLowerCase())
    .first<OrganizationRow>();

  if (!row) {
    return null;
  }

  return mapRowToOrganization(row);
}

/**
 * Get all organizations
 */
export async function getAllOrganizations(
  db: D1Database,
): Promise<Organization[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, subdomain, type, contact_email, created_at, language, locale, timezone, trust_individual_responsibility FROM organizations ORDER BY name",
    )
    .all<OrganizationRow>();

  return results.map(mapRowToOrganization);
}

/**
 * Build UPDATE SET clause for partial updates
 */
function buildOrgUpdateSet(input: UpdateOrganizationInput): {
  updates: string[];
  params: (string | null)[];
} {
  const updates: string[] = [];
  const params: (string | null)[] = [];

  if (input.name !== undefined) {
    updates.push("name = ?");
    params.push(input.name);
  }
  if (input.contactEmail !== undefined) {
    updates.push("contact_email = ?");
    params.push(input.contactEmail);
  }
  if (input.language !== undefined) {
    updates.push("language = ?");
    params.push(input.language);
  }
  if (input.locale !== undefined) {
    updates.push("locale = ?");
    params.push(input.locale);
  }
  if (input.timezone !== undefined) {
    updates.push("timezone = ?");
    params.push(input.timezone);
  }
  if (input.trustIndividualResponsibility !== undefined) {
    updates.push("trust_individual_responsibility = ?");
    params.push(input.trustIndividualResponsibility ? "1" : "0");
  }

  return { updates, params };
}

/**
 * Update organization (name, contact email, and i18n preferences - subdomain and type are immutable)
 */
export async function updateOrganization(
  db: D1Database,
  id: string,
  input: UpdateOrganizationInput,
): Promise<Organization | null> {
  const { updates, params } = buildOrgUpdateSet(input);
  if (updates.length === 0) return getOrganizationById(db, id);

  params.push(id);
  const result = await db
    .prepare(`UPDATE organizations SET ${updates.join(", ")} WHERE id = ?`)
    .bind(...params)
    .run();

  if ((result.meta.changes ?? 0) === 0) return null;
  return getOrganizationById(db, id);
}

// =============================================================================
// Internal types and helpers
// =============================================================================

interface OrganizationRow {
  id: string;
  name: string;
  subdomain: string;
  type: "umbrella" | "collective";
  contact_email: string;
  created_at: string;
  // i18n preferences (Epic #183)
  language: string | null;
  locale: string | null;
  timezone: string | null;
  // Issue #240
  trust_individual_responsibility: number;
}

function mapRowToOrganization(row: OrganizationRow): Organization {
  return {
    id: createOrgId(row.id),
    name: row.name,
    subdomain: row.subdomain,
    type: row.type,
    contactEmail: row.contact_email,
    createdAt: row.created_at,
    // i18n preferences (Epic #183)
    language: row.language,
    locale: row.locale,
    timezone: row.timezone,
    // Issue #240
    trustIndividualResponsibility: row.trust_individual_responsibility === 1,
  };
}
