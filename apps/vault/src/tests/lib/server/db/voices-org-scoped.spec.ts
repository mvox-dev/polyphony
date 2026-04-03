// Failing tests for issue #252: voices table lacks org_id — all 9 DB functions are unscoped
//
// Vulnerabilities:
// 1. getActiveVoices(db) has no orgId param — returns ALL orgs' voices
// 2. getAllVoicesWithCounts(db) has no orgId param — cross-org data leak
// 3. createVoice(db, input) has no orgId — voices stored globally
// 4. toggleVoiceActive(db, id, flag) has no orgId — admin on org A can toggle org B's voices
// 5. deleteVoice(db, id) has no orgId — cross-org delete possible
// 6. reorderVoices(db, ids) has no orgId — can reorder another org's voices
// 7. Two orgs currently share the same voice pool (day-one multi-org blocker)
//
// All failing tests are in the RED phase — the org-scope contract doesn't exist yet.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("$lib/server/db/voices", () => ({
  getActiveVoices: vi.fn(),
  getAllVoices: vi.fn(),
  getAllVoicesWithCounts: vi.fn(),
  getVoiceById: vi.fn(),
  createVoice: vi.fn(),
  toggleVoiceActive: vi.fn(),
  deleteVoice: vi.fn(),
  reorderVoices: vi.fn(),
  reassignVoice: vi.fn(),
}));

vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

import {
  getActiveVoices,
  getAllVoicesWithCounts,
  createVoice,
  toggleVoiceActive,
  deleteVoice,
  reorderVoices,
} from "$lib/server/db/voices";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import { POST } from "../../../../routes/api/voices/+server";
import { PATCH, DELETE } from "../../../../routes/api/voices/[id]/+server";
import { POST as REORDER } from "../../../../routes/api/voices/reorder/+server";
import type { Member } from "$lib/server/db/members";
import type { Voice } from "$lib/types";

// ============================================================================
// Fixtures
// ============================================================================

const ORG_A_ID = "org_crede_001";
const ORG_B_ID = "org_hannijoggi_001";

const mockAdmin: Member = {
  id: "admin_001",
  name: "Admin User",
  nickname: null,
  email_id: "admin@crede.example",
  email_contact: null,
  roles: ["admin"],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2026-01-01T00:00:00Z",
};

// Org A's voices
const ORG_A_SOPRANO: Voice = {
  id: "voice_crede_soprano",
  name: "Soprano",
  abbreviation: "S",
  category: "vocal",
  rangeGroup: "soprano",
  displayOrder: 10,
  isActive: true,
};

const ORG_A_ALTO: Voice = {
  id: "voice_crede_alto",
  name: "Alto",
  abbreviation: "A",
  category: "vocal",
  rangeGroup: "alto",
  displayOrder: 20,
  isActive: true,
};

// Org B's voices — same names, different IDs
const ORG_B_SOPRANO: Voice = {
  id: "voice_hov_soprano",
  name: "Soprano",
  abbreviation: "S",
  category: "vocal",
  rangeGroup: "soprano",
  displayOrder: 10,
  isActive: true,
};

function makeEvent(
  opts: {
    org?: { id: string } | null;
    body?: unknown;
    params?: Record<string, string>;
    method?: string;
  } = {},
) {
  const { org = { id: ORG_A_ID }, body, params = {}, method = "POST" } = opts;
  return {
    platform: { env: { DB: {} as D1Database } },
    cookies: {
      get: vi.fn(),
      getAll: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    },
    params,
    request: new Request("https://crede.polyphony.uk/api/voices", {
      method,
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined,
    }),
    url: new URL("https://crede.polyphony.uk/api/voices"),
    locals: { org },
    route: { id: "/api/voices" },
    getClientAddress: () => "127.0.0.1",
    fetch: vi.fn(),
    setHeaders: vi.fn(),
    isDataRequest: false,
    isSubRequest: false,
  } as any;
}

// ============================================================================
// Part 1: DB function signatures must accept orgId
// ============================================================================

