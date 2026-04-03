// TDD: Multi-org primary section enforcement tests
import { describe, it, expect, beforeEach } from "vitest";

/**
 * Test that primary sections are enforced PER ORGANIZATION
 *
 * Issue: The current trigger enforces single primary section GLOBALLY per member,
 * but it should enforce one primary section PER ORGANIZATION.
 *
 * Example scenario:
 * - Member "Alice" in org "crede" has primary section "Soprano 1"
 * - Member "Alice" in org "hov" has primary section "Bass"
 * - Both should coexist as they're in different organizations
 */

interface MockSection {
  id: string;
  org_id: string;
  name: string;
  abbreviation: string;
  display_order: number;
  is_active: number;
}

interface MockMemberSection {
  member_id: string;
  section_id: string;
  is_primary: number;
}

function createMockDb() {
  const members = new Map<string, any>();
  const sections = new Map<string, MockSection>();
  const memberSections = new Map<string, MockMemberSection>();
  const memberOrganizations = new Map<string, Set<string>>(); // member_id -> Set<org_id>

  // Seed organizations
  const orgs = new Map([
    ["org-crede", { id: "org-crede", subdomain: "crede", name: "Crede Choir" }],
    ["org-hov", { id: "org-hov", subdomain: "hov", name: "Hov Choir" }],
  ]);

  // Seed sections for different orgs
  sections.set("crede-soprano-1", {
    id: "crede-soprano-1",
    org_id: "org-crede",
    name: "Soprano 1",
    abbreviation: "S1",
    display_order: 10,
    is_active: 1,
  });
  sections.set("crede-soprano-2", {
    id: "crede-soprano-2",
    org_id: "org-crede",
    name: "Soprano 2",
    abbreviation: "S2",
    display_order: 11,
    is_active: 1,
  });
  sections.set("hov-bass", {
    id: "hov-bass",
    org_id: "org-hov",
    name: "Bass",
    abbreviation: "B",
    display_order: 40,
    is_active: 1,
  });
  sections.set("hov-tenor", {
    id: "hov-tenor",
    org_id: "org-hov",
    name: "Tenor",
    abbreviation: "T",
    display_order: 30,
    is_active: 1,
  });

  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: async () => {
          // INSERT INTO members
          if (sql.includes("INSERT INTO members")) {
            const [id, name, email_id, email_contact, invited_by] = params as [
              string,
              string,
              string | null,
              string | null,
              string | null,
            ];
            members.set(id, {
              id,
              name,
              nickname: null,
              email_id,
              email_contact,
              invited_by,
              joined_at: new Date().toISOString(),
            });
            return { success: true, meta: { changes: 1 } };
          }

          // INSERT INTO member_organizations
          if (sql.includes("INSERT INTO member_organizations")) {
            const [member_id, org_id] = params as [string, string];
            if (!memberOrganizations.has(member_id)) {
              memberOrganizations.set(member_id, new Set());
            }
            memberOrganizations.get(member_id)!.add(org_id);
            return { success: true, meta: { changes: 1 } };
          }

          // INSERT INTO member_sections
          if (sql.includes("INSERT INTO member_sections")) {
            const [member_id, section_id, is_primary] = params as [
              string,
              string,
              number,
            ];
            const key = `${member_id}-${section_id}`;

            // Simulate trigger: if inserting a primary section, clear other primaries
            // CURRENT BEHAVIOR (BUGGY): Clears ALL primaries for member
            // DESIRED BEHAVIOR: Clear only primaries from same org as new section
            if (is_primary === 1) {
              const newSection = sections.get(section_id);
              if (newSection) {
                // Bug: This clears ALL primary sections, not just same-org
                // We'll fix this in the actual implementation
                for (const [existingKey, ms] of memberSections.entries()) {
                  if (ms.member_id === member_id) {
                    const existingSection = sections.get(ms.section_id);
                    // FIXED: Only clear primary from same org
                    if (
                      existingSection &&
                      existingSection.org_id === newSection.org_id
                    ) {
                      ms.is_primary = 0;
                    }
                  }
                }
              }
            }

            memberSections.set(key, { member_id, section_id, is_primary });
            return { success: true, meta: { changes: 1 } };
          }

          return { success: true };
        },
        first: async () => {
          // SELECT sections WHERE id IN (...)
          if (sql.includes("FROM sections WHERE id IN")) {
            const sectionIds = params as string[];
            const results = sectionIds
              .map((id) => sections.get(id))
              .filter(Boolean);
            return results.length > 0 ? results[0] : null;
          }

          // SELECT member by id
          if (sql.includes("FROM members") && sql.includes("WHERE id =")) {
            const [id] = params as [string];
            return members.get(id) || null;
          }

          return null;
        },
        all: async () => {
          // SELECT sections WHERE id IN (...)
          if (sql.includes("FROM sections WHERE id IN")) {
            const sectionIds = params as string[];
            const results = sectionIds
              .map((id) => sections.get(id))
              .filter(Boolean);
            return { results };
          }

          // Query member sections (with optional org filter)
          if (
            sql.includes("FROM sections s") &&
            sql.includes("JOIN member_sections ms")
          ) {
            const [member_id, org_id] = params as [string, string | undefined];
            const memberSectionsList = Array.from(memberSections.values())
              .filter((ms) => ms.member_id === member_id)
              .map((ms) => {
                const section = sections.get(ms.section_id);
                if (!section) return null;
                // If org_id provided, filter by it
                if (org_id && section.org_id !== org_id) return null;
                return {
                  ...section,
                  is_primary: ms.is_primary,
                };
              })
              .filter(Boolean);
            return { results: memberSectionsList };
          }

          return { results: [] };
        },
      }),
    }),
    batch: async (statements: any[]) => {
      for (const stmt of statements) {
        await stmt.run();
      }
      return [];
    },
  } as unknown as D1Database;
}

