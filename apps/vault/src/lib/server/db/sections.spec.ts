// sections.ts TDD test suite (Schema V2 with org_id)
import { describe, it, expect, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  getActiveSections,
  getAllSections,
  getSectionById,
  createSection,
  toggleSectionActive,
} from "./sections";
import type { CreateSectionInput, Section } from "$lib/types";

const CREDE_ORG_ID = createOrgId("org_crede_001");
const OTHER_ORG_ID = createOrgId("org_other_001");

// Mock D1Database for testing with org_id support
function createMockDB(): D1Database {
  const sections = new Map<string, any>();

  // Seed default sections for Crede (matching migration)
  sections.set("soprano", {
    id: "soprano",
    org_id: CREDE_ORG_ID,
    name: "Soprano",
    abbreviation: "S",
    parent_section_id: null,
    display_order: 10,
    is_active: 1,
  });
  sections.set("alto", {
    id: "alto",
    org_id: CREDE_ORG_ID,
    name: "Alto",
    abbreviation: "A",
    parent_section_id: null,
    display_order: 20,
    is_active: 1,
  });
  sections.set("tenor", {
    id: "tenor",
    org_id: CREDE_ORG_ID,
    name: "Tenor",
    abbreviation: "T",
    parent_section_id: null,
    display_order: 30,
    is_active: 1,
  });
  sections.set("soprano-1", {
    id: "soprano-1",
    org_id: CREDE_ORG_ID,
    name: "Soprano I",
    abbreviation: "S1",
    parent_section_id: "soprano",
    display_order: 11,
    is_active: 0,
  });
  // Section in another org
  sections.set("other-soprano", {
    id: "other-soprano",
    org_id: OTHER_ORG_ID,
    name: "Soprano",
    abbreviation: "S",
    parent_section_id: null,
    display_order: 10,
    is_active: 1,
  });

  return {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => ({
          first: async () => {
            if (
              sql.includes("WHERE id = ?") &&
              sql.includes("AND org_id = ?")
            ) {
              const section = sections.get(params[0]);
              return section && section.org_id === params[1] ? section : null;
            }
            if (sql.includes("WHERE id = ?")) {
              return sections.get(params[0]) || null;
            }
            return null;
          },
          all: async () => {
            let results = Array.from(sections.values());
            // Filter by org_id
            if (
              sql.includes("WHERE org_id = ?") ||
              sql.includes("WHERE s.org_id = ?")
            ) {
              const orgId = params[0];
              results = results.filter((s) => s.org_id === orgId);
            }
            // Filter active only
            if (sql.includes("is_active = 1")) {
              results = results.filter((s) => s.is_active === 1);
            }
            return { results };
          },
          run: async () => {
            if (sql.includes("INSERT INTO sections")) {
              const [id, orgId, name, abbr, parentId, displayOrder, isActive] =
                params;
              sections.set(id, {
                id,
                org_id: orgId,
                name,
                abbreviation: abbr,
                parent_section_id: parentId,
                display_order: displayOrder,
                is_active: isActive ?? 1,
              });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE sections SET is_active")) {
              const [isActive, id, orgId] = params;
              const section = sections.get(id);
              if (section && (!orgId || section.org_id === orgId)) {
                section.is_active = isActive;
                return { success: true, meta: { changes: 1 } };
              }
              return { success: false, meta: { changes: 0 } };
            }
            return { success: false, meta: { changes: 0 } };
          },
        }),
        all: async () => {
          return { results: Array.from(sections.values()) };
        },
        first: async () => {
          return null;
        },
        run: async () => ({ success: false, meta: { changes: 0 } }),
      };
    },
    dump: () => new ArrayBuffer(0),
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

