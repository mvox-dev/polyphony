// TDD: Auth middleware tests
import { describe, it, expect } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  createAuthMiddleware,
  getMemberFromCookie,
} from "$lib/server/auth/middleware";

const TEST_ORG_ID = createOrgId("org_test_001");

// Mock D1 database with multi-role support
function createMockDb() {
  const members: Map<string, Record<string, unknown>> = new Map();
  const memberRoles: Map<string, string[]> = new Map();

  members.set("member-123", {
    id: "member-123",
    email: "singer@example.com",
    name: "Singer User",
    invited_by: null,
    joined_at: new Date().toISOString(),
  });
  memberRoles.set("member-123", []);

  members.set("admin-456", {
    id: "admin-456",
    email: "admin@example.com",
    name: "Admin User",
    invited_by: null,
    joined_at: new Date().toISOString(),
  });
  memberRoles.set("admin-456", ["admin"]);

  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        first: async <T>(): Promise<T | null> => {
          if (
            sql.includes("FROM members") &&
            sql.includes("member_organizations") &&
            sql.includes("WHERE m.id")
          ) {
            const id = params[0] as string;
            return (members.get(id) as T) ?? null;
          }
          return null;
        },
        all: async () => {
          // SELECT roles for member
          if (sql.includes("FROM member_roles")) {
            const member_id = params[0] as string;
            const roles = memberRoles.get(member_id) || [];
            return { results: roles.map((role) => ({ role })) };
          }
          return { results: [] };
        },
      }),
    }),
    _members: members,
    _memberRoles: memberRoles,
  };
}

describe("Auth Middleware", () => {
  describe("getMemberFromCookie", () => {
    it("returns member when valid cookie exists", async () => {
      const mockDb = createMockDb();
      const member = await getMemberFromCookie(
        mockDb as unknown as D1Database,
        "member-123",
        TEST_ORG_ID,
      );

      expect(member).toBeDefined();
      expect(member?.id).toBe("member-123");
      expect(member?.roles).toEqual([]);
    });

    it("returns null when cookie is empty", async () => {
      const mockDb = createMockDb();
      const member = await getMemberFromCookie(
        mockDb as unknown as D1Database,
        "",
        TEST_ORG_ID,
      );

      expect(member).toBeNull();
    });

    it("returns null when member not found", async () => {
      const mockDb = createMockDb();
      const member = await getMemberFromCookie(
        mockDb as unknown as D1Database,
        "nonexistent-id",
        TEST_ORG_ID,
      );

      expect(member).toBeNull();
    });
  });

  describe("createAuthMiddleware", () => {
    it("allows request when role meets minimum", async () => {
      const mockDb = createMockDb();
      const middleware = createAuthMiddleware("admin");

      const result = await middleware({
        db: mockDb as unknown as D1Database,
        memberId: "admin-456",
        orgId: TEST_ORG_ID,
      });

      expect(result.authorized).toBe(true);
      expect(result.member).toBeDefined();
      expect(result.member?.id).toBe("admin-456");
    });

    it("allows request when role exceeds minimum", async () => {
      const mockDb = createMockDb();
      const middleware = createAuthMiddleware("librarian");

      const result = await middleware({
        db: mockDb as unknown as D1Database,
        memberId: "admin-456",
        orgId: TEST_ORG_ID,
      });

      expect(result.authorized).toBe(false); // admin doesn't have librarian role
    });

    it("rejects request when role below minimum", async () => {
      const mockDb = createMockDb();
      const middleware = createAuthMiddleware("admin");

      const result = await middleware({
        db: mockDb as unknown as D1Database,
        memberId: "member-123",
        orgId: TEST_ORG_ID,
      });

      expect(result.authorized).toBe(false);
      expect(result.status).toBe(403);
      expect(result.error).toBe("Insufficient permissions");
    });

    it("rejects request when not authenticated", async () => {
      const mockDb = createMockDb();
      const middleware = createAuthMiddleware("librarian");

      const result = await middleware({
        db: mockDb as unknown as D1Database,
        memberId: "",
        orgId: TEST_ORG_ID,
      });

      expect(result.authorized).toBe(false);
      expect(result.status).toBe(401);
      expect(result.error).toBe("Authentication required");
    });
  });
});
