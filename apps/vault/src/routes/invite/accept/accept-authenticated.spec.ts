// TDD: Authenticated user fast-path for /invite/accept (#310)
//
// Root cause: the page unconditionally redirected authenticated users to
// /login?invite=... even when they already had a session. In the cross-org
// case, if the pending_invite cookie was lost in the redirect chain, the user
// ended up in a /login → /invite/accept → /login loop.
//
// Fix (65b7766): if member_id cookie present, look up member email and call
// acceptInvite directly, redirecting to / on success.
//
// Tests here are RED against the unfixed code path (always redirected to login)
// and GREEN with the fix applied.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock SvelteKit — redirect and error both throw, matching real behaviour
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

// Mock acceptInvite so tests are isolated from the DB layer
vi.mock("$lib/server/db/invites", () => ({
  acceptInvite: vi.fn(),
}));

import { acceptInvite } from "$lib/server/db/invites";

const FUTURE = new Date(Date.now() + 86_400_000).toISOString();
const VALID_TOKEN = "invite_tok_valid";
const ROSTER_MEMBER_ID = "roster_b_001";
const SESSION_MEMBER_ID = "alice_001";
const ALICE_EMAIL = "alice@chorus.org";

/**
 * Build a mock D1Database that answers the three SELECT queries the page
 * may issue:
 *   1. SELECT id, roster_member_id, expires_at FROM invites WHERE token = ?
 *   2. SELECT email_id FROM members WHERE id = ?  (roster member)
 *   3. SELECT email_id FROM members WHERE id = ?  (session member)
 *
 * The mock dispatches by SQL snippet + bound params so call order doesn't matter.
 */
function createMockDb(opts: {
  inviteRow: {
    id: string;
    roster_member_id: string;
    expires_at: string;
  } | null;
  rosterEmailId: string | null;
  sessionMemberEmailId: string | null;
}) {
  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        first: vi.fn(async () => {
          // Invite lookup
          if (sql.includes("FROM invites")) {
            return opts.inviteRow;
          }
          // Member email lookup — dispatch by bound id
          if (sql.includes("FROM members WHERE id = ?")) {
            const id = params[0] as string;
            if (id === ROSTER_MEMBER_ID)
              return { email_id: opts.rosterEmailId };
            if (id === SESSION_MEMBER_ID)
              return { email_id: opts.sessionMemberEmailId };
          }
          return null;
        }),
      }),
    }),
  } as unknown as D1Database;
}

function createEvent(opts: { memberId?: string | null; db?: D1Database }) {
  return {
    url: new URL(
      `https://crede.polyphony.uk/invite/accept?token=${VALID_TOKEN}`,
    ),
    platform: { env: { DB: opts.db } },
    cookies: {
      get: vi.fn((name: string) =>
        name === "member_id" ? (opts.memberId ?? null) : null,
      ),
    },
  } as any;
}

// ─── AC1: Authenticated user → fast-path redirect to / ───────────────────────

describe("invite/accept — authenticated user fast-path (#310)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects authenticated user to / after successful acceptInvite (not to /login)", async () => {
    vi.mocked(acceptInvite).mockResolvedValue({
      success: true,
      memberId: SESSION_MEMBER_ID,
    });

    const db = createMockDb({
      inviteRow: {
        id: "inv_1",
        roster_member_id: ROSTER_MEMBER_ID,
        expires_at: FUTURE,
      },
      rosterEmailId: null, // roster slot has no email yet
      sessionMemberEmailId: ALICE_EMAIL, // authenticated user has email
    });

    const { load } = await import("./+page.server");

    try {
      await load(createEvent({ memberId: SESSION_MEMBER_ID, db }));
      expect.fail("Expected redirect");
    } catch (err: any) {
      // RED against unfixed code: unfixed always redirects to /login?invite=...
      expect(err.status).toBe(302);
      expect(err.location).toBe("/");
    }
  });

  it("calls acceptInvite with the session member email, not the roster slot id", async () => {
    vi.mocked(acceptInvite).mockResolvedValue({
      success: true,
      memberId: SESSION_MEMBER_ID,
    });

    const db = createMockDb({
      inviteRow: {
        id: "inv_1",
        roster_member_id: ROSTER_MEMBER_ID,
        expires_at: FUTURE,
      },
      rosterEmailId: null,
      sessionMemberEmailId: ALICE_EMAIL,
    });

    const { load } = await import("./+page.server");

    try {
      await load(createEvent({ memberId: SESSION_MEMBER_ID, db }));
    } catch {
      // expected redirect
    }

    // RED: unfixed code never calls acceptInvite — it just redirects to login.
    expect(acceptInvite).toHaveBeenCalledOnce();
    expect(acceptInvite).toHaveBeenCalledWith(db, VALID_TOKEN, ALICE_EMAIL);
  });
});

