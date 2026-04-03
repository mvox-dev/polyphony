// TDD RED: PUT /api/members/[id]/voices — voice replacement endpoint (#320)
//
// The existing POST/DELETE endpoints require admin only.
// This new PUT endpoint replaces the full voice set and has richer permissions:
//   owner / admin    → can edit any member's voices
//   conductor        → can edit any member's voices
//   section_leader   → can edit members in their section only
//   self             → can edit own voices
//   librarian        → denied
//   no role          → denied
//   unauthenticated  → 401
//
// Request body: { voiceIds: string[] }  (empty array clears all voices)

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";
import type { Role } from "$lib/types";

vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    error: (status: number, message: string) => {
      const err = new Error(message);
      (err as any).status = status;
      throw err;
    },
    json: (data: any, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  };
});

vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
}));

vi.mock("$lib/server/db/members", () => ({
  getMemberById: vi.fn(),
  setMemberVoices: vi.fn(),
}));

const ORG_ID = createOrgId("test-org");
const SECTION_SHARED = {
  id: "sec_soprano",
  orgId: ORG_ID,
  name: "Soprano 1",
  abbreviation: "S1",
  parentSectionId: null,
  displayOrder: 1,
  isActive: true,
};
const SECTION_OTHER = {
  id: "sec_alto",
  orgId: ORG_ID,
  name: "Alto",
  abbreviation: "A",
  parentSectionId: null,
  displayOrder: 2,
  isActive: true,
};

function makeMember(
  overrides: Partial<{
    id: string;
    roles: Role[];
    sections: (typeof SECTION_SHARED)[];
  }>,
) {
  return {
    id: "member-id",
    email_id: "user@test.com",
    email_contact: null,
    name: "Test User",
    nickname: null,
    roles: [] as Role[],
    voices: [],
    sections: [],
    invited_by: null,
    joined_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

const TARGET_ID = "target-member-id";

const targetMemberInSharedSection = makeMember({
  id: TARGET_ID,
  roles: [],
  sections: [SECTION_SHARED],
});

const targetMemberInOtherSection = makeMember({
  id: TARGET_ID,
  roles: [],
  sections: [SECTION_OTHER],
});

const targetMemberNoSection = makeMember({
  id: TARGET_ID,
  roles: [],
  sections: [],
});

function createEvent(opts: {
  targetMemberId?: string;
  voiceIds?: string[];
  actorCookiePresent?: boolean;
}): RequestEvent {
  const {
    targetMemberId = TARGET_ID,
    voiceIds = ["voice_soprano"],
    actorCookiePresent = true,
  } = opts;

  return {
    params: { id: targetMemberId },
    request: new Request("http://localhost", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceIds }),
    }),
    platform: { env: { DB: {} } },
    cookies: {
      get: vi.fn(() => (actorCookiePresent ? "mock-session" : undefined)),
    },
    locals: { org: { id: ORG_ID } },
  } as any;
}

// ─── Permission tests ─────────────────────────────────────────────────────────

describe("PUT /api/members/[id]/voices — permissions", () => {
  let PUT: (event: RequestEvent) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod =
      await import("../../../../routes/api/members/[id]/voices/+server");
    PUT = mod.PUT;
    const { getMemberById, setMemberVoices } =
      await import("$lib/server/db/members");
    vi.mocked(getMemberById).mockResolvedValue(targetMemberInSharedSection);
    vi.mocked(setMemberVoices).mockResolvedValue(undefined);
  });

  it("owner can replace any member's voices", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["owner"] }),
    );

    const response = await PUT(createEvent({}));
    expect(response.status).toBe(200);
  });

  it("admin can replace any member's voices", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["admin"] }),
    );

    const response = await PUT(createEvent({}));
    expect(response.status).toBe(200);
  });

  it("conductor can replace any member's voices", async () => {
    // RED: existing POST/DELETE require assertAdmin which denies conductors.
    // PUT must allow conductors explicitly.
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["conductor"] }),
    );

    const response = await PUT(createEvent({}));
    expect(response.status).toBe(200);
  });

  it("section_leader in same section can replace voices", async () => {
    // RED: no section-scoped voice editing exists yet.
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["section_leader"], sections: [SECTION_SHARED] }),
    );

    const response = await PUT(createEvent({}));
    expect(response.status).toBe(200);
  });

  it("section_leader in different section is denied", async () => {
    // RED: section_leader with no shared section must get 403.
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["section_leader"], sections: [SECTION_OTHER] }),
    );
    const { getMemberById } = await import("$lib/server/db/members");
    vi.mocked(getMemberById).mockResolvedValue(targetMemberInSharedSection);

    await expect(PUT(createEvent({}))).rejects.toMatchObject({ status: 403 });
  });

  it("member can replace their own voices (self-edit)", async () => {
    // RED: self-editing is a new permission not present on POST/DELETE.
    const selfId = "self-member-id";
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ id: selfId, roles: [] }),
    );
    const { getMemberById } = await import("$lib/server/db/members");
    vi.mocked(getMemberById).mockResolvedValue(
      makeMember({ id: selfId, roles: [] }),
    );

    const response = await PUT(createEvent({ targetMemberId: selfId }));
    expect(response.status).toBe(200);
  });

  it("librarian is denied", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["librarian"] }),
    );

    await expect(PUT(createEvent({}))).rejects.toMatchObject({ status: 403 });
  });

  it("member with no roles is denied", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: [] }),
    );

    await expect(PUT(createEvent({}))).rejects.toMatchObject({ status: 403 });
  });

  it("unauthenticated request is rejected", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockRejectedValue(
      Object.assign(new Error("Unauthorized"), { status: 401 }),
    );

    await expect(
      PUT(createEvent({ actorCookiePresent: false })),
    ).rejects.toMatchObject({ status: 401 });
  });
});

