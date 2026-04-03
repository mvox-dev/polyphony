// Members Roles API route tests
// Tests for /api/members/[id]/roles endpoints
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import type { Member } from "$lib/server/db/members";

// Mock the middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
  isOwner: vi.fn(),
}));

// Mock the validation
vi.mock("$lib/server/validation/schemas", () => ({
  parseBody: vi.fn(),
  updateRolesSchema: {},
}));

import { POST } from "../../../routes/api/members/[id]/roles/+server";
import {
  getAuthenticatedMember,
  assertAdmin,
  isOwner,
} from "$lib/server/auth/middleware";
import { parseBody } from "$lib/server/validation/schemas";

// Mock DB implementation
function createMockDb(options: { ownerCount?: number } = {}) {
  const mockFirst = vi.fn();
  const mockRun = vi.fn();

  const db = {
    prepare: vi.fn().mockImplementation((sql: string) => {
      // Handle owner count query (uses bind for role and org_id)
      if (
        sql.includes(
          "SELECT COUNT(*) as count FROM member_roles WHERE role = ?",
        )
      ) {
        return {
          bind: vi.fn().mockReturnValue({
            first: vi
              .fn()
              .mockResolvedValue({ count: options.ownerCount ?? 2 }),
          }),
        };
      }
      // Handle other queries (with bind)
      return {
        bind: vi.fn().mockReturnValue({
          first: mockFirst,
          run: mockRun,
        }),
      };
    }),
    _mockFirst: mockFirst,
    _mockRun: mockRun,
  };

  return db;
}

// Helper to create mock request event
function createMockEvent(
  memberId: string,
  body: { role: string; action: string },
  mockDb = createMockDb(),
): RequestEvent {
  return {
    platform: { env: { DB: mockDb as unknown as D1Database } },
    cookies: {
      get: vi.fn(),
      getAll: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    },
    params: { id: memberId },
    request: new Request(
      "http://localhost/api/members/" + memberId + "/roles",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
    url: new URL("http://localhost/api/members/" + memberId + "/roles"),
    locals: { org: { id: "test-org-123", subdomain: "test" } },
    route: { id: "/api/members/[id]/roles" },
    getClientAddress: () => "127.0.0.1",
    fetch: vi.fn(),
    setHeaders: vi.fn(),
    isDataRequest: false,
    isSubRequest: false,
  } as unknown as RequestEvent;
}

// Mock admin member
const mockAdmin: Member = {
  id: "admin-1",
  name: "Admin User",
  nickname: null,
  email_id: "admin@example.com",
  email_contact: null,
  roles: ["admin"],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2024-01-01T00:00:00Z",
};

// Mock owner member
const mockOwner: Member = {
  id: "owner-1",
  name: "Owner User",
  nickname: null,
  email_id: "owner@example.com",
  email_contact: null,
  roles: ["owner"],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2024-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin);
  vi.mocked(assertAdmin).mockReturnValue(undefined);
  vi.mocked(isOwner).mockReturnValue(false);
});

