import { describe, it, expect, vi } from "vitest";

// Mock the guides module
vi.mock("$lib/content/guides", () => {
  const guides = [
    {
      slug: "singer",
      roles: [],
      titles: { et: "Laulja teejuht", en: "Singer Guide" },
      descriptions: { et: "Desc ET", en: "Desc EN" },
      content: { et: "# Singer content" },
      icon: "🎵",
      order: 1,
    },
    {
      slug: "admin",
      roles: ["admin", "owner"],
      titles: { et: "Admin teejuht", en: "Admin Guide" },
      descriptions: { et: "Admin desc", en: "Admin desc EN" },
      content: { et: "# Admin content" },
      icon: "⚙️",
      order: 5,
    },
  ];
  return {
    guides,
    getGuideBySlug: (slug: string) => guides.find((g) => g.slug === slug),
    getGuidesForRoles: (roles?: string[]) => {
      if (!roles || roles.length === 0) return guides;
      return guides.filter(
        (g) => g.roles.length === 0 || g.roles.some((r) => roles.includes(r)),
      );
    },
  };
});

// Mock marked
vi.mock("marked", () => ({
  marked: vi.fn((md: string) => `<p>${md}</p>`),
}));

describe("guides index page server", () => {
  it("returns all guides for unauthenticated users", async () => {
    const { load } = await import("./+page.server");
    const result = (await load({
      parent: async () => ({
        user: null,
        locale: "system",
        org: null,
        memberOrgs: [],
      }),
    } as any)) as Record<string, unknown>;

    expect(result.guides).toHaveLength(2);
    expect(result.userRoles).toEqual([]);
  });

  it("returns filtered guides for admin role", async () => {
    const { load } = await import("./+page.server");
    const result = (await load({
      parent: async () => ({
        user: {
          id: "1",
          email: "a@b.c",
          name: "Test",
          roles: ["admin"],
          voices: [],
          sections: [],
        },
        locale: "system",
        org: null,
        memberOrgs: [],
      }),
    } as any)) as Record<string, unknown>;

    expect(result.guides).toHaveLength(2); // singer + admin
    expect(result.userRoles).toEqual(["admin"]);
  });
});

describe("guides [slug] page server", () => {
  it("returns rendered HTML for valid guide slug", async () => {
    const { load } = await import("./[slug]/+page.server");
    const result = (await load({
      params: { slug: "singer" },
    } as any)) as Record<string, any>;

    expect(result.guide.slug).toBe("singer");
    expect(result.html).toContain("Singer content");
  });

  it("throws 404 for invalid slug", async () => {
    const { load } = await import("./[slug]/+page.server");

    await expect(
      load({
        params: { slug: "nonexistent" },
      } as any),
    ).rejects.toThrow();
  });
});
