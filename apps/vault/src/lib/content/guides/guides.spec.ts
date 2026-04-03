import { describe, it, expect } from "vitest";
import { guides, getGuideBySlug, getGuidesForRoles } from "./index";

describe("guides registry", () => {
  describe("guides array", () => {
    it("has 5 guides", () => {
      expect(guides).toHaveLength(5);
    });

    it("each guide has required fields", () => {
      for (const guide of guides) {
        expect(guide.slug).toBeTruthy();
        expect(guide.icon).toBeTruthy();
        expect(guide.titles).toBeDefined();
        expect(guide.descriptions).toBeDefined();
        expect(guide.content).toBeDefined();
        expect(typeof guide.order).toBe("number");
        expect(Array.isArray(guide.roles)).toBe(true);
      }
    });

    it("each guide has Estonian content", () => {
      for (const guide of guides) {
        expect(guide.content["et"]).toBeTruthy();
        expect(guide.titles["et"]).toBeTruthy();
        expect(guide.descriptions["et"]).toBeTruthy();
      }
    });

    it("singer guide has no role restriction", () => {
      const singer = guides.find((g) => g.slug === "singer");
      expect(singer?.roles).toEqual([]);
    });

    it("admin guide requires admin or owner role", () => {
      const admin = guides.find((g) => g.slug === "admin");
      expect(admin?.roles).toContain("admin");
      expect(admin?.roles).toContain("owner");
    });
  });

  describe("getGuideBySlug", () => {
    it("returns guide for valid slug", () => {
      const guide = getGuideBySlug("singer");
      expect(guide).toBeDefined();
      expect(guide?.slug).toBe("singer");
    });

    it("returns guide for conductor slug", () => {
      const guide = getGuideBySlug("conductor");
      expect(guide).toBeDefined();
      expect(guide?.titles["et"]).toBe("Dirigendi teejuht");
    });

    it("returns undefined for unknown slug", () => {
      expect(getGuideBySlug("nonexistent")).toBeUndefined();
    });
  });

  describe("getGuidesForRoles", () => {
    it("returns all guides when no roles provided", () => {
      const result = getGuidesForRoles();
      expect(result).toHaveLength(5);
    });

    it("returns all guides when empty roles array", () => {
      const result = getGuidesForRoles([]);
      expect(result).toHaveLength(5);
    });

    it("always includes singer guide for any role", () => {
      const result = getGuidesForRoles(["conductor"]);
      const slugs = result.map((g) => g.slug);
      expect(slugs).toContain("singer");
    });

    it("returns singer + conductor for conductor role", () => {
      const result = getGuidesForRoles(["conductor"]);
      const slugs = result.map((g) => g.slug);
      expect(slugs).toContain("singer");
      expect(slugs).toContain("conductor");
      expect(slugs).not.toContain("admin");
      expect(slugs).not.toContain("librarian");
    });

    it("returns singer + librarian for librarian role", () => {
      const result = getGuidesForRoles(["librarian"]);
      const slugs = result.map((g) => g.slug);
      expect(slugs).toContain("singer");
      expect(slugs).toContain("librarian");
      expect(slugs).not.toContain("conductor");
    });

    it("returns singer + section-leader for section_leader role", () => {
      const result = getGuidesForRoles(["section_leader"]);
      const slugs = result.map((g) => g.slug);
      expect(slugs).toContain("singer");
      expect(slugs).toContain("section-leader");
      expect(slugs).not.toContain("admin");
    });

    it("returns singer + admin for admin role", () => {
      const result = getGuidesForRoles(["admin"]);
      const slugs = result.map((g) => g.slug);
      expect(slugs).toContain("singer");
      expect(slugs).toContain("admin");
      expect(slugs).not.toContain("conductor");
    });

    it("returns all guides for owner role", () => {
      const result = getGuidesForRoles(["owner"]);
      expect(result).toHaveLength(5);
    });

    it("returns combined guides for multiple roles", () => {
      const result = getGuidesForRoles(["conductor", "librarian"]);
      const slugs = result.map((g) => g.slug);
      expect(slugs).toContain("singer");
      expect(slugs).toContain("conductor");
      expect(slugs).toContain("librarian");
      expect(slugs).not.toContain("admin");
    });

    it("returns guides sorted by order", () => {
      const result = getGuidesForRoles(["owner"]);
      for (let i = 1; i < result.length; i++) {
        expect(result[i].order).toBeGreaterThanOrEqual(result[i - 1].order);
      }
    });
  });
});
