// Public API: Check subdomain availability
// GET /api/public/subdomains/check/:subdomain
// No authentication required - used by Registry during registration

import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import { getOrganizationBySubdomain } from "$lib/server/db/organizations";

// Reserved subdomains that cannot be used
const RESERVED_SUBDOMAINS = [
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "smtp",
  "ftp",
  "cdn",
  "static",
  "assets",
  "registry",
  "vault",
  "polyphony",
  "support",
  "help",
  "docs",
  "blog",
  "status",
  "test",
  "staging",
  "dev",
  "demo",
  "public",
];

// Validation regex: lowercase alphanumeric + hyphens, no start/end hyphen
const SUBDOMAIN_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$|^[a-z0-9]$/;

export interface SubdomainCheckResponse {
  available: boolean;
  reason?: "taken" | "reserved" | "invalid" | string;
}

/**
 * Validate subdomain format and length
 * Returns error response if invalid, null if valid
 */
function validateSubdomain(subdomain: string): Response | null {
  if (subdomain.length < 3) {
    return json(
      {
        available: false,
        reason: "Subdomain must be at least 3 characters",
      } satisfies SubdomainCheckResponse,
      { status: 400 },
    );
  }

  if (subdomain.length > 30) {
    return json(
      {
        available: false,
        reason: "Subdomain must be at most 30 characters",
      } satisfies SubdomainCheckResponse,
      { status: 400 },
    );
  }

  if (!SUBDOMAIN_REGEX.test(subdomain)) {
    const reason =
      subdomain.startsWith("-") || subdomain.endsWith("-")
        ? "Subdomain cannot start or end with a hyphen"
        : "Subdomain contains invalid characters (use lowercase letters, numbers, and hyphens only)";

    return json({ available: false, reason } satisfies SubdomainCheckResponse, {
      status: 400,
    });
  }

  return null;
}

export const GET: RequestHandler = async ({ params, platform }) => {
  const subdomain = params.subdomain.toLowerCase().trim();

  // Validate format and length
  const validationError = validateSubdomain(subdomain);
  if (validationError) return validationError;

  // Check reserved list
  if (RESERVED_SUBDOMAINS.includes(subdomain)) {
    return json({
      available: false,
      reason: "reserved",
    } satisfies SubdomainCheckResponse);
  }

  // Check database for existing organization
  if (!platform?.env?.DB) {
    return json({ error: "Database not available" }, { status: 500 });
  }

  const existing = await getOrganizationBySubdomain(platform.env.DB, subdomain);

  if (existing) {
    return json({
      available: false,
      reason: "taken",
    } satisfies SubdomainCheckResponse);
  }

  return json({ available: true } satisfies SubdomainCheckResponse);
};
