// Tests for home page server load — redirect authenticated users to roster
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock SvelteKit redirect — throws like the real one
vi.mock("@sveltejs/kit", () => ({
  redirect: (status: number, location: string) => {
    const err = new Error(`Redirect to ${location}`);
    (err as any).status = status;
    (err as any).location = location;
    throw err;
  },
}));

import { load } from "../../routes/+page.server";

function createMockEvent(opts: { memberId?: string } = {}) {
  return {
    cookies: {
      get: vi.fn((name: string) =>
        name === "member_id" ? (opts.memberId ?? null) : null,
      ),
    },
  } as any;
}

describe("Home page server load", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("redirects authenticated users to /events/roster", async () => {
    const event = createMockEvent({ memberId: "member_001" });

    try {
      await load(event);
      expect.fail("Expected redirect to be thrown");
    } catch (err: any) {
      expect(err.status).toBe(302);
      expect(err.location).toBe("/events/roster");
    }
  });

  it("does not redirect when user is not logged in", async () => {
    const event = createMockEvent();

    // Should NOT throw — returns normally so the landing page renders
    const result = await load(event);
    expect(result).toBeUndefined();
  });

  it("does not redirect when member_id cookie is empty string", async () => {
    const event = createMockEvent({ memberId: "" });

    const result = await load(event);
    expect(result).toBeUndefined();
  });
});
