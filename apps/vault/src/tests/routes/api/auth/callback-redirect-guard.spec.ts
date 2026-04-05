// RED: Backslash open-redirect bypass in auth callback destination guard (#296)
//
// The guard in handleLogin (callback/+server.ts):
//   startsWith("/") && !startsWith("//")
//
// /\evil.com passes this guard. Chromium normalises \ → / in Location headers,
// making /\evil.com equivalent to //evil.com (protocol-relative → external host).
//
// These tests verify the callback redirect destination is also hardened,
// mirroring the login.spec.ts guard tests for the cookie-set path.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";

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

vi.mock("$lib/server/db/members", () => ({
  getMemberByEmailId: vi.fn(),
}));

vi.mock("$lib/server/db/invites", () => ({
  acceptInvite: vi.fn(),
}));

vi.mock("jose", () => ({
  importJWK: vi.fn(),
  jwtVerify: vi.fn(),
}));

import { GET } from "../../../../routes/api/auth/callback/+server";
import { getMemberByEmailId } from "$lib/server/db/members";
import { importJWK, jwtVerify } from "jose";

const MOCK_JWKS = {
  keys: [{ kid: "k1", kty: "OKP", crv: "Ed25519", x: "mock-x", alg: "EdDSA" }],
};
const MOCK_PUBLIC_KEY = {};
const MOCK_MEMBER = {
  id: "member-abc",
  email_id: "user@example.com",
  name: "Test User",
  roles: ["admin"],
  voices: [],
  sections: [],
};
const MOCK_PAYLOAD = {
  email: "user@example.com",
  name: "Test User",
  aud: "localhost-dev-vault",
};

function makeMockFetch() {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => MOCK_JWKS,
  });
}

function makeMockDB() {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        run: vi.fn().mockResolvedValue({}),
      }),
    }),
  };
}

/** Build a cookies mock with auth_return_to pre-set to `returnTo` */
function makeCookies(returnTo?: string) {
  const store = new Map<string, string>();
  if (returnTo !== undefined) {
    store.set("auth_return_to", returnTo);
  }
  return {
    get: vi.fn((name: string) => store.get(name) ?? null),
    set: vi.fn((name: string, value: string) => store.set(name, value)),
    delete: vi.fn((name: string) => store.delete(name)),
    getAll: vi.fn(() => []),
    serialize: vi.fn(),
  };
}

function makeEvent(cookies: ReturnType<typeof makeCookies>) {
  return {
    url: new URL("http://localhost/api/auth/callback?token=valid-jwt-token"),
    platform: { env: { DB: makeMockDB() } },
    cookies,
    fetch: makeMockFetch(),
    locals: { org: { id: createOrgId("test-org") } },
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(importJWK).mockResolvedValue(MOCK_PUBLIC_KEY as any);
  vi.mocked(jwtVerify).mockResolvedValue({
    payload: MOCK_PAYLOAD,
    protectedHeader: { alg: "EdDSA" },
  } as any);
  vi.mocked(getMemberByEmailId).mockResolvedValue(MOCK_MEMBER as any);
});

// ─── Backslash bypass vectors ─────────────────────────────────────────────────

// RED (#296): convert all it.fails() to it() once the guard rejects /\ prefix
describe("callback redirect guard — backslash bypass (#296)", () => {
  it.fails("redirects to / when auth_return_to is /\\evil.com", async () => {
    const cookies = makeCookies("/\\evil.com");

    const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
      (e: unknown) => e,
    );

    expect(err.location).toBe("/");
  });

  it.fails("redirects to / when auth_return_to is /\\\\/evil.com", async () => {
    const cookies = makeCookies("/\\\\/evil.com");

    const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
      (e: unknown) => e,
    );

    expect(err.location).toBe("/");
  });

  // //\ already blocked by the existing // guard — no it.fails needed
  it("redirects to / when auth_return_to is //\\evil.com", async () => {
    const cookies = makeCookies("//\\evil.com");

    const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
      (e: unknown) => e,
    );

    expect(err.location).toBe("/");
  });

  it.fails(
    "redirects to / when auth_return_to is /\\\\evil.com (multiple backslashes)",
    async () => {
      const cookies = makeCookies("/\\\\evil.com");

      const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
        (e: unknown) => e,
      );

      expect(err.location).toBe("/");
    },
  );
});

// ─── Existing guards regression ───────────────────────────────────────────────

describe("callback redirect guard — existing vectors still blocked", () => {
  it("redirects to / when auth_return_to is //evil.com", async () => {
    const cookies = makeCookies("//evil.com");

    const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
      (e: unknown) => e,
    );

    expect(err.location).toBe("/");
  });

  it("redirects to / when auth_return_to is https://evil.com", async () => {
    const cookies = makeCookies("https://evil.com");

    const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
      (e: unknown) => e,
    );

    expect(err.location).toBe("/");
  });

  it("redirects to / when no auth_return_to cookie", async () => {
    const cookies = makeCookies();

    const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
      (e: unknown) => e,
    );

    expect(err.location).toBe("/");
  });
});

// ─── Valid paths still work ───────────────────────────────────────────────────

describe("callback redirect guard — valid paths honoured", () => {
  it("redirects to /dashboard when auth_return_to is /dashboard", async () => {
    const cookies = makeCookies("/dashboard");

    const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
      (e: unknown) => e,
    );

    expect(err.location).toBe("/dashboard");
  });

  it("redirects to /members/invite when auth_return_to is /members/invite", async () => {
    const cookies = makeCookies("/members/invite");

    const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
      (e: unknown) => e,
    );

    expect(err.location).toBe("/members/invite");
  });

  it("redirects to / when auth_return_to is /", async () => {
    const cookies = makeCookies("/");

    const err: any = await Promise.resolve(GET(makeEvent(cookies))).catch(
      (e: unknown) => e,
    );

    expect(err.location).toBe("/");
  });
});