describe("sections.ts", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDB();
  });

  describe("getActiveSections", () => {
    it("should return only active sections for the specified org", async () => {
      const sections = await getActiveSections(db, CREDE_ORG_ID);
      expect(sections.length).toBe(3); // soprano, alto, tenor
      expect(sections.every((s: Section) => s.isActive)).toBe(true);
      expect(sections.every((s: Section) => s.orgId === CREDE_ORG_ID)).toBe(
        true,
      );
    });

    it("should return sections ordered by display_order", async () => {
      const sections = await getActiveSections(db, CREDE_ORG_ID);
      expect(sections[0].name).toBe("Soprano");
      expect(sections[1].name).toBe("Alto");
      expect(sections[2].name).toBe("Tenor");
    });

    it("should not return sections from other orgs", async () => {
      const sections = await getActiveSections(db, CREDE_ORG_ID);
      expect(sections.find((s) => s.id === "other-soprano")).toBeUndefined();
    });

    it("should return sections for a different org", async () => {
      const sections = await getActiveSections(db, OTHER_ORG_ID);
      expect(sections.length).toBe(1);
      expect(sections[0].id).toBe("other-soprano");
    });
  });

  describe("getAllSections", () => {
    it("should return all sections for org including inactive", async () => {
      const sections = await getAllSections(db, CREDE_ORG_ID);
      expect(sections.length).toBe(4); // soprano, alto, tenor, soprano-1
    });

    it("should include inactive sections", async () => {
      const sections = await getAllSections(db, CREDE_ORG_ID);
      const soprano1 = sections.find((s: Section) => s.id === "soprano-1");
      expect(soprano1).toBeDefined();
      expect(soprano1!.isActive).toBe(false);
    });

    it("should include parent section id", async () => {
      const sections = await getAllSections(db, CREDE_ORG_ID);
      const soprano1 = sections.find((s: Section) => s.id === "soprano-1");
      expect(soprano1!.parentSectionId).toBe("soprano");
    });

    it("should include orgId in returned sections", async () => {
      const sections = await getAllSections(db, CREDE_ORG_ID);
      expect(sections.every((s: Section) => s.orgId === CREDE_ORG_ID)).toBe(
        true,
      );
    });
  });

  describe("getSectionById", () => {
    it("should return section by id", async () => {
      const section = await getSectionById(db, "soprano", CREDE_ORG_ID);
      expect(section).toBeDefined();
      expect(section!.name).toBe("Soprano");
      expect(section!.abbreviation).toBe("S");
      expect(section!.orgId).toBe(CREDE_ORG_ID);
    });

    it("should return null for non-existent id", async () => {
      const section = await getSectionById(db, "nonexistent", CREDE_ORG_ID);
      expect(section).toBeNull();
    });

    it("should convert snake_case to camelCase", async () => {
      const section = await getSectionById(db, "soprano-1", CREDE_ORG_ID);
      expect(section).toHaveProperty("parentSectionId");
      expect(section).toHaveProperty("displayOrder");
      expect(section).toHaveProperty("isActive");
      expect(section).toHaveProperty("orgId");
    });
  });

  describe("createSection", () => {
    it("should create a new section with orgId", async () => {
      const input: CreateSectionInput = {
        orgId: CREDE_ORG_ID,
        name: "Mezzo-Soprano",
        abbreviation: "MS",
        displayOrder: 15,
      };

      const section = await createSection(db, input);
      expect(section.name).toBe("Mezzo-Soprano");
      expect(section.abbreviation).toBe("MS");
      expect(section.orgId).toBe(CREDE_ORG_ID);
      expect(section.isActive).toBe(true);
    });

    it("should generate id from org and name", async () => {
      const input: CreateSectionInput = {
        orgId: CREDE_ORG_ID,
        name: "Mezzo-Soprano",
        abbreviation: "MS",
        displayOrder: 15,
      };

      const section = await createSection(db, input);
      expect(section.id).toBe("org_crede_001-mezzo-soprano");
    });

    it("should allow creating subsections with parent", async () => {
      const input: CreateSectionInput = {
        orgId: CREDE_ORG_ID,
        name: "Soprano II",
        abbreviation: "S2",
        parentSectionId: "soprano",
        displayOrder: 12,
      };

      const section = await createSection(db, input);
      expect(section.parentSectionId).toBe("soprano");
    });

    it("should default isActive to true", async () => {
      const input: CreateSectionInput = {
        orgId: CREDE_ORG_ID,
        name: "Bass",
        abbreviation: "B",
        displayOrder: 40,
      };

      const section = await createSection(db, input);
      expect(section.isActive).toBe(true);
    });

    it("should respect isActive=false when provided", async () => {
      const input: CreateSectionInput = {
        orgId: CREDE_ORG_ID,
        name: "Bass",
        abbreviation: "B",
        displayOrder: 40,
        isActive: false,
      };

      const section = await createSection(db, input);
      expect(section.isActive).toBe(false);
    });
  });

  describe("toggleSectionActive", () => {
    it("should toggle section active status", async () => {
      const result = await toggleSectionActive(
        db,
        "soprano-1",
        true,
        CREDE_ORG_ID,
      );
      expect(result).toBe(true);
    });

    it("should return false for non-existent section", async () => {
      const result = await toggleSectionActive(
        db,
        "nonexistent",
        true,
        CREDE_ORG_ID,
      );
      expect(result).toBe(false);
    });
  });

  // Organization scoping tests (Schema V2)
  describe("organization scoping", () => {
    it("same section name can exist in different orgs", async () => {
      // Create Alto in other org
      const input: CreateSectionInput = {
        orgId: OTHER_ORG_ID,
        name: "Alto", // Same name as Crede's Alto
        abbreviation: "A",
        displayOrder: 20,
      };

      const section = await createSection(db, input);
      expect(section.name).toBe("Alto");
      expect(section.orgId).toBe(OTHER_ORG_ID);

      // Both orgs have Alto sections
      const credeAlto = await getSectionById(db, "alto", CREDE_ORG_ID);
      expect(credeAlto?.orgId).toBe(CREDE_ORG_ID);
    });
  });
});