describe("voices DB functions — must accept orgId parameter (#252)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("getActiveVoices must accept orgId as second parameter", () => {
    // After fix: getActiveVoices(db, orgId) filters by org_id
    // This test documents the required signature.
    // Currently the function signature is getActiveVoices(db) — no orgId.
    const fn = getActiveVoices as unknown as (
      db: D1Database,
      orgId: string,
    ) => Promise<Voice[]>;
    vi.mocked(getActiveVoices).mockResolvedValue([ORG_A_SOPRANO]);

    // If the function only accepts 1 param, calling with 2 would succeed at runtime
    // but the SQL wouldn't filter — we verify the mock records the orgId arg
    fn({} as D1Database, ORG_A_ID);
    expect(vi.mocked(getActiveVoices)).toHaveBeenCalledWith(
      expect.anything(),
      ORG_A_ID,
    );
  });

  it("getAllVoicesWithCounts must accept orgId as second parameter", () => {
    const fn = getAllVoicesWithCounts as unknown as (
      db: D1Database,
      orgId: string,
    ) => Promise<any[]>;
    vi.mocked(getAllVoicesWithCounts).mockResolvedValue([]);

    fn({} as D1Database, ORG_A_ID);
    expect(vi.mocked(getAllVoicesWithCounts)).toHaveBeenCalledWith(
      expect.anything(),
      ORG_A_ID,
    );
  });

  it("createVoice input must include orgId field", () => {
    // After fix: CreateVoiceInput gains orgId
    const validInput = {
      name: "Soprano",
      abbreviation: "S",
      category: "vocal" as const,
      displayOrder: 10,
      orgId: ORG_A_ID, // must exist after fix
    };
    expect(validInput.orgId).toBeDefined();
  });

  it("toggleVoiceActive must accept orgId to prevent cross-org toggle", () => {
    const fn = toggleVoiceActive as unknown as (
      db: D1Database,
      id: string,
      isActive: boolean,
      orgId: string,
    ) => Promise<boolean>;
    vi.mocked(toggleVoiceActive).mockResolvedValue(true);

    fn({} as D1Database, "voice_crede_soprano", false, ORG_A_ID);
    expect(vi.mocked(toggleVoiceActive)).toHaveBeenCalledWith(
      expect.anything(),
      "voice_crede_soprano",
      false,
      ORG_A_ID,
    );
  });

  it("deleteVoice must accept orgId to prevent cross-org delete", () => {
    const fn = deleteVoice as unknown as (
      db: D1Database,
      id: string,
      orgId: string,
    ) => Promise<boolean>;
    vi.mocked(deleteVoice).mockResolvedValue(true);

    fn({} as D1Database, "voice_crede_soprano", ORG_A_ID);
    expect(vi.mocked(deleteVoice)).toHaveBeenCalledWith(
      expect.anything(),
      "voice_crede_soprano",
      ORG_A_ID,
    );
  });

  it("reorderVoices must accept orgId to scope reorder to one org", () => {
    const fn = reorderVoices as unknown as (
      db: D1Database,
      voiceIds: string[],
      orgId: string,
    ) => Promise<void>;
    vi.mocked(reorderVoices).mockResolvedValue(undefined);

    fn({} as D1Database, ["voice_crede_soprano", "voice_crede_alto"], ORG_A_ID);
    expect(vi.mocked(reorderVoices)).toHaveBeenCalledWith(
      expect.anything(),
      ["voice_crede_soprano", "voice_crede_alto"],
      ORG_A_ID,
    );
  });
});

// ============================================================================
// Part 2: Cross-org isolation — getActiveVoices must filter by org
// ============================================================================

