// Physical copies API tests
// Tests for /api/editions/[id]/copies and /api/copies/[id] endpoints
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";
import type { PhysicalCopy, CopyStats } from "$lib/types";

// Response type helpers
interface CopyWithStats {
  copies: PhysicalCopy[];
  stats: CopyStats;
}

interface ErrorResponse {
  error: string;
}

interface SuccessResponse {
  success: boolean;
}

// Mock the auth middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertLibrarian: vi.fn(),
}));

// Mock the editions DB functions
vi.mock("$lib/server/db/editions", () => ({
  getEditionById: vi.fn(),
}));

// Mock the physical copies DB functions
vi.mock("$lib/server/db/physical-copies", () => ({
  getPhysicalCopiesByEdition: vi.fn(),
  createPhysicalCopy: vi.fn(),
  batchCreatePhysicalCopies: vi.fn(),
  getCopyStats: vi.fn(),
  getPhysicalCopyById: vi.fn(),
  updatePhysicalCopy: vi.fn(),
  deletePhysicalCopy: vi.fn(),
}));

import {
  GET as getCopies,
  POST as createCopies,
} from "../../../../routes/api/editions/[id]/copies/+server";
import {
  GET as getCopy,
  PATCH as updateCopy,
  DELETE as deleteCopy,
} from "../../../../routes/api/copies/[id]/+server";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import { getEditionById } from "$lib/server/db/editions";
import {
  getPhysicalCopiesByEdition,
  createPhysicalCopy,
  batchCreatePhysicalCopies,
  getCopyStats,
  getPhysicalCopyById,
  updatePhysicalCopy,
  deletePhysicalCopy,
} from "$lib/server/db/physical-copies";

const mockGetAuthenticatedMember = vi.mocked(getAuthenticatedMember);
const mockAssertLibrarian = vi.mocked(assertLibrarian);
const mockGetEditionById = vi.mocked(getEditionById);
const mockGetPhysicalCopiesByEdition = vi.mocked(getPhysicalCopiesByEdition);
const mockCreatePhysicalCopy = vi.mocked(createPhysicalCopy);
const mockBatchCreatePhysicalCopies = vi.mocked(batchCreatePhysicalCopies);
const mockGetCopyStats = vi.mocked(getCopyStats);
const mockGetPhysicalCopyById = vi.mocked(getPhysicalCopyById);
const mockUpdatePhysicalCopy = vi.mocked(updatePhysicalCopy);
const mockDeletePhysicalCopy = vi.mocked(deletePhysicalCopy);

// Mock member
const mockMember = {
  id: "member-1",
  name: "Test User",
  nickname: null,
  email_id: "test@example.com",
  email_contact: null,
  roles: ["librarian" as const],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2026-01-01T00:00:00Z",
};

// Mock edition
const mockEdition = {
  id: "edition-1",
  workId: "work-1",
  name: "Test Edition",
  arranger: null,
  publisher: null,
  voicing: null,
  editionType: "vocal_score" as const,
  licenseType: "owned" as const,
  notes: null,
  externalUrl: null,
  fileKey: null,
  fileName: null,
  fileSize: null,
  fileUploadedAt: null,
  fileUploadedBy: null,
  createdAt: "2026-01-01T00:00:00Z",
  sectionIds: [],
};

// Mock copy
const mockCopy = {
  id: "copy-1",
  editionId: "edition-1",
  copyNumber: "01",
  condition: "good" as const,
  acquiredAt: null,
  notes: null,
  createdAt: "2026-01-01T00:00:00Z",
};

// Helper to create mock request event
function createMockEvent(overrides: Partial<RequestEvent> = {}): RequestEvent {
  return {
    params: { id: "edition-1" },
    platform: { env: { DB: {} as D1Database } },
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
      serialize: vi.fn(),
    },
    request: new Request("http://localhost/api/editions/edition-1/copies"),
    url: new URL("http://localhost/api/editions/edition-1/copies"),
    locals: { org: { id: createOrgId("test-org") } } as any,
    ...overrides,
  } as unknown as RequestEvent;
}

