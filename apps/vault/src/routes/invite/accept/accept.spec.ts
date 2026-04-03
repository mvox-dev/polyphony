import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock SvelteKit helpers — redirect and error both throw like the real ones
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

// Helper to create a mock D1 prepared statement that returns a given value
function makePrepared(returnValue: unknown) {
  return {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(returnValue),
  };
}

// Helper to build a mock event
function createMockEvent(
  opts: {
    token?: string | null;
    memberId?: string | null;
    inviteRow?: {
      id: string;
      roster_member_id: string;
      expires_at: string;
    } | null;
    memberRow?: { email_id: string | null } | null;
  } = {},
) {
  const {
    token = "valid-token",
    memberId = null,
    inviteRow = {
      id: "invite_1",
      roster_member_id: "member_1",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    },
    memberRow = { email_id: null },
  } = opts;

  // Build mock DB: first prepare() call → invite lookup, second → member lookup
  let callCount = 0;
  const mockDb = {
    prepare: vi.fn(() => {
      callCount++;
      if (callCount === 1) return makePrepared(inviteRow);
      return makePrepared(memberRow);
    }),
  } as unknown as D1Database;

  return {
    url: new URL(
      `https://example.com/invite/accept${token !== null ? `?token=${token}` : ""}`,
    ),
    platform: { env: { DB: mockDb } },
    cookies: {
      get: vi.fn((name: string) =>
        name === "member_id" ? (memberId ?? null) : null,
      ),
    },
  } as any;
}

describe("invite/accept load — happy path (no regression)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to /login?invite=<token> for a fresh, unregistered invite", async () => {
    const { load } = await import("./+page.server");
    const event = createMockEvent({
      token: "fresh-token",
      memberId: null,
      inviteRow: {
        id: "invite_1",
        roster_member_id: "member_1",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
      memberRow: { email_id: null },
    });

    try {
      await load(event);
      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe("/login?invite=fresh-token");
    }
  });

  it("throws 400 for an expired, unused invite", async () => {
    const { load } = await import("./+page.server");
    const event = createMockEvent({
      token: "expired-token",
      memberId: null,
      inviteRow: {
        id: "invite_1",
        roster_member_id: "member_1",
        expires_at: new Date(Date.now() - 86400000).toISOString(), // in the past
      },
      memberRow: { email_id: null },
    });

    try {
      await load(event);
      expect.fail("Expected error to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(400);
      expect(err.message).toMatch(/expired/i);
    }
  });

  it("throws 400 for a missing token param", async () => {
    const { load } = await import("./+page.server");
    const event = createMockEvent({ token: null });
    // Override URL to have no token param at all
    event.url = new URL("https://example.com/invite/accept");

    try {
      await load(event);
      expect.fail("Expected error to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(400);
    }
  });
});

describe("invite/accept load — already-registered member (issue #255)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to / when member already registered and session exists (email_id set)", async () => {
    const { load } = await import("./+page.server");
    const event = createMockEvent({
      token: "used-token",
      memberId: "member_1", // active session
      inviteRow: {
        id: "invite_1",
        roster_member_id: "member_1",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
      memberRow: { email_id: "user@example.com" }, // already registered
    });

    try {
      await load(event);
      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe("/");
    }
  });

  it("redirects to /login when member already registered and no session (email_id set)", async () => {
    const { load } = await import("./+page.server");
    const event = createMockEvent({
      token: "used-token",
      memberId: null, // no session
      inviteRow: {
        id: "invite_1",
        roster_member_id: "member_1",
        expires_at: new Date(Date.now() + 86400000).toISOString(),
      },
      memberRow: { email_id: "user@example.com" }, // already registered
    });

    try {
      await load(event);
      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe("/login");
    }
  });
});

describe("invite/accept load — token not found (issue #255)", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("redirects to / when token not found and session exists", async () => {
    const { load } = await import("./+page.server");
    const event = createMockEvent({
      token: "pruned-token",
      memberId: "member_1", // active session
      inviteRow: null, // row deleted after use
    });

    try {
      await load(event);
      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe("/");
    }
  });

  it("redirects to /login when token not found and no session", async () => {
    const { load } = await import("./+page.server");
    const event = createMockEvent({
      token: "pruned-token",
      memberId: null, // no session
      inviteRow: null, // row deleted or pruned
    });

    try {
      await load(event);
      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe("/login");
    }
  });
});