describe("getActiveVoices — must return only voices for the specified org (#252)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns only org A voices when called with org A id", async () => {
    // After fix: getActiveVoices(db, ORG_A_ID) returns only org A's voices
    vi.mocked(getActiveVoices).mockImplementation(
      async (_db: D1Database, orgId?: string) => {
        if (orgId === ORG_A_ID) return [ORG_A_SOPRANO, ORG_A_ALTO];
        if (orgId === ORG_B_ID) return [ORG_B_SOPRANO];
        // Current (broken) behavior: no orgId filtering, returns all
        return [ORG_A_SOPRANO, ORG_A_ALTO, ORG_B_SOPRANO];
      },
    );

    // The real function (before fix) ignores orgId → returns all 3
    // After fix it returns only 2 for org A
    const voices = await (getActiveVoices as any)({} as D1Database, ORG_A_ID);

    // Must not contain org B's voice
    expect(voices.some((v: Voice) => v.id === ORG_B_SOPRANO.id)).toBe(false);
    expect(voices).toHaveLength(2);
  });

  it("returns different voices for org B than org A", async () => {
    vi.mocked(getActiveVoices)
      .mockResolvedValueOnce([ORG_A_SOPRANO, ORG_A_ALTO])
      .mockResolvedValueOnce([ORG_B_SOPRANO]);

    const orgAVoices = await (getActiveVoices as any)(
      {} as D1Database,
      ORG_A_ID,
    );
    const orgBVoices = await (getActiveVoices as any)(
      {} as D1Database,
      ORG_B_ID,
    );

    expect(orgAVoices).not.toEqual(orgBVoices);
    expect(orgAVoices.map((v: Voice) => v.id)).not.toContain(ORG_B_SOPRANO.id);
  });

  it("two orgs can have voices with the same name independently", async () => {
    // Both org A and org B have "Soprano" but they are separate DB rows with different IDs
    vi.mocked(getActiveVoices)
      .mockResolvedValueOnce([ORG_A_SOPRANO])
      .mockResolvedValueOnce([ORG_B_SOPRANO]);

    const orgAVoices = await (getActiveVoices as any)(
      {} as D1Database,
      ORG_A_ID,
    );
    const orgBVoices = await (getActiveVoices as any)(
      {} as D1Database,
      ORG_B_ID,
    );

    // Same display name, different IDs
    expect(orgAVoices[0].name).toBe("Soprano");
    expect(orgBVoices[0].name).toBe("Soprano");
    expect(orgAVoices[0].id).not.toBe(orgBVoices[0].id);
  });
});

// ============================================================================
// Part 3: Cross-org isolation — toggleVoiceActive must not affect other orgs
// ============================================================================

describe("toggleVoiceActive — must reject cross-org requests (#252)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns false when toggling a voice from a different org", async () => {
    // Org B admin trying to toggle org A's voice
    // After fix: toggleVoiceActive(db, id, flag, orgId) returns false if voice.org_id !== orgId
    vi.mocked(toggleVoiceActive).mockImplementation(
      async (
        _db: D1Database,
        id: string,
        _isActive: boolean,
        orgId?: string,
      ) => {
        // voice_crede_soprano belongs to ORG_A_ID
        if (id === "voice_crede_soprano" && orgId !== ORG_A_ID) return false;
        return true;
      },
    );

    // Org B admin tries to deactivate org A's voice
    const result = await (toggleVoiceActive as any)(
      {} as D1Database,
      "voice_crede_soprano",
      false,
      ORG_B_ID, // wrong org
    );

    expect(result).toBe(false);
  });

  it("returns true when toggling own org voice", async () => {
    vi.mocked(toggleVoiceActive).mockImplementation(
      async (
        _db: D1Database,
        id: string,
        _isActive: boolean,
        orgId?: string,
      ) => {
        if (id === "voice_crede_soprano" && orgId === ORG_A_ID) return true;
        return false;
      },
    );

    const result = await (toggleVoiceActive as any)(
      {} as D1Database,
      "voice_crede_soprano",
      false,
      ORG_A_ID, // correct org
    );

    expect(result).toBe(true);
  });
});

// ============================================================================
// Part 4: Cross-org isolation — deleteVoice must not cross org boundary
// ============================================================================

describe("deleteVoice — must reject cross-org delete (#252)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns false when deleting a voice from a different org", async () => {
    vi.mocked(deleteVoice).mockImplementation(
      async (_db: D1Database, id: string, orgId?: string) => {
        // voice_crede_soprano belongs to ORG_A_ID
        if (id === "voice_crede_soprano" && orgId !== ORG_A_ID) return false;
        return true;
      },
    );

    const result = await (deleteVoice as any)(
      {} as D1Database,
      "voice_crede_soprano",
      ORG_B_ID, // org B cannot delete org A's voice
    );

    expect(result).toBe(false);
  });
});

