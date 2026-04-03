// Unit tests for hooks.server.ts
import { describe, it, expect } from "vitest";
import {
  extractSubdomain,
  isPublicOrAuthRoute,
  ssoHandle,
} from "./hooks.server";
import type { Handle } from "@sveltejs/kit";

/**
 * Helper to create a mock SvelteKit event for testing ssoHandle.
 * Returns the event and a resolve spy.
 */
function createSsoMockEvent(options: {
  pathname: string;
  search?: string;
  cookies?: Record<string, string>;
}) {
  const { pathname, search = "", cookies = {} } = options;
  const cookieJar = new Map(Object.entries(cookies));
  const setCookieCalls: Array<{
    name: string;
    value: string;
    opts: Record<string, unknown>;
  }> = [];

  const url = new URL(`https://crede.polyphony.uk${pathname}${search}`);

  const event = {
    url,
    cookies: {
      get: (name: string) => cookieJar.get(name),
      set: (
        name: string,
        value: string,
        opts: Record<string, unknown> = {},
      ) => {
        setCookieCalls.push({ name, value, opts });
        cookieJar.set(name, value);
      },
      delete: (name: string, opts: Record<string, unknown> = {}) => {
        cookieJar.delete(name);
      },
    },
  } as unknown as Parameters<Handle>[0]["event"];

  const resolveResponse = new Response("resolved");
  const resolve = async () => resolveResponse;

  return { event, resolve, resolveResponse, setCookieCalls };
}

describe("extractSubdomain", () => {
  describe("localhost handling", () => {
    it("returns dev fallback for plain localhost", () => {
      expect(extractSubdomain("localhost")).toBe("crede");
    });

    it("returns dev fallback for localhost with port", () => {
      expect(extractSubdomain("localhost:5173")).toBe("crede");
    });

    it("extracts subdomain from subdomain.localhost", () => {
      expect(extractSubdomain("crede.localhost")).toBe("crede");
      expect(extractSubdomain("testorg.localhost")).toBe("testorg");
    });

    it("extracts subdomain from subdomain.localhost with port", () => {
      expect(extractSubdomain("crede.localhost:5173")).toBe("crede");
      expect(extractSubdomain("myorg.localhost:3000")).toBe("myorg");
    });
  });

  describe("production hostname handling", () => {
    it("extracts subdomain from multi-part hostname", () => {
      expect(extractSubdomain("crede.polyphony.uk")).toBe("crede");
      expect(extractSubdomain("myorchestra.polyphony.example.com")).toBe(
        "myorchestra",
      );
    });

    it("returns dev fallback for single-part hostname", () => {
      expect(extractSubdomain("polyphony")).toBe("crede");
    });
  });

  describe("skip subdomains", () => {
    it("returns null for www subdomain", () => {
      expect(extractSubdomain("www.polyphony.uk")).toBeNull();
      expect(extractSubdomain("www.localhost")).toBeNull();
    });

    it("returns null for api subdomain", () => {
      expect(extractSubdomain("api.polyphony.uk")).toBeNull();
      expect(extractSubdomain("api.localhost")).toBeNull();
    });

    it("returns null for static subdomain", () => {
      expect(extractSubdomain("static.polyphony.uk")).toBeNull();
      expect(extractSubdomain("static.localhost")).toBeNull();
    });

    it("returns null for vault subdomain", () => {
      expect(extractSubdomain("vault.polyphony.uk")).toBeNull();
      expect(extractSubdomain("vault.localhost")).toBeNull();
    });
  });
});

