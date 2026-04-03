// Tests for /api/members/[id]/voices endpoint
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  POST,
  DELETE,
} from "../../../../routes/api/members/[id]/voices/+server";
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
    locals: { org: { id: createOrgId("test-org") } } as any,
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
  addMemberVoice: vi.fn(),
  removeMemberVoice: vi.fn(),
  setPrimaryVoice: vi.fn(),
}));

describe("POST /api/members/[id]/voices", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Set up default mocks
    const { getAuthenticatedMember, assertAdmin } =
      await import("$lib/server/auth/middleware");
    const { getMemberById, removeMemberVoice } =
      await import("$lib/server/db/members");

    vi.mocked(getMemberById).mockResolvedValue(mockTargetMember);
    vi.mocked(removeMemberVoice).mockResolvedValue(true);
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

  it("should add voice to member", async () => {
    const { addMemberVoice } = await import("$lib/server/db/members");

    const event = createMockEvent({
      body: {
        voiceId: "soprano",
        isPrimary: false,
      },
    });

    const response = await POST(event);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("message");
    expect(addMemberVoice).toHaveBeenCalledWith(
      mockDb,
      "member-id",
      "soprano",
      false,
      "admin-id",
    );
  });

  it("should set voice as primary", async () => {
    const { addMemberVoice } = await import("$lib/server/db/members");

    const event = createMockEvent({
      body: {
        voiceId: "alto",
        isPrimary: true,
      },
    });

    const response = await POST(event);
    expect(response.status).toBe(200);

    expect(addMemberVoice).toHaveBeenCalledWith(
      mockDb,
      "member-id",
      "alto",
      true,
      "admin-id",
    );
  });

  it("should require authentication", async () => {
    const event = createMockEvent({
      isAuthenticated: false,
      body: { voiceId: "soprano" },
    });

    await expect(POST(event)).rejects.toThrow();
  });

  it("should require admin role", async () => {
    const { assertAdmin } = await import("$lib/server/auth/middleware");

    const event = createMockEvent({
      body: { voiceId: "soprano" },
    });

    await POST(event);

    expect(assertAdmin).toHaveBeenCalled();
  });

  it("should validate voiceId is required", async () => {
    const event = createMockEvent({
      body: {}, // Missing voiceId
    });

    await expect(POST(event)).rejects.toThrow();
  });

  it("should validate member exists", async () => {
    const { getMemberById } = await import("$lib/server/db/members");
    vi.mocked(getMemberById).mockResolvedValueOnce(null);

    const event = createMockEvent({
      body: { voiceId: "soprano" },
    });

    await expect(POST(event)).rejects.toThrow();
  });
});

describe("DELETE /api/members/[id]/voices", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Set up default mocks
    const { getAuthenticatedMember, assertAdmin } =
      await import("$lib/server/auth/middleware");
    const { getMemberById, removeMemberVoice } =
      await import("$lib/server/db/members");

    vi.mocked(getMemberById).mockResolvedValue(mockTargetMember);
    vi.mocked(removeMemberVoice).mockResolvedValue(true);
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

  it("should remove voice from member", async () => {
    const { removeMemberVoice } = await import("$lib/server/db/members");

    const event = createMockEvent({
      body: { voiceId: "soprano" },
    });

    // Mock DELETE by changing method
    event.request = new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: "soprano" }),
    });

    const response = await DELETE(event);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(data).toHaveProperty("message");
    expect(removeMemberVoice).toHaveBeenCalledWith(
      mockDb,
      "member-id",
      "soprano",
    );
  });

  it("should require authentication", async () => {
    const event = createMockEvent({
      isAuthenticated: false,
      body: { voiceId: "soprano" },
    });

    event.request = new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: "soprano" }),
    });

    await expect(DELETE(event)).rejects.toThrow();
  });

  it("should require admin role", async () => {
    const { assertAdmin } = await import("$lib/server/auth/middleware");

    const event = createMockEvent({
      body: { voiceId: "soprano" },
    });

    event.request = new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: "soprano" }),
    });

    await DELETE(event);

    expect(assertAdmin).toHaveBeenCalled();
  });

  it("should validate voiceId is required", async () => {
    const event = createMockEvent({
      body: {}, // Missing voiceId
    });

    event.request = new Request("http://localhost", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    await expect(DELETE(event)).rejects.toThrow();
  });
});