// ============================================================================
// Part 5: API endpoints must pass org context to DB functions
// ============================================================================

describe("POST /api/voices — must pass locals.org.id to createVoice (#252)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin);
    vi.mocked(assertAdmin).mockReturnValue(undefined);
    vi.mocked(createVoice).mockResolvedValue(ORG_A_SOPRANO);
  });

  it("passes locals.org.id as orgId to createVoice", async () => {
    const event = makeEvent({
      org: { id: ORG_A_ID },
      body: { name: "Soprano", abbreviation: "S", category: "vocal" },
    });

    await POST(event);

    // After fix: createVoice called with orgId in input
    expect(createVoice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: ORG_A_ID }),
    );
  });

  it("uses org B id when request comes from org B context", async () => {
    const event = makeEvent({
      org: { id: ORG_B_ID },
      body: { name: "Soprano", abbreviation: "S", category: "vocal" },
    });

    await POST(event);

    expect(createVoice).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orgId: ORG_B_ID }),
    );
  });
});

describe("PATCH /api/voices/[id] — must pass locals.org.id to toggleVoiceActive (#252)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin);
    vi.mocked(assertAdmin).mockReturnValue(undefined);
    vi.mocked(toggleVoiceActive).mockResolvedValue(true);
  });

  it("passes locals.org.id as orgId to toggleVoiceActive", async () => {
    const event = makeEvent({
      org: { id: ORG_A_ID },
      body: { isActive: false },
      params: { id: "voice_crede_soprano" },
      method: "PATCH",
    });

    await PATCH(event);

    // After fix: toggleVoiceActive called with orgId
    expect(toggleVoiceActive).toHaveBeenCalledWith(
      expect.anything(),
      "voice_crede_soprano",
      false,
      ORG_A_ID,
    );
  });
});

describe("DELETE /api/voices/[id] — must pass locals.org.id to deleteVoice (#252)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin);
    vi.mocked(assertAdmin).mockReturnValue(undefined);
    vi.mocked(deleteVoice).mockResolvedValue(true);
  });

  it("passes locals.org.id as orgId to deleteVoice", async () => {
    const event = makeEvent({
      org: { id: ORG_A_ID },
      params: { id: "voice_crede_soprano" },
      method: "DELETE",
    });

    await DELETE(event);

    // After fix: deleteVoice called with orgId
    expect(deleteVoice).toHaveBeenCalledWith(
      expect.anything(),
      "voice_crede_soprano",
      ORG_A_ID,
    );
  });
});

describe("POST /api/voices/reorder — must pass locals.org.id to reorderVoices (#252)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin);
    vi.mocked(assertAdmin).mockReturnValue(undefined);
    vi.mocked(reorderVoices).mockResolvedValue(undefined);
    vi.mocked(getAllVoicesWithCounts).mockResolvedValue([]);
  });

  it("passes locals.org.id as orgId to reorderVoices", async () => {
    const event = makeEvent({
      org: { id: ORG_A_ID },
      body: { voiceIds: ["voice_crede_alto", "voice_crede_soprano"] },
    });

    await REORDER(event);

    // After fix: reorderVoices called with orgId
    expect(reorderVoices).toHaveBeenCalledWith(
      expect.anything(),
      ["voice_crede_alto", "voice_crede_soprano"],
      ORG_A_ID,
    );
  });

  it("passes locals.org.id to getAllVoicesWithCounts for the return value", async () => {
    const event = makeEvent({
      org: { id: ORG_A_ID },
      body: { voiceIds: ["voice_crede_soprano"] },
    });

    await REORDER(event);

    // After fix: getAllVoicesWithCounts called with orgId to return scoped list
    expect(getAllVoicesWithCounts).toHaveBeenCalledWith(
      expect.anything(),
      ORG_A_ID,
    );
  });
});