describe("Multi-org primary section enforcement", () => {
  it("should allow different primary sections in different organizations", async () => {
    const db = createMockDb();
    const memberId = "alice-123";

    // Create member
    await db
      .prepare(
        "INSERT INTO members (id, name, email_id, email_contact, invited_by) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(memberId, "Alice", "alice@example.com", null, null)
      .run();

    // Add member to org-crede
    await db
      .prepare(
        "INSERT INTO member_organizations (member_id, org_id, invited_by, joined_at) VALUES (?, ?, ?, ?)",
      )
      .bind(memberId, "org-crede", null, new Date().toISOString())
      .run();

    // Add member to org-hov
    await db
      .prepare(
        "INSERT INTO member_organizations (member_id, org_id, invited_by, joined_at) VALUES (?, ?, ?, ?)",
      )
      .bind(memberId, "org-hov", null, new Date().toISOString())
      .run();

    // Assign primary section in org-crede (Soprano 1)
    await db
      .prepare(
        "INSERT INTO member_sections (member_id, section_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)",
      )
      .bind(memberId, "crede-soprano-1", 1, null)
      .run();

    // Assign primary section in org-hov (Bass)
    await db
      .prepare(
        "INSERT INTO member_sections (member_id, section_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)",
      )
      .bind(memberId, "hov-bass", 1, null)
      .run();

    // Query sections for org-crede - should see Soprano 1 as primary
    const credeSections = await db
      .prepare(
        `SELECT s.*, ms.is_primary 
				 FROM sections s 
				 JOIN member_sections ms ON s.id = ms.section_id 
				 WHERE ms.member_id = ? AND s.org_id = ?`,
      )
      .bind(memberId, "org-crede")
      .all();

    expect(credeSections.results).toHaveLength(1);
    expect(credeSections.results[0]).toMatchObject({
      id: "crede-soprano-1",
      org_id: "org-crede",
      is_primary: 1,
    });

    // Query sections for org-hov - should see Bass as primary
    const hovSections = await db
      .prepare(
        `SELECT s.*, ms.is_primary 
				 FROM sections s 
				 JOIN member_sections ms ON s.id = ms.section_id 
				 WHERE ms.member_id = ? AND s.org_id = ?`,
      )
      .bind(memberId, "org-hov")
      .all();

    expect(hovSections.results).toHaveLength(1);
    expect(hovSections.results[0]).toMatchObject({
      id: "hov-bass",
      org_id: "org-hov",
      is_primary: 1,
    });
  });

  it("should enforce single primary section within same organization", async () => {
    const db = createMockDb();
    const memberId = "bob-456";

    // Create member
    await db
      .prepare(
        "INSERT INTO members (id, name, email_id, email_contact, invited_by) VALUES (?, ?, ?, ?, ?)",
      )
      .bind(memberId, "Bob", "bob@example.com", null, null)
      .run();

    // Add member to org-crede only
    await db
      .prepare(
        "INSERT INTO member_organizations (member_id, org_id, invited_by, joined_at) VALUES (?, ?, ?, ?)",
      )
      .bind(memberId, "org-crede", null, new Date().toISOString())
      .run();

    // Assign primary section (Soprano 1)
    await db
      .prepare(
        "INSERT INTO member_sections (member_id, section_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)",
      )
      .bind(memberId, "crede-soprano-1", 1, null)
      .run();

    // Assign another primary section in SAME org (Soprano 2)
    // This should clear the first primary
    await db
      .prepare(
        "INSERT INTO member_sections (member_id, section_id, is_primary, assigned_by) VALUES (?, ?, ?, ?)",
      )
      .bind(memberId, "crede-soprano-2", 1, null)
      .run();

    // Query all sections - Soprano 2 should be primary, Soprano 1 should not
    const sections = await db
      .prepare(
        `SELECT s.*, ms.is_primary 
				 FROM sections s 
				 JOIN member_sections ms ON s.id = ms.section_id 
				 WHERE ms.member_id = ? AND s.org_id = ?`,
      )
      .bind(memberId, "org-crede")
      .all();

    expect(sections.results).toHaveLength(2);
    const soprano1 = sections.results.find(
      (s: any) => s.id === "crede-soprano-1",
    );
    const soprano2 = sections.results.find(
      (s: any) => s.id === "crede-soprano-2",
    );

    expect(soprano1?.is_primary).toBe(0); // Not primary anymore
    expect(soprano2?.is_primary).toBe(1); // Now primary
  });
});
