// Tests for OAuth callback with roster member upgrade flow (Issue #97)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";

// Mock SvelteKit functions BEFORE importing the handler
vi.mock("@sveltejs/kit", () => ({
  redirect: (status: number, location: string) => {
    const err = new Error(`Redirect to ${location}`);
    (err as any).status = status;
    (err as any).location = location;
    throw err;
  },
  error: (status: number, message: string) => {
    const err = new Error(message);
    (err as any).status = status;
    throw err;
  },
}));

// Mock members db
vi.mock("$lib/server/db/members", () => ({
  getMemberByEmailId: vi.fn(),
  createMember: vi.fn(),
}));

// Mock invites db
vi.mock("$lib/server/db/invites", () => ({
  acceptInvite: vi.fn(),
}));

// Mock jose library
vi.mock("jose", () => ({
  importJWK: vi.fn(),
  jwtVerify: vi.fn(),
}));

import { GET } from "../../../../routes/api/auth/callback/+server";
import { getMemberByEmailId, createMember } from "$lib/server/db/members";
import { acceptInvite } from "$lib/server/db/invites";
import { importJWK, jwtVerify } from "jose";

function createMockURL(token: string, inviteParam?: string) {
  const url = new URL("http://localhost:5173/api/auth/callback");
  url.searchParams.set("token", token);
  // Note: invite token is now passed via cookie, not URL param
  return url;
}

function createMockCookies(pendingInvite?: string) {
  const cookies = new Map<string, string>();

  // Pre-set pending_invite cookie if provided
  if (pendingInvite) {
    cookies.set("pending_invite", pendingInvite);
  }

  return {
    get: vi.fn((name: string) => cookies.get(name)),
    set: vi.fn((name: string, value: string, options?: any) => {
      cookies.set(name, value);
    }),
    delete: vi.fn((name: string, options?: any) => cookies.delete(name)),
  };
}

function createMockFetch(jwksResponse: any) {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => jwksResponse,
  });
}

