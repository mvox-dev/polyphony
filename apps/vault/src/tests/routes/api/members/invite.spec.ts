// Tests for POST /api/members/invite endpoint with voices/sections
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../../../routes/api/members/invite/+server";

// Mock SvelteKit functions
vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    json: (data: any, init?: any) => ({
      json: async () => data,
      status: init?.status || 200,
    }),
    error: (status: number, message: string) => {
      const err = new Error(message);
      (err as any).status = status;
      throw err;
    },
  };
});

// Mock middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

// Mock validation schemas
vi.mock("$lib/server/validation/schemas", () => ({
  parseBody: vi.fn(),
  createInviteSchema: {},
}));

import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { parseBody } from "$lib/server/validation/schemas";

function createMockRequest(body: any) {
  return {
    url: "http://localhost:5173/api/members/invite",
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Request;
}

function createMockCookies(memberId: string | null = "admin-1") {
  return {
    get: vi.fn((name: string) => (name === "member_id" ? memberId : null)),
    set: vi.fn(),
  };
}

// Mock org for subdomain routing (Schema V2)
const mockOrg = {
  id: "org_crede_001",
  name: "Crede",
  subdomain: "crede",
  type: "collective" as const,
  contactEmail: "test@example.com",
  createdAt: new Date().toISOString(),
};

describe("POST /api/members/invite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset modules to clear the createInvite mock
    vi.resetModules();
  });

  it("creates invite with multiple voices and sections", async () => {
    const mockAdmin = {
      id: "admin-1",
      email: "admin@test.com",
      roles: ["admin"],
    };
    const mockInvite = {
      id: "invite-789",
      name: "Multi Voice Singer",
      token: "token-multi",
      voices: [
        { id: "voice-tenor", name: "Tenor", abbreviation: "T" },
        { id: "voice-baritone", name: "Baritone", abbreviation: "Bar" },
      ],
      sections: [
        { id: "section-tenor-1", name: "Tenor 1", abbreviation: "T1" },
        { id: "section-tenor-2", name: "Tenor 2", abbreviation: "T2" },
      ],
    };

    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(parseBody).mockResolvedValue({
      rosterMemberId: "roster-1",
      emailHint: undefined,
    });

    // Mock createInvite dynamically
    const mockCreateInvite = vi.fn().mockResolvedValue(mockInvite);
    vi.doMock("$lib/server/db/invites", () => ({
      createInvite: mockCreateInvite,
    }));

    const response = await POST({
      request: createMockRequest({
        rosterMemberId: "roster-1",
      }),
      platform: { env: { DB: {} } },
      cookies: createMockCookies(),
      locals: { org: mockOrg },
    } as any);

    const json = (await response.json()) as any;

    expect(json.voices).toHaveLength(2);
    expect(json.sections).toHaveLength(2);
    expect(json.voices[0].name).toBe("Tenor");
    expect(json.voices[1].name).toBe("Baritone");
  });

  it("requires admin role", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue({
      id: "member-1",
      email: "member@test.com",
      roles: [],
    } as any);
    vi.mocked(assertAdmin).mockImplementation(() => {
      const err = new Error("Insufficient permissions");
      (err as any).status = 403;
      throw err;
    });

    await expect(
      POST({
        request: createMockRequest({ name: "Test" }),
        platform: { env: { DB: {} } },
        cookies: createMockCookies(),
        locals: { org: mockOrg },
      } as any),
    ).rejects.toThrow("Insufficient permissions");
  });
});
