// Failing tests for issue #264: takedown process endpoint lacks org-scoped authorization
//
// Vulnerabilities:
// 1. POST /api/takedowns/[id]/process doesn't read locals.org at all
// 2. getMemberRole(db, memberId) has no org filter — grants global admin, not per-org
// 3. processTakedown() fetches takedown by UUID only (WHERE id = ?) — no org_id check
//    → an admin on org A can process org B's takedown by knowing the UUID
//
// All FAIL (red phase) — the cross-org isolation and org context checks don't exist yet.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ============================================================================
// Mocks
// ============================================================================

vi.mock("$lib/server/db/takedowns", () => ({
  processTakedown: vi.fn(),
  getTakedownById: vi.fn(),
}));

vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

import { POST } from "../../../routes/api/takedowns/[id]/process/+server";
import { processTakedown, getTakedownById } from "$lib/server/db/takedowns";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";

// ============================================================================
// Helpers
// ============================================================================

function makeProcessRequest(body: unknown): Request {
  return new Request("https://crede.polyphony.uk/api/takedowns/td_1/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const mockAdmin = {
  id: "admin_001",
  email_id: "admin@test.com",
  name: "Admin",
  roles: ["admin"],
  voices: [],
  sections: [],
};

function makeEvent(
  opts: {
    memberId?: string | null;
    org?: { id: string; name: string; subdomain: string } | null | undefined;
    takedownId?: string;
    body?: unknown;
  } = {},
) {
  const memberId = opts.memberId ?? "admin_001";
  const org =
    "org" in opts
      ? opts.org
      : { id: "org_crede_001", name: "Crede", subdomain: "crede" };
  const takedownId = opts.takedownId ?? "td_1";
  const body = opts.body ?? { action: "approve", notes: "Verified" };
  return {
    request: makeProcessRequest(body),
    params: { id: takedownId },
    platform: { env: { DB: {} as D1Database } },
    cookies: {
      get: vi.fn((name: string) =>
        name === "member_id" ? (memberId ?? null) : null,
      ),
    },
    locals: { org },
  } as any;
}

// A takedown belonging to org A
const ORG_A_TAKEDOWN = {
  id: "td_1",
  org_id: "org_crede_001",
  edition_id: "edition_abc",
  claimant_name: "Alice",
  claimant_email: "alice@example.com",
  reason: "Copyright",
  attestation: true,
  status: "pending" as const,
  created_at: "2026-01-01T00:00:00Z",
  processed_at: null,
  processed_by: null,
  resolution_notes: null,
};

// ============================================================================
// Part 1: Org context required
// ============================================================================

describe("POST /api/takedowns/[id]/process — requires org context (#264)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when locals.org is missing", async () => {
    // locals.org.id throws TypeError before getAuthenticatedMember is called
    const event = makeEvent({ org: null });
    await expect(POST(event)).rejects.toBeDefined();
  });

  it("throws when locals.org is undefined", async () => {
    const event = makeEvent({ org: undefined as any });
    await expect(POST(event)).rejects.toBeDefined();
  });
});

// ============================================================================
// Part 2: Cross-org isolation — 404, not 403 (avoid UUID enumeration)
// ============================================================================