describe("OAuth callback - Roster member upgrade flow", () => {
  const mockJWKS = {
    keys: [
      {
        kid: "key-1",
        kty: "OKP",
        crv: "Ed25519",
        x: "mock-x-coordinate",
        alg: "EdDSA",
      },
    ],
  };

  const mockPublicKey = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(importJWK).mockResolvedValue(mockPublicKey as any);
  });

  it("upgrades roster member when invite token present in cookie", async () => {
    const mockPayload = {
      email: "verified@oauth.com",
      name: "Verified User",
      aud: "localhost-dev-vault",
    };

    const mockUpgradedMember = {
      id: "roster-member-123",
      email_id: "verified@oauth.com",
      name: "Verified User",
      roles: ["librarian"],
      voices: [],
      sections: [],
    };

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: "EdDSA" },
    } as any);

    vi.mocked(acceptInvite).mockResolvedValue({
      success: true,
      memberId: "roster-member-123",
      member: mockUpgradedMember,
    } as any);

    // Pass invite token via cookie instead of URL
    const cookies = createMockCookies("invite-token-abc");
    const mockFetch = createMockFetch(mockJWKS);

    try {
      await GET({
        url: createMockURL("valid-jwt-token"),
        platform: { env: { DB: {} } },
        cookies,
        fetch: mockFetch,
        locals: { org: { id: createOrgId("test-org") } },
      } as any);

      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      // Verify redirect to profile with welcome
      expect(err.location).toBe("/profile?welcome=true");
      expect(err.status).toBe(302);
    }

    // Verify acceptInvite was called with correct parameters
    expect(acceptInvite).toHaveBeenCalledWith(
      {},
      "invite-token-abc",
      "verified@oauth.com",
    );

    // Verify pending_invite cookie was deleted
    expect(cookies.delete).toHaveBeenCalledWith("pending_invite", {
      path: "/",
    });

    // Verify member_id cookie was set
    expect(cookies.set).toHaveBeenCalledWith(
      "member_id",
      "roster-member-123",
      expect.objectContaining({
        path: "/",
        httpOnly: true,
        secure: true,
      }),
    );
  });

  it("redirects to login with error when invite acceptance fails", async () => {
    const mockPayload = {
      email: "test@example.com",
      aud: "localhost-dev-vault",
    };

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: "EdDSA" },
    } as any);

    vi.mocked(acceptInvite).mockResolvedValue({
      success: false,
      error: "Invitation already used",
    } as any);

    // Pass invite token via cookie instead of URL
    const cookies = createMockCookies("used-invite-token");
    const mockFetch = createMockFetch(mockJWKS);

    try {
      await GET({
        url: createMockURL("valid-jwt-token"),
        platform: { env: { DB: {} } },
        cookies,
        fetch: mockFetch,
        locals: { org: { id: createOrgId("test-org") } },
      } as any);

      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      // Verify redirect to login with error
      expect(err.location).toContain("/login?error=");
      expect(err.location).toContain("Invitation%20already%20used");
      expect(err.status).toBe(302);
    }
  });

  it("finds existing registered member by email_id for regular login", async () => {
    const mockPayload = {
      email: "registered@example.com",
      name: "Registered User",
      aud: "localhost-dev-vault",
    };

    const mockMember = {
      id: "existing-member-456",
      email_id: "registered@example.com",
      name: "Registered User",
      roles: ["admin"],
      voices: [],
      sections: [],
    };

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: "EdDSA" },
    } as any);

    vi.mocked(getMemberByEmailId).mockResolvedValue(mockMember as any);

    const cookies = createMockCookies();
    const mockFetch = createMockFetch(mockJWKS);
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
      }),
    };

    try {
      await GET({
        url: createMockURL("valid-jwt-token"), // No invite parameter
        platform: { env: { DB: mockDB } },
        cookies,
        fetch: mockFetch,
        locals: { org: { id: createOrgId("test-org") } },
      } as any);

      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      // Verify redirect to home
      expect(err.location).toBe("/");
      expect(err.status).toBe(302);
    }

    // Verify getMemberByEmailId was called
    expect(getMemberByEmailId).toHaveBeenCalledWith(
      mockDB,
      "registered@example.com",
      "test-org",
    );

    // Verify acceptInvite was NOT called (no invite)
    expect(acceptInvite).not.toHaveBeenCalled();

    // Verify member_id cookie was set
    expect(cookies.set).toHaveBeenCalledWith(
      "member_id",
      "existing-member-456",
      expect.objectContaining({
        path: "/",
        httpOnly: true,
      }),
    );
  });

  it("rejects login for unregistered email (no invite)", async () => {
    const mockPayload = {
      email: "unknown@example.com",
      aud: "localhost-dev-vault",
    };

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: "EdDSA" },
    } as any);

    vi.mocked(getMemberByEmailId).mockResolvedValue(null);

    const cookies = createMockCookies();
    const mockFetch = createMockFetch(mockJWKS);

    try {
      await GET({
        url: createMockURL("valid-jwt-token"),
        platform: { env: { DB: {} } },
        cookies,
        fetch: mockFetch,
        locals: { org: { id: createOrgId("test-org") } },
      } as any);

      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      // Verify redirect to login with not_registered error
      expect(err.location).toBe("/login?error=not_registered");
      expect(err.status).toBe(302);
    }

    // Verify createMember was NOT called
    expect(createMember).not.toHaveBeenCalled();
  });

  it("updates member name from OAuth if changed", async () => {
    const mockPayload = {
      email: "user@example.com",
      name: "Updated Name",
      aud: "localhost-dev-vault",
    };

    const mockMember = {
      id: "member-789",
      email_id: "user@example.com",
      name: "Old Name",
      roles: [],
      voices: [],
      sections: [],
    };

    vi.mocked(jwtVerify).mockResolvedValue({
      payload: mockPayload,
      protectedHeader: { alg: "EdDSA" },
    } as any);

    vi.mocked(getMemberByEmailId).mockResolvedValue(mockMember as any);

    const cookies = createMockCookies();
    const mockFetch = createMockFetch(mockJWKS);
    const mockDB = {
      prepare: vi.fn().mockReturnValue({
        bind: vi.fn().mockReturnValue({
          run: vi.fn().mockResolvedValue({}),
        }),
      }),
    };

    try {
      await GET({
        url: createMockURL("valid-jwt-token"),
        platform: { env: { DB: mockDB } },
        cookies,
        fetch: mockFetch,
        locals: { org: { id: createOrgId("test-org") } },
      } as any);

      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      expect(err.location).toBe("/");
    }

    // Verify name was updated
    expect(mockDB.prepare).toHaveBeenCalledWith(
      "UPDATE members SET name = ? WHERE id = ?",
    );
  });
});