// ─── Section leader scope ─────────────────────────────────────────────────────

describe("PUT /api/members/[id]/voices — section leader scope", () => {
  let PUT: (event: RequestEvent) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod =
      await import("../../../../routes/api/members/[id]/voices/+server");
    PUT = mod.PUT;
    const { setMemberVoices } = await import("$lib/server/db/members");
    vi.mocked(setMemberVoices).mockResolvedValue(undefined);
  });

  it("allowed when at least one section overlaps", async () => {
    const EXTRA_SECTION = {
      id: "sec_tenor",
      orgId: ORG_ID,
      name: "Tenor",
      abbreviation: "T",
      parentSectionId: null,
      displayOrder: 3,
      isActive: true,
    };
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    const { getMemberById } = await import("$lib/server/db/members");

    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      // Leader is in Soprano 1 + Tenor
      makeMember({
        roles: ["section_leader"],
        sections: [SECTION_SHARED, EXTRA_SECTION],
      }),
    );
    vi.mocked(getMemberById).mockResolvedValue(
      // Target is in Alto + Soprano 1 (overlap on Soprano 1)
      makeMember({ id: TARGET_ID, sections: [SECTION_OTHER, SECTION_SHARED] }),
    );

    const response = await PUT(createEvent({}));
    expect(response.status).toBe(200);
  });

  it("denied when no section overlaps at all", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    const { getMemberById } = await import("$lib/server/db/members");

    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["section_leader"], sections: [SECTION_OTHER] }),
    );
    vi.mocked(getMemberById).mockResolvedValue(
      makeMember({ id: TARGET_ID, sections: [SECTION_SHARED] }), // different section
    );

    await expect(PUT(createEvent({}))).rejects.toMatchObject({ status: 403 });
  });

  it("denied when target member has no sections assigned", async () => {
    // A roster member with no section can only be edited by admin/owner/conductor.
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    const { getMemberById } = await import("$lib/server/db/members");

    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["section_leader"], sections: [SECTION_SHARED] }),
    );
    vi.mocked(getMemberById).mockResolvedValue(targetMemberNoSection);

    await expect(PUT(createEvent({}))).rejects.toMatchObject({ status: 403 });
  });
});

// ─── Voice replacement logic ──────────────────────────────────────────────────

describe("PUT /api/members/[id]/voices — replacement logic", () => {
  let PUT: (event: RequestEvent) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod =
      await import("../../../../routes/api/members/[id]/voices/+server");
    PUT = mod.PUT;
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    const { getMemberById, setMemberVoices } =
      await import("$lib/server/db/members");

    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["admin"] }),
    );
    vi.mocked(getMemberById).mockResolvedValue(targetMemberInSharedSection);
    vi.mocked(setMemberVoices).mockResolvedValue(undefined);
  });

  it("calls setMemberVoices with the full replacement list", async () => {
    const { setMemberVoices } = await import("$lib/server/db/members");
    const voiceIds = ["voice_soprano", "voice_alto"];

    await PUT(createEvent({ voiceIds }));

    expect(setMemberVoices).toHaveBeenCalledWith(
      expect.anything(), // db
      TARGET_ID,
      voiceIds,
      expect.anything(), // actor id or orgId
    );
  });

  it("accepts empty array to clear all voices", async () => {
    const { setMemberVoices } = await import("$lib/server/db/members");

    const response = await PUT(createEvent({ voiceIds: [] }));

    expect(response.status).toBe(200);
    expect(setMemberVoices).toHaveBeenCalledWith(
      expect.anything(),
      TARGET_ID,
      [],
      expect.anything(),
    );
  });

  it("returns 404 when target member does not exist", async () => {
    const { getMemberById } = await import("$lib/server/db/members");
    vi.mocked(getMemberById).mockResolvedValue(null);

    await expect(PUT(createEvent({}))).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a non-array voiceIds body", async () => {
    const badEvent = {
      ...createEvent({}),
      request: new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceIds: "soprano" }), // string, not array
      }),
    } as any;

    await expect(PUT(badEvent)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects a missing voiceIds field", async () => {
    const badEvent = {
      ...createEvent({}),
      request: new Request("http://localhost", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    } as any;

    await expect(PUT(badEvent)).rejects.toMatchObject({ status: 400 });
  });
});

// ─── Org scoping ──────────────────────────────────────────────────────────────

describe("PUT /api/members/[id]/voices — org scoping", () => {
  let PUT: (event: RequestEvent) => Promise<Response>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod =
      await import("../../../../routes/api/members/[id]/voices/+server");
    PUT = mod.PUT;
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    const { getMemberById, setMemberVoices } =
      await import("$lib/server/db/members");

    vi.mocked(getAuthenticatedMember).mockResolvedValue(
      makeMember({ roles: ["admin"] }),
    );
    vi.mocked(getMemberById).mockResolvedValue(targetMemberInSharedSection);
    vi.mocked(setMemberVoices).mockResolvedValue(undefined);
  });

  it("passes current org ID to getMemberById", async () => {
    const { getMemberById } = await import("$lib/server/db/members");

    await PUT(createEvent({}));

    expect(getMemberById).toHaveBeenCalledWith(
      expect.anything(), // db
      TARGET_ID,
      ORG_ID,
    );
  });

  it("passes current org ID to getAuthenticatedMember", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");

    await PUT(createEvent({}));

    expect(getAuthenticatedMember).toHaveBeenCalledWith(
      expect.anything(), // db
      expect.anything(), // cookies
      ORG_ID,
    );
  });
});
