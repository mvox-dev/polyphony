// Tests for navigation configuration and helpers
import { describe, it, expect } from "vitest";
import { NAV_ITEMS, getVisibleNavItems, isNavItemActive } from "$lib/nav";

describe("NAV_ITEMS", () => {
  it("does not include a roster link (roster is the home/landing for logged-in users)", () => {
    const hrefs = NAV_ITEMS.map((i) => i.href);
    expect(hrefs).not.toContain("/events/roster");
  });

  it("has main group items visible to all members", () => {
    const mainItems = NAV_ITEMS.filter((i) => i.group === "main");
    expect(mainItems.length).toBeGreaterThan(0);
    expect(mainItems.every((i) => i.roles === undefined)).toBe(true);
  });

  it("has management group items that require specific roles", () => {
    const manageItems = NAV_ITEMS.filter((i) => i.group === "manage");
    expect(manageItems.length).toBeGreaterThan(0);
    expect(
      manageItems.every((i) => Array.isArray(i.roles) && i.roles.length > 0),
    ).toBe(true);
  });

  it("includes events, seasons, library, and guides for all members", () => {
    const mainHrefs = NAV_ITEMS.filter((i) => i.group === "main").map(
      (i) => i.href,
    );
    expect(mainHrefs).toContain("/events");
    expect(mainHrefs).toContain("/seasons");
    expect(mainHrefs).toContain("/works");
    expect(mainHrefs).toContain("/guides");
  });

  it("includes editions for librarian/admin/owner", () => {
    const editions = NAV_ITEMS.find((i) => i.href === "/editions");
    expect(editions).toBeDefined();
    expect(editions!.roles).toEqual(
      expect.arrayContaining(["librarian", "admin", "owner"]),
    );
  });

  it("includes members and settings for admin/owner", () => {
    const members = NAV_ITEMS.find((i) => i.href === "/members");
    const settings = NAV_ITEMS.find((i) => i.href === "/settings");
    expect(members).toBeDefined();
    expect(settings).toBeDefined();
    expect(members!.roles).toEqual(expect.arrayContaining(["admin", "owner"]));
    expect(settings!.roles).toEqual(expect.arrayContaining(["admin", "owner"]));
  });
});

describe("getVisibleNavItems", () => {
  it("returns only main items for a regular member with no roles", () => {
    const items = getVisibleNavItems([]);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/events");
    expect(hrefs).toContain("/seasons");
    expect(hrefs).toContain("/works");
    expect(hrefs).toContain("/guides");
    expect(hrefs).not.toContain("/editions");
    expect(hrefs).not.toContain("/members");
    expect(hrefs).not.toContain("/settings");
  });

  it("includes editions for librarian", () => {
    const items = getVisibleNavItems(["librarian"]);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/editions");
    expect(hrefs).not.toContain("/members");
    expect(hrefs).not.toContain("/settings");
  });

  it("includes editions, members, and settings for admin", () => {
    const items = getVisibleNavItems(["admin"]);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/editions");
    expect(hrefs).toContain("/members");
    expect(hrefs).toContain("/settings");
  });

  it("includes everything for owner", () => {
    const items = getVisibleNavItems(["owner"]);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/events");
    expect(hrefs).toContain("/editions");
    expect(hrefs).toContain("/members");
    expect(hrefs).toContain("/settings");
  });

  it("returns union of permissions for multi-role members", () => {
    const items = getVisibleNavItems(["librarian", "conductor"]);
    const hrefs = items.map((i) => i.href);
    expect(hrefs).toContain("/editions");
    // conductor alone doesn't grant members/settings
    expect(hrefs).not.toContain("/members");
    expect(hrefs).not.toContain("/settings");
  });
});

describe("isNavItemActive", () => {
  it("matches exact path", () => {
    expect(isNavItemActive("/events", "/events")).toBe(true);
  });

  it("matches sub-paths", () => {
    expect(isNavItemActive("/events", "/events/123")).toBe(true);
    expect(isNavItemActive("/events", "/events/roster")).toBe(true);
  });

  it("does not match unrelated paths", () => {
    expect(isNavItemActive("/events", "/seasons")).toBe(false);
    expect(isNavItemActive("/events", "/works")).toBe(false);
  });

  it("does not match partial prefix (e.g. /events vs /events-extra)", () => {
    expect(isNavItemActive("/events", "/events-extra")).toBe(false);
  });

  it("root path only matches exactly", () => {
    expect(isNavItemActive("/", "/")).toBe(true);
    expect(isNavItemActive("/", "/events")).toBe(false);
  });
});