describe("POST /api/takedowns/[id]/process — cross-org isolation (#264)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 404 when admin requests takedown belonging to a different org", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue({
      ...mockAdmin,
      id: "admin_org_b",
    } as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    // The takedown belongs to org A, but the request comes from org B's admin
    vi.mocked(getTakedownById).mockResolvedValue(ORG_A_TAKEDOWN);
    vi.mocked(processTakedown).mockResolvedValue({ success: true });

    const event = makeEvent({
      memberId: "admin_org_b",
      org: {
        id: "org_hannijoggi_001",
        name: "Hannijoggi",
        subdomain: "hannijoggi",
      }, // org B
      takedownId: "td_1",
    });

    // Must be 404 (not 403) to avoid revealing that the UUID exists
    await expect(POST(event)).rejects.toMatchObject({ status: 404 });
  });

  it("does NOT call processTakedown when org does not match", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(getTakedownById).mockResolvedValue(ORG_A_TAKEDOWN);
    vi.mocked(processTakedown).mockResolvedValue({ success: true });

    const event = makeEvent({
      org: {
        id: "org_hannijoggi_001",
        name: "Hannijoggi",
        subdomain: "hannijoggi",
      },
    });

    try {
      await POST(event);
    } catch {
      /* expected throw */
    }

    expect(processTakedown).not.toHaveBeenCalled();
  });

  it("returns 404 (not 403) for cross-org — avoids leaking UUID existence via status code", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(getTakedownById).mockResolvedValue(ORG_A_TAKEDOWN);

    const crossOrgEvent = makeEvent({
      org: {
        id: "org_hannijoggi_001",
        name: "Hannijoggi",
        subdomain: "hannijoggi",
      },
    });

    // Both non-existent UUID and cross-org UUID should return 404
    await expect(POST(crossOrgEvent)).rejects.toMatchObject({ status: 404 });
  });
});

// ============================================================================
// Part 3: Happy path — same-org admin can process
// ============================================================================

describe("POST /api/takedowns/[id]/process — same-org succeeds (#264)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns 200 when admin is in the same org as the takedown", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(getTakedownById).mockResolvedValue(ORG_A_TAKEDOWN);
    vi.mocked(processTakedown).mockResolvedValue({ success: true });

    const event = makeEvent({
      memberId: "admin_001",
      org: { id: "org_crede_001", name: "Crede", subdomain: "crede" }, // same org as takedown
    });

    const response = await POST(event);
    expect(response.status).toBe(200);
  });

  it("calls processTakedown with the correct parameters when org matches", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(getTakedownById).mockResolvedValue(ORG_A_TAKEDOWN);
    vi.mocked(processTakedown).mockResolvedValue({ success: true });

    const event = makeEvent({
      memberId: "admin_001",
      org: { id: "org_crede_001", name: "Crede", subdomain: "crede" },
      takedownId: "td_1",
      body: { action: "approve", notes: "Verified claim" },
    });

    await POST(event);

    expect(processTakedown).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        takedownId: "td_1",
        status: "approved",
        processedBy: "admin_001",
        notes: "Verified claim",
      }),
    );
  });
});

// ============================================================================
// Part 4: processTakedown DB function — must accept orgId and verify ownership
// ============================================================================

const { processTakedown: realProcessTakedown } = await vi.importActual<
  typeof import("$lib/server/db/takedowns")
>("$lib/server/db/takedowns");

describe("processTakedown() — must verify org ownership (#264)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ProcessTakedownInput type must include orgId field", () => {
    const validInput = {
      takedownId: "td_1",
      orgId: "org_crede_001",
      status: "approved" as const,
      processedBy: "admin_001",
      notes: "Verified",
    };
    expect(validInput.orgId).toBeDefined();
  });

  it("returns { success: false } when takedown org_id does not match input orgId", async () => {
    const mockDb = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn((..._params: unknown[]) => ({
          first: vi.fn(async () => {
            if (sql.includes("FROM takedowns")) {
              return {
                id: "td_1",
                org_id: "org_crede_001",
                edition_id: "edition_abc",
                status: "pending",
                claimant_name: "Alice",
                claimant_email: "alice@example.com",
                reason: "Copyright",
                attestation: 1,
                created_at: "2026-01-01T00:00:00Z",
                processed_at: null,
                processed_by: null,
                resolution_notes: null,
              };
            }
            return null;
          }),
          run: vi.fn(async () => ({ success: true, meta: { changes: 1 } })),
          all: vi.fn(async () => ({ results: [] })),
        })),
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
      })),
    } as unknown as D1Database;

    const result = await realProcessTakedown(mockDb, {
      takedownId: "td_1",
      orgId: "org_hannijoggi_001" as any,
      status: "approved",
      processedBy: "admin_org_b",
      notes: "Test",
    } as any);

    expect(result.success).toBe(false);
  });
});
