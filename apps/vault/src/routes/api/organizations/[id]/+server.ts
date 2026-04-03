// API endpoint for organization i18n settings (Issue #185)
// GET /api/organizations/[id] - Get organization details
// PATCH /api/organizations/[id] - Update organization i18n settings

import { json, error } from "@sveltejs/kit";
import type { RequestEvent } from "@sveltejs/kit";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  updateOrganization,
  getOrganizationById,
} from "$lib/server/db/organizations";
import type { UpdateOrganizationInput } from "$lib/types";

interface OrgUpdateBody {
  language?: string | null;
  locale?: string | null;
  timezone?: string | null;
  trustIndividualResponsibility?: boolean;
}

/** Build UpdateOrganizationInput from request body */
function buildOrgUpdateInput(body: OrgUpdateBody): UpdateOrganizationInput {
  const input: UpdateOrganizationInput = {};
  if ("language" in body) input.language = body.language;
  if ("locale" in body) input.locale = body.locale;
  if ("timezone" in body) input.timezone = body.timezone;
  if ("trustIndividualResponsibility" in body)
    input.trustIndividualResponsibility = body.trustIndividualResponsibility;
  return input;
}

export async function GET(event: RequestEvent) {
  const { params, platform, cookies, locals } = event;
  if (!platform) throw error(500, "Platform not available");
  const db = platform.env.DB;

  // Require admin role
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  // Security: verify params.id matches current org
  if (params.id !== locals.org.id) {
    throw error(403, "Cannot view other organizations");
  }

  const org = await getOrganizationById(db, params.id);
  if (!org) {
    throw error(404, "Organization not found");
  }

  return json(org);
}

export async function PATCH(event: RequestEvent) {
  const { params, request, platform, cookies, locals } = event;
  if (!platform) throw error(500, "Platform not available");
  const db = platform.env.DB;

  // Require admin role
  const member = await getAuthenticatedMember(db, cookies, locals.org.id);
  assertAdmin(member);

  // Security: verify params.id matches current org
  if (params.id !== locals.org.id) {
    throw error(403, "Cannot update other organizations");
  }

  const body = (await request.json()) as OrgUpdateBody;
  const updateInput = buildOrgUpdateInput(body);

  // Update organization with i18n fields
  const updated = await updateOrganization(db, params.id!, updateInput);

  if (!updated) {
    throw error(404, "Organization not found");
  }

  // Sync Paraglide locale cookie when org language changes
  if ("language" in body) {
    if (updated.language) {
      cookies.set("PARAGLIDE_LOCALE", updated.language, {
        path: "/",
        maxAge: 60 * 60 * 24 * 400,
        httpOnly: false,
        sameSite: "lax",
      });
    } else {
      cookies.delete("PARAGLIDE_LOCALE", { path: "/" });
    }
  }

  return json(updated);
}
