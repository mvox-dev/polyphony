// Tests for /api/members/[id]/sections endpoint
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  POST,
  DELETE,
} from "../../../../routes/api/members/[id]/sections/+server";
import type { RequestEvent } from "@sveltejs/kit";
import type { Role } from "$lib/types";

// Mock SvelteKit error/json functions
vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    error: (status: number, message: string) => {
      const err = new Error(message);
      (err as any).status = status;
      throw err;
    },
    json: (data: any) =>
      new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
      }),
  };
});

// Mock database
const mockDb = {
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      run: vi.fn(),
      first: vi.fn(),
      all: vi.fn(),
    })),
  })),
};

// Mock authenticated member (admin)
const mockAdminMember = {
  id: "admin-id",
  email_id: "admin@test.com",
  email_contact: null,
  name: "Admin User",
  nickname: null,
  roles: ["admin" as const],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2024-01-01T00:00:00Z",
};

// Mock target member
const mockTargetMember = {
  id: "member-id",
  email_id: "member@test.com",
  email_contact: null,
  name: "Test Member",
  nickname: null,
  roles: [] as Role[],
  voices: [],
  sections: [],
  invited_by: "admin-id",
  joined_at: "2024-01-01T00:00:00Z",
};

// Helper to create mock request event
function createMockEvent(options: {
  memberId?: string;
  body?: any;
  isAuthenticated?: boolean;
}): RequestEvent {
  const { memberId = "member-id", body = {}, isAuthenticated = true } = options;

  return {
    params: { id: memberId },
    request: new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    platform: {
      env: { DB: mockDb },
    },
    cookies: {
      get: vi.fn(() => (isAuthenticated ? "mock-token" : undefined)),
    },
    locals: {
      org: {
        id: "test-org-id",
        subdomain: "test",
        name: "Test Org",
        created_at: "2024-01-01",
      },
    },
  } as any;
}

// Mock auth middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

// Mock members DB functions
vi.mock("$lib/server/db/members", () => ({
  getMemberById: vi.fn(),
  addMemberSection: vi.fn(),
  removeMemberSection: vi.fn(),
  setPrimarySection: vi.fn(),
}));

describe("POST /api/members/[id]/sections", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Set up default mocks
    const { getAuthenticatedMember, assertAdmin } =
      await import("$lib/server/auth/middleware");
    const { getMemberById, removeMemberSection } =
      await import("$lib/server/db/members");

    vi.mocked(getMemberById).mockResolvedValue(mockTargetMember);
    vi.mocked(removeMemberSection).mockResolvedValue(true);
    vi.mocked(getAuthenticatedMember).mockImplementation(
      async (db: any, cookies: any) => {
        if (!cookies.get("auth_token")) {
          throw new Error("Not authenticated");
        }
        return mockAdminMember;
      },
    );
    vi.mocked(assertAdmin).mockImplementation(async (member: any) => {
      if (!member || !member.roles.includes("admin")) {
        throw new Error("Admin role required");
      }
    });
  });

  it("should add section to member", async () => {
    const { addMemberSection } = await import("$lib/server/db/members");

    const event = createMockEvent({
      body: {
        sectionId: "soprano-1",
        isPrimary: false,
      },
    });

    const response = await POST(event);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("message");
    expect(addMemberSection).toHaveBeenCalledWith(
      mockDb,
      "member-id",
      "soprano-1",
      false,
      "admin-id",
      "test-org-id",
    );
  });

  it("should set section as primary", async () => {
    const { addMemberSection } = await import("$lib/server/db/members");

    const event = createMockEvent({
      body: {
        sectionId: "alto-2",
        isPrimary: true,
      },
    });

    const response = await POST(event);
    expect(response.status).toBe(200);

    expect(addMemberSection).toHaveBeenCalledWith(
      mockDb,
      "member-id",
      "alto-2",
      true,
      "admin-id",
      "test-org-id",
    );
  });

  it("should require authentication", async () => {
    const event = createMockEvent({
      isAuthenticated: false,
      body: { sectionId: "soprano-1" },
    });

    await expect(POST(event)).rejects.toThrow();
  });

  it("should require admin role", async () => {
    const { assertAdmin } = await import("$lib/server/auth/middleware");

    const event = createMockEvent({
      body: { sectionId: "soprano-1" },
    });

    await POST(event);

    expect(assertAdmin).toHaveBeenCalled();
  });

  it("should validate sectionId is required", async () => {
    const event = createMockEvent({
      body: {}, // Missing sectionId
    });

    await expect(POST(event)).rejects.toThrow();
  });

  it("should validate member exists", async () => {
    const { getMemberById } = await import("$lib/server/db/members");
    vi.mocked(getMemberById).mockResolvedValueOnce(null);

    const event = createMockEvent({
      body: { sectionId: "soprano-1" },
    });

    await expect(POST(event)).rejects.toThrow();
  });

  it("should reject section from different organization", async () => {
    const { addMemberSection } = await import("$lib/server/db/members");

    // Mock addMemberSection to throw org validation error
    vi.mocked(addMemberSection).mockRejectedValueOnce(
      new Error("Section does not belong to member's organization"),
    );

    const event = createMockEvent({
      memberId: "member-id",
      body: {
        sectionId: "other-org-section",
        isPrimary: false,
      },
    });

    await expect(POST(event)).rejects.toThrow(
      "Section does not belong to member's organization",
    );
  });
});

describe("DELETE /api/members/[id]/sections", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Set up default mocks
    const { getAuthenticatedMember, assertAdmin } =
      await import("$lib/server/auth/middleware");
    const { getMemberById, removeMemberSection } =
      await import("$lib/server/db/members");

    vi.mocked(getMemberById).mockResolvedValue(mockTargetMember);
    vi.mocked(removeMemberSection).mockResolvedValue(true);
    vi.mocked(getAuthenticatedMember).mockImplementation(
      async (db: any, cookies: any) => {
        if (!cookies.get("auth_token")) {
          throw new Error("Not authenticated");
        }
        return mockAdminMember;
      },
    );
    vi.mocked(assertAdmin).mockImplementation(async (member: any) => {
      if (!member || !member.roles.includes("admin")) {
        throw new Error("Admin role required");
      }
    });
  });

  it("should remove section from member", async () => {
    const { removeMemberSection } = await import("$lib/server/db/members");

    const event = createMockEvent({
      body: { sectionId: "soprano-1" },
    });

    // Mock DELETE by changing method
    event.request = new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: "soprano-1" }),
    });

    const response = await DELETE(event);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("message");
    expect(removeMemberSection).toHaveBeenCalledWith(
      mockDb,
      "member-id",
      "soprano-1",
    );
  });

  it("should require authentication", async () => {
    const event = createMockEvent({
      isAuthenticated: false,
      body: { sectionId: "soprano-1" },
    });

    event.request = new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: "soprano-1" }),
    });

    await expect(DELETE(event)).rejects.toThrow();
  });

  it("should require admin role", async () => {
    const { assertAdmin } = await import("$lib/server/auth/middleware");

    const event = createMockEvent({
      body: { sectionId: "soprano-1" },
    });

    event.request = new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: "soprano-1" }),
    });

    await DELETE(event);

    expect(assertAdmin).toHaveBeenCalled();
  });

  it("should validate sectionId is required", async () => {
    const event = createMockEvent({
      body: {}, // Missing sectionId
    });

    event.request = new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    await expect(DELETE(event)).rejects.toThrow();
  });
});
