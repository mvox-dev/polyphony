// Unit tests for /api/auth/logout — #301 Bug 2: logout doesn't clear SSO cookie
import { describe, it, expect } from "vitest";
import { GET } from "./+server";

/**
 * Create a mock RequestEvent for logout endpoint testing.
 */
function createMockEvent(
  options: { origin?: string; cookies?: Record<string, string> } = {},
) {
  const { origin = "https://crede.polyphony.uk", cookies = {} } = options;
  const cookieJar = new Map(Object.entries(cookies));
  const deletedCookies: Array<{ name: string; opts: Record<string, unknown> }> =
    [];

  const event = {
    url: new URL(`${origin}/api/auth/logout`),
    cookies: {
      get: (name: string) => cookieJar.get(name),
      set: (
        name: string,
        value: string,
        opts: Record<string, unknown> = {},
      ) => {
        cookieJar.set(name, value);
      },
      delete: (name: string, opts: Record<string, unknown> = {}) => {
        deletedCookies.push({ name, opts });
        cookieJar.delete(name);
      },
    },
  } as unknown as Parameters<typeof GET>[0];

  return { event, deletedCookies };
}

/**
 * Extract redirect location from SvelteKit redirect error.
 * SvelteKit's redirect() throws an object with status + location.
 */
async function getRedirect(
  event: Parameters<typeof GET>[0],
): Promise<{ status: number; location: string }> {
  try {
    await GET(event);
    throw new Error("Expected redirect, but handler returned normally");
  } catch (err: unknown) {
    if (
      err &&
      typeof err === "object" &&
      "status" in err &&
      "location" in err
    ) {
      return { status: err.status as number, location: err.location as string };
    }
    throw err;
  }
}

describe("GET /api/auth/logout (#301)", () => {
  it("deletes the member_id cookie", async () => {
    const { event, deletedCookies } = createMockEvent({
      cookies: { member_id: "mem-123" },
    });

    await getRedirect(event);

    const memberIdDelete = deletedCookies.find((c) => c.name === "member_id");
    expect(memberIdDelete).toBeDefined();
  });

  it("deletes the sso_attempted cookie", async () => {
    // Bug 2: logout must clear sso_attempted so the next visit
    // doesn't skip SSO auto-auth
    const { event, deletedCookies } = createMockEvent({
      cookies: { member_id: "mem-123", sso_attempted: "1" },
    });

    await getRedirect(event);

    const ssoAttemptedDelete = deletedCookies.find(
      (c) => c.name === "sso_attempted",
    );
    expect(ssoAttemptedDelete).toBeDefined();
  });

  it("redirects to Registry /auth/logout instead of /", async () => {
    // Bug 2: redirecting to / leaves the polyphony_sso cookie alive,
    // causing ssoHandle to immediately re-authenticate the user.
    // Must redirect to Registry logout to clear the SSO cookie.
    const { event } = createMockEvent();

    const { status, location } = await getRedirect(event);

    expect(status).toBe(302);
    // Should redirect to Registry, not to /
    expect(location).not.toBe("/");
    expect(location).toContain("polyphony.uk");
    expect(location).toContain("/auth/logout");
  });

  it("includes callback= with the current vault origin URL in redirect", async () => {
    // After Registry clears the SSO cookie, it should redirect back
    // to the vault's login page
    const origin = "https://crede.polyphony.uk";
    const { event } = createMockEvent({ origin });

    const { location } = await getRedirect(event);

    // The redirect URL should include a callback param pointing back to this vault
    expect(location).toContain("callback=");
    expect(location).toContain(encodeURIComponent(origin));
  });
});
