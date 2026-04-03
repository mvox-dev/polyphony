// TDD: Tests for admin takedown API endpoints
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "../../../routes/api/takedowns/+server";
import { POST as PROCESS } from "../../../routes/api/takedowns/[id]/process/+server";

// Mock the takedowns module
vi.mock("$lib/server/db/takedowns", () => ({
  listTakedownRequests: vi.fn(),
  processTakedown: vi.fn(),
  getTakedownById: vi.fn(),
}));

// Mock the auth middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

import {
  listTakedownRequests,
  processTakedown,
  getTakedownById,
} from "$lib/server/db/takedowns";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";

function createMockRequest(
  url: string = "http://localhost/api/takedowns",
): Request {
  return new Request(url, { method: "GET" });
}

function createMockProcessRequest(body: unknown): Request {
  return new Request("http://localhost/api/takedowns/123/process", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createMockDb() {
  return {} as D1Database;
}

const TEST_ORG = { id: "org_crede_001", name: "Crede", subdomain: "crede" };

function createMockCookies(memberId: string | null = "admin-123") {
  return {
    get: vi.fn((name: string) => (name === "member_id" ? memberId : null)),
  };
}

const mockAdmin = {
  id: "admin-123",
  email_id: "admin@test.com",
  name: "Admin",
  roles: ["admin"],
  voices: [],
  sections: [],
};

describe("GET /api/takedowns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedMember).mockRejectedValue(
      Object.assign(new Error("Authentication required"), { status: 401 }),
    );

    await expect(
      GET({
        request: createMockRequest(),
        url: new URL("http://localhost/api/takedowns"),
        platform: { env: { DB: createMockDb() } },
        cookies: createMockCookies(null),
        locals: { org: TEST_ORG },
      } as unknown as Parameters<typeof GET>[0]),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("should return 403 when user is not admin", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue({
      ...mockAdmin,
      roles: ["librarian"],
    } as any);
    vi.mocked(assertAdmin).mockImplementation(() => {
      throw Object.assign(new Error("Admin or owner role required"), {
        status: 403,
      });
    });

    await expect(
      GET({
        request: createMockRequest(),
        url: new URL("http://localhost/api/takedowns"),
        platform: { env: { DB: createMockDb() } },
        cookies: createMockCookies("user-123"),
        locals: { org: TEST_ORG },
      } as unknown as Parameters<typeof GET>[0]),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("should return all takedowns for admin", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(listTakedownRequests).mockResolvedValue([
      {
        id: "takedown-1",
        edition_id: "edition-1",
        org_id: "org_crede_001",
        claimant_name: "Alice",
        claimant_email: "alice@example.com",
        reason: "Copyright violation",
        attestation: true,
        status: "pending",
        created_at: "2025-01-01T00:00:00Z",
        processed_at: null,
        processed_by: null,
        resolution_notes: null,
      },
    ]);

    const response = await GET({
      request: createMockRequest(),
      url: new URL("http://localhost/api/takedowns"),
      platform: { env: { DB: createMockDb() } },
      cookies: createMockCookies("admin-123"),
      locals: { org: TEST_ORG },
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    const data = (await response.json()) as {
      takedowns: Array<{ id: string }>;
    };
    expect(data.takedowns).toHaveLength(1);
    expect(data.takedowns[0].id).toBe("takedown-1");
  });

  it("should filter by status when provided", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(listTakedownRequests).mockResolvedValue([]);

    const response = await GET({
      request: createMockRequest(),
      url: new URL("http://localhost/api/takedowns?status=pending"),
      platform: { env: { DB: createMockDb() } },
      cookies: createMockCookies("admin-123"),
      locals: { org: TEST_ORG },
    } as unknown as Parameters<typeof GET>[0]);

    expect(response.status).toBe(200);
    expect(listTakedownRequests).toHaveBeenCalledWith(
      expect.anything(),
      "org_crede_001",
      "pending",
    );
  });
});

describe("POST /api/takedowns/[id]/process", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 401 when not authenticated", async () => {
    vi.mocked(getAuthenticatedMember).mockRejectedValue(
      Object.assign(new Error("Authentication required"), { status: 401 }),
    );

    await expect(
      PROCESS({
        request: createMockProcessRequest({ action: "approve" }),
        params: { id: "takedown-123" },
        platform: { env: { DB: createMockDb() } },
        cookies: createMockCookies(null),
        locals: { org: TEST_ORG },
      } as unknown as Parameters<typeof PROCESS>[0]),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("should return 403 when user is not admin", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue({
      ...mockAdmin,
      roles: ["librarian"],
    } as any);
    vi.mocked(assertAdmin).mockImplementation(() => {
      throw Object.assign(new Error("Admin or owner role required"), {
        status: 403,
      });
    });

    await expect(
      PROCESS({
        request: createMockProcessRequest({ action: "approve" }),
        params: { id: "takedown-123" },
        platform: { env: { DB: createMockDb() } },
        cookies: createMockCookies("user-123"),
        locals: { org: TEST_ORG },
      } as unknown as Parameters<typeof PROCESS>[0]),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("should approve takedown request", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(getTakedownById).mockResolvedValue({
      id: "takedown-123",
      org_id: "org_crede_001",
      edition_id: "ed-1",
      claimant_name: "A",
      claimant_email: "a@b.c",
      reason: "R",
      attestation: true,
      status: "pending",
      created_at: "",
      processed_at: null,
      processed_by: null,
      resolution_notes: null,
    });
    vi.mocked(processTakedown).mockResolvedValue({ success: true });

    const response = await PROCESS({
      request: createMockProcessRequest({
        action: "approve",
        notes: "Verified copyright claim",
      }),
      params: { id: "takedown-123" },
      platform: { env: { DB: createMockDb() } },
      cookies: createMockCookies("admin-123"),
      locals: { org: TEST_ORG },
    } as unknown as Parameters<typeof PROCESS>[0]);

    expect(response.status).toBe(200);
    expect(processTakedown).toHaveBeenCalledWith(expect.anything(), {
      takedownId: "takedown-123",
      orgId: "org_crede_001",
      status: "approved",
      processedBy: "admin-123",
      notes: "Verified copyright claim",
    });
  });

  it("should reject takedown request", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(getTakedownById).mockResolvedValue({
      id: "takedown-456",
      org_id: "org_crede_001",
      edition_id: "ed-1",
      claimant_name: "A",
      claimant_email: "a@b.c",
      reason: "R",
      attestation: true,
      status: "pending",
      created_at: "",
      processed_at: null,
      processed_by: null,
      resolution_notes: null,
    });
    vi.mocked(processTakedown).mockResolvedValue({ success: true });

    const response = await PROCESS({
      request: createMockProcessRequest({
        action: "reject",
        notes: "No valid claim",
      }),
      params: { id: "takedown-456" },
      platform: { env: { DB: createMockDb() } },
      cookies: createMockCookies("admin-123"),
      locals: { org: TEST_ORG },
    } as unknown as Parameters<typeof PROCESS>[0]);

    expect(response.status).toBe(200);
    expect(processTakedown).toHaveBeenCalledWith(expect.anything(), {
      takedownId: "takedown-456",
      orgId: "org_crede_001",
      status: "rejected",
      processedBy: "admin-123",
      notes: "No valid claim",
    });
  });

  it("should return 404 when takedown not found", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(getTakedownById).mockResolvedValue(null);

    await expect(
      PROCESS({
        request: createMockProcessRequest({ action: "approve" }),
        params: { id: "nonexistent" },
        platform: { env: { DB: createMockDb() } },
        cookies: createMockCookies("admin-123"),
        locals: { org: TEST_ORG },
      } as unknown as Parameters<typeof PROCESS>[0]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("should return 400 for invalid action", async () => {
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin as any);
    vi.mocked(assertAdmin).mockImplementation(() => {});
    vi.mocked(getTakedownById).mockResolvedValue({
      id: "takedown-123",
      org_id: "org_crede_001",
      edition_id: "ed-1",
      claimant_name: "A",
      claimant_email: "a@b.c",
      reason: "R",
      attestation: true,
      status: "pending",
      created_at: "",
      processed_at: null,
      processed_by: null,
      resolution_notes: null,
    });

    await expect(
      PROCESS({
        request: createMockProcessRequest({ action: "invalid" }),
        params: { id: "takedown-123" },
        platform: { env: { DB: createMockDb() } },
        cookies: createMockCookies("admin-123"),
        locals: { org: TEST_ORG },
      } as unknown as Parameters<typeof PROCESS>[0]),
    ).rejects.toMatchObject({ status: 400 });
  });
});
