// Tests for invite revoke API endpoint
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import { DELETE } from "../../../../routes/api/invites/[id]/+server";

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

// Mock middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

// Mock invites db
vi.mock("$lib/server/db/invites", () => ({
  revokeInvite: vi.fn(),
}));

import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { revokeInvite } from "$lib/server/db/invites";

function createMockRequest(method: string = "DELETE") {
  return {
    method,
    json: vi.fn(),
  } as unknown as Request;
}

function createMockCookies(memberId: string | null = "member-1") {
  return {
    get: vi.fn((name: string) => (name === "member_id" ? memberId : null)),
    set: vi.fn(),
  };
}

describe("DELETE /api/invites/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("revokes a pending invite", async () => {
    const mockMember = {
      id: "admin-1",
      email: "admin@test.com",
      roles: ["admin"],
    };
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockMember as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(revokeInvite).mockResolvedValue(true);

    const response = await DELETE({
      params: { id: "invite-123" },
      platform: { env: { DB: {} } },
      cookies: createMockCookies(),
      request: createMockRequest(),
      locals: { org: { id: createOrgId("test-org") } },
    } as any);

    const json = (await response.json()) as { success: boolean };
    expect(json.success).toBe(true);
    expect(revokeInvite).toHaveBeenCalledWith({}, "invite-123");
  });

  it("returns 404 for non-existent invite", async () => {
    const mockMember = {
      id: "admin-1",
      email: "admin@test.com",
      roles: ["admin"],
    };
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockMember as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(revokeInvite).mockResolvedValue(false);

    await expect(
      DELETE({
        params: { id: "nonexistent" },
        platform: { env: { DB: {} } },
        cookies: createMockCookies(),
        request: createMockRequest(),
        locals: { org: { id: createOrgId("test-org") } },
      } as any),
    ).rejects.toThrow("Invite not found or already accepted");
  });

  it("requires admin role", async () => {
    const mockMember = { id: "user-1", email: "user@test.com", roles: [] };
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockMember as any);
    vi.mocked(assertAdmin).mockImplementation(() => {
      const err = new Error("Admin or owner role required");
      (err as any).status = 403;
      throw err;
    });

    await expect(
      DELETE({
        params: { id: "invite-123" },
        platform: { env: { DB: {} } },
        cookies: createMockCookies(),
        request: createMockRequest(),
        locals: { org: { id: createOrgId("test-org") } },
      } as any),
    ).rejects.toThrow("Admin or owner role required");
  });

  it("returns 400 for missing invite ID", async () => {
    const mockMember = {
      id: "admin-1",
      email: "admin@test.com",
      roles: ["admin"],
    };
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockMember as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});

    await expect(
      DELETE({
        params: { id: "" },
        platform: { env: { DB: {} } },
        cookies: createMockCookies(),
        request: createMockRequest(),
        locals: { org: { id: createOrgId("test-org") } },
      } as any),
    ).rejects.toThrow("Invite ID required");
  });
});
