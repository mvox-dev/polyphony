// Server-side loader for experimental roster view (Issue #242)
// Reuses the same data loading logic as the parent roster page
import { error } from "@sveltejs/kit";
import type { OrgId } from "@polyphony/shared";
import type { PageServerLoad } from "./$types";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";
import { getOrganizationById } from "$lib/server/db/organizations";
import { getRosterView } from "$lib/server/db/roster";
import {
  getSeasonByDate,
  getSeason,
  getSeasonNavigation,
  getSeasonDateRange,
  type Season,
} from "$lib/server/db/seasons";
import type { Section } from "$lib/types";

interface SectionRow {
  id: string;
  org_id: string;
  name: string;
  abbreviation: string;
  parent_section_id: string | null;
  display_order: number;
  is_active: number;
}

interface RosterFilters {
  orgId?: OrgId;
  start?: string;
  end?: string;
  sectionId?: string;
}

async function getActiveSections(
  db: D1Database,
  orgId: OrgId,
): Promise<Section[]> {
  const { results } = await db
    .prepare(
      `SELECT DISTINCT s.id, s.org_id, s.name, s.abbreviation, s.parent_section_id, s.display_order, s.is_active
			 FROM sections s
			 JOIN member_sections ms ON s.id = ms.section_id
			 WHERE ms.is_primary = 1 AND s.is_active = 1 AND s.org_id = ?
			 ORDER BY s.display_order`,
    )
    .bind(orgId)
    .all<SectionRow>();

  return results.map((row) => ({
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbreviation: row.abbreviation,
    parentSectionId: row.parent_section_id,
    displayOrder: row.display_order,
    isActive: row.is_active === 1,
  }));
}

async function resolveSeason(
  db: D1Database,
  seasonIdParam: string | null,
  orgId: OrgId,
): Promise<Season | null> {
  if (seasonIdParam) {
    return await getSeason(db, seasonIdParam, orgId);
  }
  const today = new Date().toISOString().split("T")[0];
  return await getSeasonByDate(db, orgId, today);
}

function buildRosterFilters(
  dateRange: { start?: string; end?: string | null },
  orgId: OrgId,
  sectionIdParam: string | null,
): RosterFilters {
  return {
    orgId,
    start: dateRange.start,
    end: dateRange.end ?? undefined,
    ...(sectionIdParam && { sectionId: sectionIdParam }),
  };
}

export const load: PageServerLoad = async ({
  platform,
  cookies,
  url,
  locals,
}) => {
  if (!platform) throw error(500, "Platform not available");
  const db = platform.env.DB;

  const currentMember = await getAuthenticatedMember(
    db,
    cookies,
    locals.org.id,
  );
  const orgId = locals.org.id;

  const seasonIdParam = url.searchParams.get("seasonId");
  const sectionIdParam = url.searchParams.get("sectionId");

  const season = await resolveSeason(db, seasonIdParam, orgId);
  const dateRange = season
    ? await getSeasonDateRange(db, season)
    : { start: undefined, end: undefined };
  const filters = buildRosterFilters(dateRange, orgId, sectionIdParam);

  const [roster, sections, seasonNav] = await Promise.all([
    getRosterView(db, locals.org.id, filters),
    getActiveSections(db, orgId),
    season
      ? getSeasonNavigation(db, orgId, season.id)
      : Promise.resolve({ prev: null, next: null }),
  ]);

  const canManageParticipation = currentMember.roles.some((r) =>
    ["conductor", "section_leader", "owner"].includes(r),
  );

  const org = await getOrganizationById(db, orgId);
  const trustIndividualResponsibility =
    org?.trustIndividualResponsibility ?? false;

  return {
    roster,
    sections,
    filters,
    currentMemberId: currentMember.id,
    canManageParticipation,
    trustIndividualResponsibility,
    season: season ? { id: season.id, name: season.name } : null,
    seasonNav,
  };
};
