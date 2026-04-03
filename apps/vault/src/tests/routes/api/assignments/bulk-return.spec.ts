// Bulk return API tests
// Issue #126 - Collection Reminders
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import { POST } from "../../../../routes/api/assignments/bulk-return/+server";

// Mock modules
vi.mock("$lib/server/db/members", () => ({
  getMemberById: vi.fn(),
}));

vi.mock("$lib/server/auth/permissions", () => ({
  canUploadScores: vi.fn(),
}));

vi.mock("$lib/server/db/inventory-reports", () => ({
  bulkReturnCopies: vi.fn(),
}));

import { getMemberById } from "$lib/server/db/members";
import { canUploadScores } from "$lib/server/auth/permissions";
import { bulkReturnCopies } from "$lib/server/db/inventory-reports";

const mockGetMemberById = vi.mocked(getMemberById);
const mockCanUploadScores = vi.mocked(canUploadScores);
const mockBulkReturnCopies = vi.mocked(bulkReturnCopies);

interface BulkReturnResponse {
  returned: number;
}

interface ErrorResponse {
  error: string;
}

const mockMember = {
  id: "librarian-1",
  name: "Librarian User",
  nickname: null,
  email_id: "librarian@example.com",
  email_contact: null,
  roles: ["librarian"] as (
    | "owner"
    | "admin"
    | "librarian"
    | "conductor"
    | "section_leader"
  )[],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2026-01-01T00:00:00.000Z",
};

function createMockEvent(
  memberId: string | undefined,
  body: unknown,
  jsonError = false,
) {
  const mockDb = {};
  return {
    params: {},
    url: new URL("http://localhost/api/assignments/bulk-return"),
    request: {
      json: jsonError
        ? vi.fn().mockRejectedValue(new Error("Invalid JSON"))
        : vi.fn().mockResolvedValue(body),
    } as unknown as Request,
    cookies: {
      get: vi.fn().mockReturnValue(memberId),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
      serialize: vi.fn(),
    },
    platform: { env: { DB: mockDb } },
    locals: { org: { id: createOrgId("test-org") } } as any,
    fetch: vi.fn(),
    getClientAddress: vi.fn().mockReturnValue("127.0.0.1"),
    route: { id: "/api/assignments/bulk-return" as const },
    setHeaders: vi.fn(),
    isDataRequest: false,
    isSubRequest: false,
    tracing: {},
    isRemoteRequest: false,
  } as unknown as Parameters<typeof POST>[0];
}

describe("POST /api/assignments/bulk-return", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when not authenticated", async () => {
    const event = createMockEvent(undefined, { assignmentIds: ["a"] });

    const response = await POST(event);

    expect(response.status).toBe(401);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 when not librarian", async () => {
    mockGetMemberById.mockResolvedValue({ ...mockMember, roles: [] });
    mockCanUploadScores.mockReturnValue(false);

    const event = createMockEvent("member-1", { assignmentIds: ["a"] });

    const response = await POST(event);

    expect(response.status).toBe(403);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Permission denied");
  });

  it("returns 400 for invalid JSON", async () => {
    mockGetMemberById.mockResolvedValue(mockMember);
    mockCanUploadScores.mockReturnValue(true);

    const event = createMockEvent("librarian-1", {}, true);

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("Invalid JSON");
  });

  it("returns 400 when assignmentIds is not an array", async () => {
    mockGetMemberById.mockResolvedValue(mockMember);
    mockCanUploadScores.mockReturnValue(true);

    const event = createMockEvent("librarian-1", {
      assignmentIds: "not-an-array",
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("assignmentIds must be an array");
  });

  it("returns 400 when assignmentIds contains non-strings", async () => {
    mockGetMemberById.mockResolvedValue(mockMember);
    mockCanUploadScores.mockReturnValue(true);

    const event = createMockEvent("librarian-1", {
      assignmentIds: ["a", 123, "b"],
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as ErrorResponse;
    expect(data.error).toBe("All assignment IDs must be strings");
  });

  it("calls bulkReturnCopies and returns count", async () => {
    mockGetMemberById.mockResolvedValue(mockMember);
    mockCanUploadScores.mockReturnValue(true);
    mockBulkReturnCopies.mockResolvedValue(3);

    const event = createMockEvent("librarian-1", {
      assignmentIds: ["a", "b", "c"],
    });

    const response = await POST(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as BulkReturnResponse;
    expect(data.returned).toBe(3);
    expect(mockBulkReturnCopies).toHaveBeenCalledWith({}, ["a", "b", "c"]);
  });

  it("handles empty array", async () => {
    mockGetMemberById.mockResolvedValue(mockMember);
    mockCanUploadScores.mockReturnValue(true);
    mockBulkReturnCopies.mockResolvedValue(0);

    const event = createMockEvent("librarian-1", { assignmentIds: [] });

    const response = await POST(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as BulkReturnResponse;
    expect(data.returned).toBe(0);
  });
});
