// Sections database operations
import type { OrgId } from "@polyphony/shared";
import type { Section, CreateSectionInput } from "$lib/types";

interface SectionRow {
  id: string;
  org_id: string;
  name: string;
  abbreviation: string;
  parent_section_id: string | null;
  display_order: number;
  is_active: number;
}

interface SectionWithCountRow extends SectionRow {
  assignment_count: number;
}

/** Section with assignment count for management UI */
export interface SectionWithCount extends Section {
  assignmentCount: number;
}

/**
 * Convert database row to Section interface (snake_case → camelCase)
 */
function rowToSection(row: SectionRow): Section {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    abbreviation: row.abbreviation,
    parentSectionId: row.parent_section_id,
    displayOrder: row.display_order,
    isActive: row.is_active === 1,
  };
}

/**
 * Convert database row to SectionWithCount
 */
function rowToSectionWithCount(row: SectionWithCountRow): SectionWithCount {
  return {
    ...rowToSection(row),
    assignmentCount: row.assignment_count,
  };
}

/**
 * Get all active sections for an organization, ordered by display_order
 */
export async function getActiveSections(
  db: D1Database,
  orgId: OrgId,
): Promise<Section[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM sections WHERE org_id = ? AND is_active = 1 ORDER BY display_order ASC",
    )
    .bind(orgId)
    .all<SectionRow>();

  return results.map(rowToSection);
}

/**
 * Get all sections for an organization (including inactive), ordered by display_order
 */
export async function getAllSections(
  db: D1Database,
  orgId: OrgId,
): Promise<Section[]> {
  const { results } = await db
    .prepare(
      "SELECT * FROM sections WHERE org_id = ? ORDER BY display_order ASC",
    )
    .bind(orgId)
    .all<SectionRow>();

  return results.map(rowToSection);
}

/**
 * Get section by id, scoped to organization
 */