describe("POST /api/members/[id]/roles", () => {
  it("adds a role to a member", async () => {
    const mockDb = createMockDb();
    mockDb._mockFirst.mockResolvedValue(null); // Role doesn't exist
    mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });
    vi.mocked(parseBody).mockResolvedValue({
      role: "librarian",
      action: "add",
    });

    const event = createMockEvent(
      "member-1",
      { role: "librarian", action: "add" },
      mockDb,
    );

    const response = await POST(event as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { success: boolean };
    expect(data.success).toBe(true);
  });

  it("skips insert if role already exists", async () => {
    const mockDb = createMockDb();
    mockDb._mockFirst.mockResolvedValue({ 1: 1 }); // Role exists
    vi.mocked(parseBody).mockResolvedValue({
      role: "librarian",
      action: "add",
    });

    const event = createMockEvent(
      "member-1",
      { role: "librarian", action: "add" },
      mockDb,
    );

    const response = await POST(event as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    // INSERT should NOT be called since role exists
    expect(mockDb._mockRun).not.toHaveBeenCalled();
  });

  it("removes a role from a member", async () => {
    const mockDb = createMockDb();
    mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });
    vi.mocked(parseBody).mockResolvedValue({
      role: "librarian",
      action: "remove",
    });

    const event = createMockEvent(
      "member-1",
      { role: "librarian", action: "remove" },
      mockDb,
    );

    const response = await POST(event as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
  });

  it("requires admin role", async () => {
    vi.mocked(assertAdmin).mockImplementation(() => {
      throw { status: 403, body: { message: "Admin required" } };
    });

    const mockDb = createMockDb();
    const event = createMockEvent(
      "member-1",
      { role: "librarian", action: "add" },
      mockDb,
    );

    await expect(
      POST(event as Parameters<typeof POST>[0]),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("prevents non-owner from managing owner role", async () => {
    vi.mocked(parseBody).mockResolvedValue({ role: "owner", action: "add" });
    vi.mocked(isOwner).mockReturnValue(false);

    const mockDb = createMockDb();
    const event = createMockEvent(
      "member-1",
      { role: "owner", action: "add" },
      mockDb,
    );

    await expect(
      POST(event as Parameters<typeof POST>[0]),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows owner to grant owner role", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockOwner);
    vi.mocked(isOwner).mockReturnValue(true);
    vi.mocked(parseBody).mockResolvedValue({ role: "owner", action: "add" });

    const mockDb = createMockDb();
    mockDb._mockFirst.mockResolvedValue(null); // Role doesn't exist
    mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });

    const event = createMockEvent(
      "member-1",
      { role: "owner", action: "add" },
      mockDb,
    );

    const response = await POST(event as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
  });

  it("prevents removing last owner", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockOwner);
    vi.mocked(isOwner).mockReturnValue(true);
    vi.mocked(parseBody).mockResolvedValue({ role: "owner", action: "remove" });

    const mockDb = createMockDb({ ownerCount: 1 }); // Only one owner

    const event = createMockEvent(
      "owner-1",
      { role: "owner", action: "remove" },
      mockDb,
    );

    await expect(
      POST(event as Parameters<typeof POST>[0]),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("allows removing owner when multiple owners exist", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockOwner);
    vi.mocked(isOwner).mockReturnValue(true);
    vi.mocked(parseBody).mockResolvedValue({ role: "owner", action: "remove" });

    const mockDb = createMockDb({ ownerCount: 2 }); // Two owners
    mockDb._mockRun.mockResolvedValue({ meta: { changes: 1 } });

    const event = createMockEvent(
      "member-1",
      { role: "owner", action: "remove" },
      mockDb,
    );

    const response = await POST(event as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
  });

  it("throws 500 if database not available", async () => {
    vi.mocked(parseBody).mockResolvedValue({ role: "admin", action: "add" });

    const event = {
      platform: { env: {} }, // No DB
      cookies: { get: vi.fn() },
      params: { id: "member-1" },
      request: new Request("http://localhost/api/members/member-1/roles", {
        method: "POST",
      }),
    } as unknown as Parameters<typeof POST>[0];

    await expect(POST(event)).rejects.toMatchObject({ status: 500 });
  });

  it("handles database errors gracefully", async () => {
    vi.mocked(parseBody).mockResolvedValue({ role: "admin", action: "add" });

    const mockDb = createMockDb();
    mockDb._mockFirst.mockResolvedValue(null);
    mockDb._mockRun.mockRejectedValue(new Error("DB error"));

    const event = createMockEvent(
      "member-1",
      { role: "admin", action: "add" },
      mockDb,
    );

    await expect(
      POST(event as Parameters<typeof POST>[0]),
    ).rejects.toMatchObject({ status: 500 });
  });
});