// ─── AC2: Cross-org case — authenticated org-A user accepts org-B invite ─────

describe("invite/accept — cross-org authenticated acceptance (#310)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("completes cross-org accept without a /login roundtrip", async () => {
    // Scenario: alice is registered in org A. Org B created a roster slot and
    // sent her an invite. She opens the invite link while already logged in
    // to org B via SSO. The page should resolve via acceptInvite directly.
    vi.mocked(acceptInvite).mockResolvedValue({
      success: true,
      memberId: SESSION_MEMBER_ID,
    });

    const db = createMockDb({
      inviteRow: {
        id: "inv_cross",
        roster_member_id: ROSTER_MEMBER_ID,
        expires_at: FUTURE,
      },
      rosterEmailId: null, // org-B roster slot — no email
      sessionMemberEmailId: ALICE_EMAIL, // alice is already authenticated (from org A SSO)
    });

    const { load } = await import("./+page.server");

    try {
      await load(createEvent({ memberId: SESSION_MEMBER_ID, db }));
      expect.fail("Expected redirect");
    } catch (err: any) {
      // RED: unfixed code redirects cross-org authenticated users to /login,
      // where the pending_invite cookie can be lost, creating a loop.
      expect(err.status).toBe(302);
      expect(err.location).toBe("/");
    }
  });

  it("does not redirect cross-org authenticated user to /login", async () => {
    vi.mocked(acceptInvite).mockResolvedValue({
      success: true,
      memberId: SESSION_MEMBER_ID,
    });

    const db = createMockDb({
      inviteRow: {
        id: "inv_cross",
        roster_member_id: ROSTER_MEMBER_ID,
        expires_at: FUTURE,
      },
      rosterEmailId: null,
      sessionMemberEmailId: ALICE_EMAIL,
    });

    const { load } = await import("./+page.server");

    try {
      await load(createEvent({ memberId: SESSION_MEMBER_ID, db }));
      expect.fail("Expected redirect");
    } catch (err: any) {
      expect(err.location).not.toContain("/login");
    }
  });
});

// ─── AC3: acceptInvite failure — fall through to login flow ──────────────────

describe("invite/accept — authenticated but acceptInvite fails (#310)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("falls through to /login?invite=token when acceptInvite returns failure", async () => {
    vi.mocked(acceptInvite).mockResolvedValue({
      success: false,
      error: "Invite already used",
    });

    const db = createMockDb({
      inviteRow: {
        id: "inv_used",
        roster_member_id: ROSTER_MEMBER_ID,
        expires_at: FUTURE,
      },
      rosterEmailId: null,
      sessionMemberEmailId: ALICE_EMAIL,
    });

    const { load } = await import("./+page.server");

    try {
      await load(createEvent({ memberId: SESSION_MEMBER_ID, db }));
      expect.fail("Expected redirect");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe(
        `/login?invite=${encodeURIComponent(VALID_TOKEN)}`,
      );
    }
  });
});

// ─── Guard: Unauthenticated user still uses the login flow (no regression) ───

describe("invite/accept — unauthenticated user unchanged (#310 guard)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("redirects unauthenticated user to /login?invite=token as before", async () => {
    const db = createMockDb({
      inviteRow: {
        id: "inv_1",
        roster_member_id: ROSTER_MEMBER_ID,
        expires_at: FUTURE,
      },
      rosterEmailId: null,
      sessionMemberEmailId: null, // no session member
    });

    const { load } = await import("./+page.server");

    try {
      await load(createEvent({ memberId: null, db }));
      expect.fail("Expected redirect");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe(
        `/login?invite=${encodeURIComponent(VALID_TOKEN)}`,
      );
    }

    // acceptInvite must NOT be called for unauthenticated requests
    expect(acceptInvite).not.toHaveBeenCalled();
  });

  it("does not call acceptInvite when member_id cookie is absent", async () => {
    const db = createMockDb({
      inviteRow: {
        id: "inv_1",
        roster_member_id: ROSTER_MEMBER_ID,
        expires_at: FUTURE,
      },
      rosterEmailId: null,
      sessionMemberEmailId: null,
    });

    const { load } = await import("./+page.server");

    try {
      await load(createEvent({ memberId: null, db }));
    } catch {
      // expected redirect
    }

    expect(acceptInvite).not.toHaveBeenCalled();
  });
});
