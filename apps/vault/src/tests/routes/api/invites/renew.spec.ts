// Tests for POST /api/invites/[id]/renew endpoint
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOrgId } from "@polyphony/shared";
import { POST } from "../../../../routes/api/invites/[id]/renew/+server";
import type { Member } from "$lib/server/auth/permissions";

// Mock the auth middleware
let mockCurrentMember: Member | null = null;

vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(() => mockCurrentMember),
  assertAdmin: vi.fn((member: Member | null) => {
    if (
      !member ||
      (!member.roles.includes("admin") && !member.roles.includes("owner"))
    ) {
      const err = new Error("Insufficient permissions");
      (err as any).status = 403;
      throw err;
    }
  }),
}));

// Mock SvelteKit error function
vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    error: (status: number, message: string) => {
      const err = new Error(message);
      (err as any).status = status;
      throw err;
    },
  };
});

// Create minimal mock D1 database for testing
function createMockDb() {
  const invites = new Map<string, any>();
  const members = new Map<string, any>();

  return {
    prepare: (sql: string) => ({
      bind: (...params: any[]) => ({
        run: async () => {
          if (
            sql.includes("UPDATE invites") &&
            sql.includes("SET expires_at")
          ) {
            const [newExpiresAt, inviteId] = params;
            const invite = invites.get(inviteId);
            if (invite && invite.status === "pending") {
              invite.expires_at = newExpiresAt;
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          return { meta: { changes: 1 } };
        },
        first: async () => {
          if (sql.includes("FROM invites") && sql.includes("WHERE id = ?")) {
            const inviteId = params[0];
            const invite = invites.get(inviteId);
            if (invite) {
              return { ...invite, roles: JSON.stringify(invite.roles) };
            }
          }
          // Handle SELECT from members
          if (sql.includes("FROM members WHERE id = ?")) {
            const memberId = params[0];
            return members.get(memberId) ?? null;
          }
          return null;
        },
        all: async () => {
          // Handle SELECT roles/voices/sections for member (empty results for test)
          return { results: [] };
        },
      }),
    }),
    _invites: invites,
    _members: members,
  };
}

describe("POST /api/invites/[id]/renew", () => {
  let mockDb: ReturnType<typeof createMockDb>;
  let adminMember: Member;
  let regularMember: Member;

  beforeEach(() => {
    mockDb = createMockDb();

    adminMember = {
      id: "admin-123",
      email_id: "admin@example.com",
      roles: ["admin"],
    };

    regularMember = {
      id: "user-456",
      email_id: "user@example.com",
      roles: [],
    };

    // Add roster member
    mockDb._members.set("roster-1", {
      id: "roster-1",
      name: "Test User",
      email_id: null,
      email_contact: null,
      invited_by: "admin-123",
      joined_at: new Date().toISOString(),
    });

    // Add test invite linked to roster member
    mockDb._invites.set("invite-1", {
      id: "invite-1",
      roster_member_id: "roster-1",
      token: "test-token",
      invited_by: "admin-123",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "pending",
      roles: ["librarian"],
      email_hint: null,
      created_at: new Date().toISOString(),
      accepted_at: null,
      accepted_by_email: null,
    });

    // Add another roster member
    mockDb._members.set("roster-2", {
      id: "roster-2",
      name: "Accepted User",
      email_id: null,
      email_contact: null,
      invited_by: "admin-123",
      joined_at: new Date().toISOString(),
    });

    // Add accepted invite linked to roster member
    mockDb._invites.set("invite-2", {
      id: "invite-2",
      roster_member_id: "roster-2",
      token: "accepted-token",
      invited_by: "admin-123",
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      status: "accepted",
      roles: ["librarian"],
      email_hint: null,
      created_at: new Date().toISOString(),
      accepted_at: new Date().toISOString(),
      accepted_by_email: "user@example.com",
    });
  });

  it("extends expiration for admin", async () => {
    mockCurrentMember = adminMember;

    const response = await POST({
      params: { id: "invite-1" },
      platform: { env: { DB: mockDb as unknown as D1Database } },
      cookies: {} as any,
      locals: { org: { id: createOrgId("test-org") } },
    } as any);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { id: string };
    expect(data.id).toBe("invite-1");

    // Verify expiration was extended
    const invite = mockDb._invites.get("invite-1");
    const newExpiry = new Date(invite.expires_at).getTime();
    const expected = Date.now() + 48 * 60 * 60 * 1000;
    expect(Math.abs(newExpiry - expected)).toBeLessThan(1000);
  });

  it("returns 403 for non-admin", async () => {
    mockCurrentMember = regularMember;

    try {
      await POST({
        params: { id: "invite-1" },
        platform: { env: { DB: mockDb as unknown as D1Database } },
        cookies: {} as any,
        locals: { org: { id: createOrgId("test-org") } },
      } as any);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.status).toBe(403);
      expect(err.message).toContain("Insufficient permissions");
    }
  });

  it("returns 404 for non-existent invite", async () => {
    mockCurrentMember = adminMember;

    try {
      await POST({
        params: { id: "non-existent" },
        platform: { env: { DB: mockDb as unknown as D1Database } },
        cookies: {} as any,
        locals: { org: { id: createOrgId("test-org") } },
      } as any);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.status).toBe(404);
      expect(err.message).toContain("Invite not found");
    }
  });

  it("returns 404 for accepted invite", async () => {
    mockCurrentMember = adminMember;

    try {
      await POST({
        params: { id: "invite-2" },
        platform: { env: { DB: mockDb as unknown as D1Database } },
        cookies: {} as any,
        locals: { org: { id: createOrgId("test-org") } },
      } as any);
      expect.fail("Should have thrown");
    } catch (err: any) {
      expect(err.status).toBe(404);
      expect(err.message).toContain("Invite not found");
    }
  });

  it("owner can renew invites", async () => {
    const ownerMember: Member = {
      id: "owner-123",
      email_id: "owner@example.com",
      roles: ["owner"],
    };
    mockCurrentMember = ownerMember;

    const response = await POST({
      params: { id: "invite-1" },
      platform: { env: { DB: mockDb as unknown as D1Database } },
      cookies: {} as any,
      locals: { org: { id: createOrgId("test-org") } },
    } as any);

    expect(response.status).toBe(200);
  });
});