describe("isPublicOrAuthRoute", () => {
  describe("public API routes (no org context needed)", () => {
    it("returns true for /api/public/ routes", () => {
      expect(isPublicOrAuthRoute("/api/public/organizations")).toBe(true);
      expect(isPublicOrAuthRoute("/api/public/scores/pd")).toBe(true);
      expect(isPublicOrAuthRoute("/api/public/subdomains/check/crede")).toBe(
        true,
      );
    });

    it("returns true for /api/auth/ routes", () => {
      expect(isPublicOrAuthRoute("/api/auth/login")).toBe(true);
      expect(isPublicOrAuthRoute("/api/auth/callback")).toBe(true);
      expect(isPublicOrAuthRoute("/api/auth/logout")).toBe(true);
    });
  });

  describe("protected API routes (org context required)", () => {
    it("returns false for /api/takedowns (org-scoped, #250)", () => {
      expect(isPublicOrAuthRoute("/api/takedowns")).toBe(false);
      expect(isPublicOrAuthRoute("/api/takedowns/abc123")).toBe(false);
    });

    it("returns false for /api/members/", () => {
      expect(isPublicOrAuthRoute("/api/members/abc123")).toBe(false);
    });

    it("returns false for /api/events/", () => {
      expect(isPublicOrAuthRoute("/api/events")).toBe(false);
      expect(isPublicOrAuthRoute("/api/events/abc/works")).toBe(false);
    });

    it("returns false for /api/editions/", () => {
      expect(isPublicOrAuthRoute("/api/editions/abc")).toBe(false);
    });

    it("returns false for /api/settings/", () => {
      expect(isPublicOrAuthRoute("/api/settings")).toBe(false);
    });

    it("returns false for /api/works/", () => {
      expect(isPublicOrAuthRoute("/api/works")).toBe(false);
    });

    it("returns false for /api/voices/", () => {
      expect(isPublicOrAuthRoute("/api/voices")).toBe(false);
    });

    it("returns false for /api/sections/", () => {
      expect(isPublicOrAuthRoute("/api/sections")).toBe(false);
    });

    it("returns false for /api/participation/", () => {
      expect(isPublicOrAuthRoute("/api/participation")).toBe(false);
    });
  });

  describe("non-API routes", () => {
    it("returns false for page routes", () => {
      expect(isPublicOrAuthRoute("/members")).toBe(false);
      expect(isPublicOrAuthRoute("/events")).toBe(false);
      expect(isPublicOrAuthRoute("/login")).toBe(false);
      expect(isPublicOrAuthRoute("/")).toBe(false);
    });
  });
});

// #301 — ssoHandle tests for cross-org invite acceptance bug
describe("ssoHandle", () => {
  describe("invite token preservation (#301 Bug 1)", () => {
    it("sets pending_invite cookie when intercepting /invite/accept?token=xxx", async () => {
      // Scenario: user has SSO cookie but no member_id on this vault,
      // and visits /invite/accept?token=abc123
      // Expected: ssoHandle should set pending_invite cookie BEFORE redirecting to login
      const { event, resolve, setCookieCalls } = createSsoMockEvent({
        pathname: "/invite/accept",
        search: "?token=abc123",
        cookies: { polyphony_sso: "valid-sso-token" },
      });

      const response = await ssoHandle({ event, resolve });

      // Should redirect (302) to login
      expect(response.status).toBe(302);

      // CRITICAL: pending_invite cookie must be set with the invite token
      const pendingInviteCookie = setCookieCalls.find(
        (c) => c.name === "pending_invite",
      );
      expect(pendingInviteCookie).toBeDefined();
      expect(pendingInviteCookie!.value).toBe("abc123");
    });

    it("does NOT set pending_invite for non-invite URLs", async () => {
      // Scenario: normal SSO auto-auth on /members — no invite token to preserve
      const { event, resolve, setCookieCalls } = createSsoMockEvent({
        pathname: "/members",
        cookies: { polyphony_sso: "valid-sso-token" },
      });

      const response = await ssoHandle({ event, resolve });

      // Should still redirect for SSO
      expect(response.status).toBe(302);

      // No pending_invite cookie should be set
      const pendingInviteCookie = setCookieCalls.find(
        (c) => c.name === "pending_invite",
      );
      expect(pendingInviteCookie).toBeUndefined();
    });

    it("preserves the full invite token value in the cookie", async () => {
      // Token with special characters that must survive round-trip
      const longToken = "inv_2026_xK9mQ7pLrWz3YbNvCdEf_GhIjKlMnOp";
      const { event, resolve, setCookieCalls } = createSsoMockEvent({
        pathname: "/invite/accept",
        search: `?token=${encodeURIComponent(longToken)}`,
        cookies: { polyphony_sso: "valid-sso-token" },
      });

      const response = await ssoHandle({ event, resolve });

      expect(response.status).toBe(302);
      const pendingInviteCookie = setCookieCalls.find(
        (c) => c.name === "pending_invite",
      );
      expect(pendingInviteCookie).toBeDefined();
      expect(pendingInviteCookie!.value).toBe(longToken);
    });
  });
});
