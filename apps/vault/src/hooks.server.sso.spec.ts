// Tests for SSO auto-auth handle (issue #256)
// The ssoHandle in hooks.server.ts should auto-redirect to auth when:
//   - no member_id cookie (not authenticated on this subdomain)
//   - polyphony_sso cookie is present (SSO session exists)
// And should NOT redirect when:
//   - member_id cookie is present (already authenticated)
//   - no polyphony_sso cookie (no SSO session to use)
//   - sso_attempted param or cookie is set (loop guard)
//   - path is /api/auth/* (avoid intercepting auth flow itself)
import { describe, it, expect, vi } from "vitest";

import { ssoHandle } from "./hooks.server";

// Helper: build a minimal mock RequestEvent for the ssoHandle
function createMockEvent(
  opts: {
    pathname?: string;
    memberId?: string | null;
    ssoCookie?: string | null;
    searchParams?: Record<string, string>;
    ssoCookieAttempted?: string | null;
  } = {},
) {
  const {
    pathname = "/events/roster",
    memberId = null,
    ssoCookie = null,
    searchParams = {},
    ssoCookieAttempted = null,
  } = opts;

  const params = new URLSearchParams(searchParams);
  const url = new URL(
    `https://crede.polyphony.uk${pathname}${params.size ? `?${params}` : ""}`,
  );

  return {
    url,
    cookies: {
      get: vi.fn((name: string) => {
        if (name === "member_id") return memberId ?? null;
        if (name === "polyphony_sso") return ssoCookie ?? null;
        if (name === "sso_attempted") return ssoCookieAttempted ?? null;
        return null;
      }),
      set: vi.fn(),
    },
    platform: { env: { DB: {} as D1Database } },
    locals: {
      org: {
        id: "org_crede_001",
        name: "Kammerkoor Crede",
        subdomain: "crede",
      },
    },
  } as any;
}

// Helper: build a resolve function that records if it was called
function makeResolve() {
  return vi.fn().mockResolvedValue(new Response("OK", { status: 200 }));
}

describe("ssoHandle — triggers SSO redirect", () => {
  it("redirects to /api/auth/login when no member_id but polyphony_sso cookie exists", async () => {
    const event = createMockEvent({
      memberId: null,
      ssoCookie: "some-sso-token",
    });
    const resolve = makeResolve();

    const response = await ssoHandle({ event, resolve });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/api/auth/login");
    expect(resolve).not.toHaveBeenCalled();
  });

  it("redirect URL includes return_to encoding the current path so user lands there after auth", async () => {
    const event = createMockEvent({
      pathname: "/events/roster",
      memberId: null,
      ssoCookie: "some-sso-token",
    });
    const resolve = makeResolve();

    const response = await ssoHandle({ event, resolve });

    expect(response.status).toBe(302);
    const location = response.headers.get("location") ?? "";
    expect(location).toContain("return_to");
    // The encoded path should appear somewhere in the URL
    expect(decodeURIComponent(location)).toContain("/events/roster");
  });

  it("sets sso_attempted cookie before redirecting (loop guard)", async () => {
    const event = createMockEvent({
      memberId: null,
      ssoCookie: "some-sso-token",
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(event.cookies.set).toHaveBeenCalledWith(
      "sso_attempted",
      "1",
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
  });

  it("does not call resolve when redirecting", async () => {
    const event = createMockEvent({
      memberId: null,
      ssoCookie: "some-sso-token",
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("ssoHandle — does NOT redirect (falls through to resolve)", () => {
  it("calls resolve when member_id cookie is present (already authenticated)", async () => {
    const event = createMockEvent({
      memberId: "member_001",
      ssoCookie: "some-sso-token",
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("does not set sso_attempted cookie when already authenticated", async () => {
    const event = createMockEvent({
      memberId: "member_001",
      ssoCookie: "some-sso-token",
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(event.cookies.set).not.toHaveBeenCalled();
  });

  it("calls resolve when neither member_id nor polyphony_sso cookie is present", async () => {
    const event = createMockEvent({ memberId: null, ssoCookie: null });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("calls resolve (no redirect) when polyphony_sso is empty string", async () => {
    const event = createMockEvent({ memberId: null, ssoCookie: "" });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
  });
});

describe("ssoHandle — loop guard prevents infinite redirect", () => {
  it("calls resolve when sso_attempted=1 query param is present", async () => {
    const event = createMockEvent({
      memberId: null,
      ssoCookie: "some-sso-token",
      searchParams: { sso_attempted: "1" },
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("calls resolve when sso_attempted cookie is set", async () => {
    const event = createMockEvent({
      memberId: null,
      ssoCookie: "some-sso-token",
      ssoCookieAttempted: "1",
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("does not set sso_attempted cookie again when loop guard is already active", async () => {
    const event = createMockEvent({
      memberId: null,
      ssoCookie: "some-sso-token",
      ssoCookieAttempted: "1",
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(event.cookies.set).not.toHaveBeenCalled();
  });
});

describe("ssoHandle — does not intercept auth routes", () => {
  it("calls resolve for /api/auth/login (auth initiation route)", async () => {
    const event = createMockEvent({
      pathname: "/api/auth/login",
      memberId: null,
      ssoCookie: "some-sso-token",
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("calls resolve for /api/auth/callback (auth callback route)", async () => {
    const event = createMockEvent({
      pathname: "/api/auth/callback",
      memberId: null,
      ssoCookie: "some-sso-token",
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("calls resolve for /api/auth/logout", async () => {
    const event = createMockEvent({
      pathname: "/api/auth/logout",
      memberId: null,
      ssoCookie: "some-sso-token",
    });
    const resolve = makeResolve();

    await ssoHandle({ event, resolve });

    expect(resolve).toHaveBeenCalledWith(event);
  });
});