export async function getSectionById(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<Section | null> {
  const row = await db
    .prepare("SELECT * FROM sections WHERE id = ? AND org_id = ?")
    .bind(id, orgId)
    .first<SectionRow>();

  return row ? rowToSection(row) : null;
}

/**
 * Create a new section
 */
export async function createSection(
  db: D1Database,
  input: CreateSectionInput,
): Promise<Section> {
  // Generate id from org and name (lowercase, replace spaces with hyphens)
  const id = `${input.orgId}-${input.name.toLowerCase().replace(/\s+/g, "-")}`;
  const isActive = input.isActive ?? true;

  await db
    .prepare(
      "INSERT INTO sections (id, org_id, name, abbreviation, parent_section_id, display_order, is_active) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      input.orgId,
      input.name,
      input.abbreviation,
      input.parentSectionId ?? null,
      input.displayOrder,
      isActive ? 1 : 0,
    )
    .run();

  return {
    id,
    orgId: input.orgId,
    name: input.name,
    abbreviation: input.abbreviation,
    parentSectionId: input.parentSectionId ?? null,
    displayOrder: input.displayOrder,
    isActive,
  };
}

/**
 * Toggle section active status, scoped to organization
 * @returns true if section was updated, false if section not found
 */
export async function toggleSectionActive(
  db: D1Database,
  id: string,
  isActive: boolean,
  orgId: OrgId,
): Promise<boolean> {
  const result = await db
    .prepare("UPDATE sections SET is_active = ? WHERE id = ? AND org_id = ?")
    .bind(isActive ? 1 : 0, id, orgId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Get all sections for an organization with assignment counts (member + invite assignments)
 */
export async function getAllSectionsWithCounts(
  db: D1Database,
  orgId: OrgId,
): Promise<SectionWithCount[]> {
  const { results } = await db
    .prepare(
      `
			SELECT s.*, 
				(SELECT COUNT(*) FROM member_sections ms WHERE ms.section_id = s.id) +
				(SELECT COUNT(*) FROM invite_sections ins WHERE ins.section_id = s.id) AS assignment_count
			FROM sections s
			WHERE s.org_id = ?
			ORDER BY s.display_order ASC
		`,
    )
    .bind(orgId)
    .all<SectionWithCountRow>();

  return results.map(rowToSectionWithCount);
}

/**
 * Get assignment count for a specific section, scoped to organization
 */
export async function getSectionAssignmentCount(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<number> {
  // Verify section belongs to org before counting
  const section = await getSectionById(db, id, orgId);
  if (!section) return 0;

  const result = await db
    .prepare(
      `
			SELECT
				(SELECT COUNT(*) FROM member_sections WHERE section_id = ?) +
				(SELECT COUNT(*) FROM invite_sections WHERE section_id = ?) AS count
		`,
    )
    .bind(id, id)
    .first<{ count: number }>();

  return result?.count ?? 0;
}

/**
 * Reassign all section assignments from source to target, scoped to organization
 * Skips duplicates (member/invite already has target section)
 * Preserves is_primary flag
 * @returns number of assignments moved
 */
export async function reassignSection(
  db: D1Database,
  sourceId: string,
  targetId: string,
  orgId: OrgId,
): Promise<number> {
  if (sourceId === targetId) {
    throw new Error("Cannot reassign section to itself");
  }

  // Check both sections belong to this org
  const source = await getSectionById(db, sourceId, orgId);
  if (!source) {
    throw new Error("Source section not found");
  }

  const target = await getSectionById(db, targetId, orgId);
  if (!target) {
    throw new Error("Target section not found");
  }

  let movedCount = 0;

  // Move member_sections (skip duplicates)
  const memberResult = await db
    .prepare(
      `
			UPDATE member_sections 
			SET section_id = ?
			WHERE section_id = ?
			AND member_id NOT IN (
				SELECT member_id FROM member_sections WHERE section_id = ?
			)
		`,
    )
    .bind(targetId, sourceId, targetId)
    .run();
  movedCount += memberResult.meta.changes ?? 0;

  // Delete remaining duplicates from source
  await db
    .prepare("DELETE FROM member_sections WHERE section_id = ?")
    .bind(sourceId)
    .run();

  // Move invite_sections (skip duplicates)
  const inviteResult = await db
    .prepare(
      `
			UPDATE invite_sections 
			SET section_id = ?
			WHERE section_id = ?
			AND invite_id NOT IN (
				SELECT invite_id FROM invite_sections WHERE section_id = ?
			)
		`,
    )
    .bind(targetId, sourceId, targetId)
    .run();
  movedCount += inviteResult.meta.changes ?? 0;

  // Delete remaining duplicates from source
  await db
    .prepare("DELETE FROM invite_sections WHERE section_id = ?")
    .bind(sourceId)
    .run();

  return movedCount;
}

/**
 * Delete a section (only if no assignments exist), scoped to organization
 * @returns true if deleted, false if not found
 * @throws Error if section has assignments
 */
export async function deleteSection(
  db: D1Database,
  id: string,
  orgId: OrgId,
): Promise<boolean> {
  const count = await getSectionAssignmentCount(db, id, orgId);
  if (count > 0) {
    throw new Error(
      `Cannot delete section with ${count} assignments. Reassign first.`,
    );
  }

  const result = await db
    .prepare("DELETE FROM sections WHERE id = ? AND org_id = ?")
    .bind(id, orgId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/**
 * Reorder sections by updating display_order for each section, scoped to organization
 * @param sectionIds - Array of section IDs in desired order
 */
export async function reorderSections(
  db: D1Database,
  sectionIds: string[],
  orgId: OrgId,
): Promise<void> {
  // Use batch to update all display orders atomically
  const statements = sectionIds.map((id, index) =>
    db
      .prepare(
        "UPDATE sections SET display_order = ? WHERE id = ? AND org_id = ?",
      )
      .bind(index + 1, id, orgId),
  );

  await db.batch(statements);
}
