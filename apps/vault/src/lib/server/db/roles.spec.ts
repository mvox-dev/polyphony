// Tests for role database operations
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  addMemberRole,
  removeMemberRole,
  getMemberRoles,
  memberHasRole,
  countMembersWithRole,
  addMemberRoles,
} from "./roles";

// Mock the config module
vi.mock("$lib/config", () => ({
  DEFAULT_ORG_ID: createOrgId("test-org-001"),
}));

describe("Role database operations", () => {
  // In-memory storage for mock
  let memberRoles: Map<string, Set<string>>;

  // Create mock DB
  function createMockDb() {
    return {
      prepare: vi.fn().mockImplementation((sql: string) => ({
        bind: vi.fn().mockImplementation((...params: unknown[]) => {
          // INSERT INTO member_roles
          if (sql.includes("INSERT INTO member_roles")) {
            return {
              run: vi.fn().mockImplementation(() => {
                const [memberId, _orgId, role] = params as [
                  string,
                  string,
                  string,
                ];
                const key = memberId;
                if (!memberRoles.has(key)) {
                  memberRoles.set(key, new Set());
                }
                memberRoles.get(key)!.add(role);
                return { success: true, meta: { changes: 1 } };
              }),
            };
          }
          // DELETE FROM member_roles
          if (sql.includes("DELETE FROM member_roles")) {
            return {
              run: vi.fn().mockImplementation(() => {
                const [memberId, _orgId, role] = params as [
                  string,
                  string,
                  string,
                ];
                const roles = memberRoles.get(memberId);
                const deleted = roles?.delete(role) ?? false;
                return { success: true, meta: { changes: deleted ? 1 : 0 } };
              }),
            };
          }
          // SELECT 1 FROM member_roles (exists check)
          if (sql.includes("SELECT 1 FROM member_roles")) {
            return {
              first: vi.fn().mockImplementation(() => {
                const [memberId, _orgId, role] = params as [
                  string,
                  string,
                  string,
                ];
                const roles = memberRoles.get(memberId);
                return roles?.has(role) ? { 1: 1 } : null;
              }),
            };
          }
          // SELECT role FROM member_roles
          if (sql.includes("SELECT role FROM member_roles")) {
            return {
              all: vi.fn().mockImplementation(() => {
                const [memberId] = params as [string];
                const roles = memberRoles.get(memberId) ?? new Set();
                return { results: Array.from(roles).map((r) => ({ role: r })) };
              }),
            };
          }
          // SELECT COUNT(*) FROM member_roles
          if (sql.includes("SELECT COUNT(*)")) {
            return {
              first: vi.fn().mockImplementation(() => {
                const [role] = params as [string];
                let count = 0;
                memberRoles.forEach((roles) => {
                  if (roles.has(role)) count++;
                });
                return { count };
              }),
            };
          }
          return { run: vi.fn(), first: vi.fn(), all: vi.fn() };
        }),
      })),
      batch: vi
        .fn()
        .mockImplementation(
          async (statements: { run: () => Promise<unknown> }[]) => {
            for (const stmt of statements) {
              await stmt.run();
            }
          },
        ),
    } as unknown as D1Database;
  }

  beforeEach(() => {
    memberRoles = new Map();
    vi.clearAllMocks();
  });

  describe("addMemberRole", () => {
    const testOrgId = createOrgId("test-org-001");

    it("should add a role to a member", async () => {
      const db = createMockDb();
      const result = await addMemberRole(
        db,
        "member-1",
        "admin",
        "owner-1",
        testOrgId,
      );

      expect(result).toBe(true);
      expect(memberRoles.get("member-1")?.has("admin")).toBe(true);
    });

    it("should return false if role already exists", async () => {
      const db = createMockDb();
      memberRoles.set("member-1", new Set(["admin"]));

      const result = await addMemberRole(
        db,
        "member-1",
        "admin",
        "owner-1",
        testOrgId,
      );

      expect(result).toBe(false);
    });

    it("should require orgId parameter", async () => {
      const db = createMockDb();
      await addMemberRole(db, "member-1", "admin", null, testOrgId);

      // Verify prepare was called with correct SQL
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO member_roles"),
      );
    });
  });

  describe("removeMemberRole", () => {
    const testOrgId = createOrgId("test-org-001");

    it("should remove a role from a member", async () => {
      const db = createMockDb();
      memberRoles.set("member-1", new Set(["admin", "librarian"]));

      const result = await removeMemberRole(db, "member-1", "admin", testOrgId);

      expect(result).toBe(true);
      expect(memberRoles.get("member-1")?.has("admin")).toBe(false);
      expect(memberRoles.get("member-1")?.has("librarian")).toBe(true);
    });

    it("should return false if role did not exist", async () => {
      const db = createMockDb();
      memberRoles.set("member-1", new Set(["librarian"]));

      const result = await removeMemberRole(db, "member-1", "admin", testOrgId);

      expect(result).toBe(false);
    });
  });

  describe("getMemberRoles", () => {
    const testOrgId = createOrgId("test-org-001");

    it("should return all roles for a member", async () => {
      const db = createMockDb();
      memberRoles.set("member-1", new Set(["admin", "librarian"]));

      const roles = await getMemberRoles(db, "member-1", testOrgId);

      expect(roles).toContain("admin");
      expect(roles).toContain("librarian");
      expect(roles).toHaveLength(2);
    });

    it("should return empty array for member with no roles", async () => {
      const db = createMockDb();

      const roles = await getMemberRoles(db, "member-1", testOrgId);

      expect(roles).toEqual([]);
    });
  });

  describe("memberHasRole", () => {
    const testOrgId = createOrgId("test-org-001");

    it("should return true if member has the role", async () => {
      const db = createMockDb();
      memberRoles.set("member-1", new Set(["admin"]));

      const result = await memberHasRole(db, "member-1", "admin", testOrgId);

      expect(result).toBe(true);
    });

    it("should return false if member does not have the role", async () => {
      const db = createMockDb();
      memberRoles.set("member-1", new Set(["librarian"]));

      const result = await memberHasRole(db, "member-1", "admin", testOrgId);

      expect(result).toBe(false);
    });
  });

  describe("countMembersWithRole", () => {
    const testOrgId = createOrgId("test-org-001");

    it("should count members with a specific role", async () => {
      const db = createMockDb();
      memberRoles.set("member-1", new Set(["owner"]));
      memberRoles.set("member-2", new Set(["owner", "admin"]));
      memberRoles.set("member-3", new Set(["admin"]));

      const count = await countMembersWithRole(db, "owner", testOrgId);

      expect(count).toBe(2);
    });

    it("should return 0 when no members have the role", async () => {
      const db = createMockDb();
      memberRoles.set("member-1", new Set(["admin"]));

      const count = await countMembersWithRole(db, "owner", testOrgId);

      expect(count).toBe(0);
    });
  });

  describe("addMemberRoles (batch)", () => {
    const testOrgId = createOrgId("test-org-001");

    it("should add multiple roles at once", async () => {
      const db = createMockDb();

      await addMemberRoles(
        db,
        "member-1",
        ["admin", "librarian"],
        "owner-1",
        testOrgId,
      );

      expect(memberRoles.get("member-1")?.has("admin")).toBe(true);
      expect(memberRoles.get("member-1")?.has("librarian")).toBe(true);
    });

    it("should handle empty roles array gracefully", async () => {
      const db = createMockDb();

      await addMemberRoles(db, "member-1", [], "owner-1", testOrgId);

      expect(db.batch).not.toHaveBeenCalled();
    });
  });
});