describe("Edition Copies API - /api/editions/[id]/copies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
    mockAssertLibrarian.mockImplementation(() => {});
    mockGetEditionById.mockResolvedValue(mockEdition);
    mockGetCopyStats.mockResolvedValue({
      total: 0,
      good: 0,
      fair: 0,
      poor: 0,
      lost: 0,
    });
  });

  describe("GET /api/editions/[id]/copies", () => {
    it("returns empty array when no copies", async () => {
      mockGetPhysicalCopiesByEdition.mockResolvedValue([]);

      const event = createMockEvent();
      const response = await getCopies(event);
      const data = (await response.json()) as PhysicalCopy[];

      expect(data).toEqual([]);
    });

    it("returns all copies for edition", async () => {
      mockGetPhysicalCopiesByEdition.mockResolvedValue([mockCopy]);

      const event = createMockEvent();
      const response = await getCopies(event);
      const data = (await response.json()) as PhysicalCopy[];

      expect(data).toHaveLength(1);
      expect(data[0].copyNumber).toBe("01");
    });

    it("includes stats when requested", async () => {
      mockGetPhysicalCopiesByEdition.mockResolvedValue([mockCopy]);
      mockGetCopyStats.mockResolvedValue({
        total: 1,
        good: 1,
        fair: 0,
        poor: 0,
        lost: 0,
      });

      const event = createMockEvent({
        url: new URL(
          "http://localhost/api/editions/edition-1/copies?stats=true",
        ),
      });
      const response = await getCopies(event);
      const data = (await response.json()) as CopyWithStats;

      expect(data.copies).toHaveLength(1);
      expect(data.stats.total).toBe(1);
    });

    it("returns 404 when edition not found", async () => {
      mockGetEditionById.mockResolvedValue(null);

      const event = createMockEvent();

      await expect(getCopies(event)).rejects.toThrow();
    });

    it("requires authentication", async () => {
      mockGetAuthenticatedMember.mockRejectedValue(new Error("Unauthorized"));

      const event = createMockEvent();

      await expect(getCopies(event)).rejects.toThrow();
    });
  });

  describe("POST /api/editions/[id]/copies - Single copy", () => {
    it("creates a single copy", async () => {
      mockCreatePhysicalCopy.mockResolvedValue(mockCopy);

      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ copyNumber: "01" }),
        }),
      });

      const response = await createCopies(event);
      const data = (await response.json()) as PhysicalCopy;

      expect(response.status).toBe(201);
      expect(data.copyNumber).toBe("01");
    });

    it("creates a copy with all fields", async () => {
      const fullCopy = {
        ...mockCopy,
        condition: "fair" as const,
        notes: "Test notes",
      };
      mockCreatePhysicalCopy.mockResolvedValue(fullCopy);

      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            copyNumber: "01",
            condition: "fair",
            acquiredAt: "2025-06-15",
            notes: "Test notes",
          }),
        }),
      });

      const response = await createCopies(event);

      expect(response.status).toBe(201);
    });

    it("returns 400 for empty copy number", async () => {
      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ copyNumber: "" }),
        }),
      });

      const response = await createCopies(event);

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toContain("required");
    });

    it("returns 400 for invalid condition", async () => {
      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ copyNumber: "01", condition: "invalid" }),
        }),
      });

      const response = await createCopies(event);

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toContain("condition");
    });

    it("returns 400 for invalid date format", async () => {
      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            copyNumber: "01",
            acquiredAt: "June 15, 2025",
          }),
        }),
      });

      const response = await createCopies(event);

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toContain("YYYY-MM-DD");
    });

    it("requires librarian role", async () => {
      mockAssertLibrarian.mockImplementation(() => {
        throw new Error("Forbidden");
      });

      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ copyNumber: "01" }),
        }),
      });

      await expect(createCopies(event)).rejects.toThrow();
    });
  });

  describe("POST /api/editions/[id]/copies - Batch creation", () => {
    it("creates multiple copies", async () => {
      const copies = [
        { ...mockCopy, id: "c1", copyNumber: "01" },
        { ...mockCopy, id: "c2", copyNumber: "02" },
        { ...mockCopy, id: "c3", copyNumber: "03" },
      ];
      mockBatchCreatePhysicalCopies.mockResolvedValue(copies);
      mockGetCopyStats.mockResolvedValue({
        total: 3,
        good: 3,
        fair: 0,
        poor: 0,
        lost: 0,
      });

      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 3 }),
        }),
      });

      const response = await createCopies(event);
      const data = (await response.json()) as CopyWithStats;

      expect(response.status).toBe(201);
      expect(data.copies).toHaveLength(3);
      expect(data.stats.total).toBe(3);
    });

    it("creates copies with prefix", async () => {
      mockBatchCreatePhysicalCopies.mockResolvedValue([]);
      mockGetCopyStats.mockResolvedValue({
        total: 2,
        good: 2,
        fair: 0,
        poor: 0,
        lost: 0,
      });

      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 2, prefix: "M" }),
        }),
      });

      const response = await createCopies(event);

      expect(response.status).toBe(201);
      expect(mockBatchCreatePhysicalCopies).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ prefix: "M" }),
        expect.anything(),
      );
    });

    it("returns 400 for zero count", async () => {
      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 0 }),
        }),
      });

      const response = await createCopies(event);

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toContain("positive");
    });

    it("returns 400 for count over 100", async () => {
      const event = createMockEvent({
        request: new Request("http://localhost/api/editions/edition-1/copies", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ count: 150 }),
        }),
      });

      const response = await createCopies(event);

      expect(response.status).toBe(400);
      const data = (await response.json()) as ErrorResponse;
      expect(data.error).toContain("100");
    });
  });
});

