// Tests for authentication middleware with registration checks (Issue #97)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import { getAuthenticatedMember } from "$lib/server/auth/middleware";

const TEST_ORG_ID = createOrgId("org_test_001");

// Mock SvelteKit error function
vi.mock("@sveltejs/kit", () => ({
  error: (status: number, message: string) => {
    const err = new Error(message);
    (err as any).status = status;
    throw err;
  },
}));

// Mock members db
vi.mock("$lib/server/db/members", () => ({
  getMemberById: vi.fn(),
}));

import { getMemberById } from "$lib/server/db/members";

function createMockCookies(memberId?: string) {
  return {
    get: vi.fn((name: string) => {
      if (name === "member_id") return memberId;
      return undefined;
    }),
    set: vi.fn(),
    delete: vi.fn(),
    serialize: vi.fn(),
    getAll: vi.fn(),
  } as any;
}

describe("Authentication middleware - Registration checks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects roster-only member session", async () => {
    const rosterMember = {
      id: "roster-123",
      name: "Roster Only",
      email_id: null, // NO OAuth identity
      email_contact: "roster@example.com",
      roles: [],
      voices: [],
      sections: [],
      invited_by: "admin-1",
      joined_at: "2026-01-01T00:00:00Z",
    };

    vi.mocked(getMemberById).mockResolvedValue(rosterMember as any);

    const mockDB = {} as D1Database;
    const cookies = createMockCookies("roster-123");

    try {
      await getAuthenticatedMember(mockDB, cookies, TEST_ORG_ID);
      expect.fail("Expected error to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(401);
      expect(err.message).toContain("roster-only member");
    }
  });

  it("accepts registered member session", async () => {
    const registeredMember = {
      id: "member-456",
      name: "Registered User",
      email_id: "user@example.com", // HAS OAuth identity
      email_contact: null,
      roles: ["librarian"],
      voices: [],
      sections: [],
      invited_by: "admin-1",
      joined_at: "2026-01-01T00:00:00Z",
    };

    vi.mocked(getMemberById).mockResolvedValue(registeredMember as any);

    const mockDB = {} as D1Database;
    const cookies = createMockCookies("member-456");

    const member = await getAuthenticatedMember(mockDB, cookies, TEST_ORG_ID);

    expect(member).not.toBeNull();
    expect(member.id).toBe("member-456");
    expect(member.email_id).toBe("user@example.com");
  });

  it("rejects missing session cookie", async () => {
    const mockDB = {} as D1Database;
    const cookies = createMockCookies(); // No member_id

    try {
      await getAuthenticatedMember(mockDB, cookies, TEST_ORG_ID);
      expect.fail("Expected error to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(401);
      expect(err.message).toBe("Authentication required");
    }

    expect(getMemberById).not.toHaveBeenCalled();
  });

  it("rejects invalid member ID", async () => {
    vi.mocked(getMemberById).mockResolvedValue(null);

    const mockDB = {} as D1Database;
    const cookies = createMockCookies("invalid-id");

    try {
      await getAuthenticatedMember(mockDB, cookies, TEST_ORG_ID);
      expect.fail("Expected error to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(401);
      expect(err.message).toBe("Invalid session");
    }
  });
});