describe("Copy API - /api/copies/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
    mockAssertLibrarian.mockImplementation(() => {});
    mockGetPhysicalCopyById.mockResolvedValue(mockCopy);
  });

  describe("GET /api/copies/[id]", () => {
    it("returns copy when found", async () => {
      const event = createMockEvent({
        params: { id: "copy-1" },
        url: new URL("http://localhost/api/copies/copy-1"),
        route: { id: "/api/copies/[id]" },
      });

      const response = await getCopy(event);
      const data = (await response.json()) as PhysicalCopy;

      expect(data.id).toBe("copy-1");
      expect(data.copyNumber).toBe("01");
    });

    it("returns 404 when copy not found", async () => {
      mockGetPhysicalCopyById.mockResolvedValue(null);

      const event = createMockEvent({
        params: { id: "nonexistent" },
      });

      await expect(getCopy(event)).rejects.toThrow();
    });
  });

  describe("PATCH /api/copies/[id]", () => {
    it("updates condition", async () => {
      const updatedCopy = { ...mockCopy, condition: "poor" as const };
      mockUpdatePhysicalCopy.mockResolvedValue(updatedCopy);

      const event = createMockEvent({
        params: { id: "copy-1" },
        request: new Request("http://localhost/api/copies/copy-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ condition: "poor" }),
        }),
      });

      const response = await updateCopy(event);
      const data = (await response.json()) as PhysicalCopy;

      expect(data.condition).toBe("poor");
    });

    it("updates notes", async () => {
      const updatedCopy = { ...mockCopy, notes: "New binding" };
      mockUpdatePhysicalCopy.mockResolvedValue(updatedCopy);

      const event = createMockEvent({
        params: { id: "copy-1" },
        request: new Request("http://localhost/api/copies/copy-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "New binding" }),
        }),
      });

      const response = await updateCopy(event);
      const data = (await response.json()) as PhysicalCopy;

      expect(data.notes).toBe("New binding");
    });

    it("clears notes with null", async () => {
      const updatedCopy = { ...mockCopy, notes: null };
      mockUpdatePhysicalCopy.mockResolvedValue(updatedCopy);

      const event = createMockEvent({
        params: { id: "copy-1" },
        request: new Request("http://localhost/api/copies/copy-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: null }),
        }),
      });

      const response = await updateCopy(event);
      const data = (await response.json()) as PhysicalCopy;

      expect(data.notes).toBeNull();
    });

    it("returns 400 for invalid condition", async () => {
      const event = createMockEvent({
        params: { id: "copy-1" },
        request: new Request("http://localhost/api/copies/copy-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ condition: "invalid" }),
        }),
      });

      const response = await updateCopy(event);

      expect(response.status).toBe(400);
    });

    it("returns 404 when copy not found", async () => {
      mockGetPhysicalCopyById.mockResolvedValue(null);

      const event = createMockEvent({
        params: { id: "nonexistent" },
        request: new Request("http://localhost/api/copies/nonexistent", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ condition: "fair" }),
        }),
      });

      await expect(updateCopy(event)).rejects.toThrow();
    });

    it("requires librarian role", async () => {
      mockAssertLibrarian.mockImplementation(() => {
        throw new Error("Forbidden");
      });

      const event = createMockEvent({
        params: { id: "copy-1" },
        request: new Request("http://localhost/api/copies/copy-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ condition: "fair" }),
        }),
      });

      await expect(updateCopy(event)).rejects.toThrow();
    });
  });

  describe("DELETE /api/copies/[id]", () => {
    it("deletes copy", async () => {
      mockDeletePhysicalCopy.mockResolvedValue(true);

      const event = createMockEvent({
        params: { id: "copy-1" },
        request: new Request("http://localhost/api/copies/copy-1", {
          method: "DELETE",
        }),
      });

      const response = await deleteCopy(event);
      const data = (await response.json()) as SuccessResponse;

      expect(data.success).toBe(true);
    });

    it("returns 404 when copy not found", async () => {
      mockDeletePhysicalCopy.mockResolvedValue(false);

      const event = createMockEvent({
        params: { id: "nonexistent" },
        request: new Request("http://localhost/api/copies/nonexistent", {
          method: "DELETE",
        }),
      });

      await expect(deleteCopy(event)).rejects.toThrow();
    });

    it("requires librarian role", async () => {
      mockAssertLibrarian.mockImplementation(() => {
        throw new Error("Forbidden");
      });

      const event = createMockEvent({
        params: { id: "copy-1" },
        request: new Request("http://localhost/api/copies/copy-1", {
          method: "DELETE",
        }),
      });

      await expect(deleteCopy(event)).rejects.toThrow();
    });
  });
});
