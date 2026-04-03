// Works API route tests
// Tests GET/POST /api/works and GET/PATCH/DELETE /api/works/[id]
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import type { Work } from "$lib/types";

// Mock the middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertLibrarian: vi.fn(),
}));

// Mock the DB functions
vi.mock("$lib/server/db/works", () => ({
  getAllWorks: vi.fn(),
  searchWorks: vi.fn(),
  createWork: vi.fn(),
  getWorkById: vi.fn(),
  updateWork: vi.fn(),
  deleteWork: vi.fn(),
}));

import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import {
  getAllWorks,
  searchWorks,
  createWork,
  getWorkById,
  updateWork,
  deleteWork,
} from "$lib/server/db/works";
import { GET, POST } from "../../../routes/api/works/+server";
import {
  GET as GET_ID,
  PATCH,
  DELETE,
} from "../../../routes/api/works/[id]/+server";

const mockGetAuthenticatedMember = getAuthenticatedMember as ReturnType<
  typeof vi.fn
>;
const mockAssertLibrarian = assertLibrarian as ReturnType<typeof vi.fn>;
const mockGetAllWorks = getAllWorks as ReturnType<typeof vi.fn>;
const mockSearchWorks = searchWorks as ReturnType<typeof vi.fn>;
const mockCreateWork = createWork as ReturnType<typeof vi.fn>;
const mockGetWorkById = getWorkById as ReturnType<typeof vi.fn>;
const mockUpdateWork = updateWork as ReturnType<typeof vi.fn>;
const mockDeleteWork = deleteWork as ReturnType<typeof vi.fn>;

const mockMember = {
  id: "member-1",
  name: "Test User",
  email_id: "test@example.com",
  roles: ["librarian"],
  voices: [],
  sections: [],
};

// Test org ID (matches DEFAULT_ORG_ID used in routes)
const TEST_ORG_ID = "org_crede_001";

// Mock org for locals
const mockOrg = {
  id: TEST_ORG_ID,
  name: "Crede",
  subdomain: "crede",
  type: "collective" as const,
  contactEmail: "test@example.com",
  createdAt: new Date().toISOString(),
};

const mockWork: Work = {
  id: "work-1",
  orgId: TEST_ORG_ID,
  title: "Test Work",
  composer: "Test Composer",
  lyricist: null,
  createdAt: new Date().toISOString(),
};

function createMockEvent(overrides: Partial<RequestEvent> = {}): RequestEvent {
  return {
    url: new URL("http://localhost/api/works"),
    params: {},
    platform: { env: { DB: {} } },
    locals: { org: mockOrg },
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
      serialize: vi.fn(),
    },
    request: new Request("http://localhost/api/works"),
    ...overrides,
  } as unknown as RequestEvent;
}

describe("Works API Routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
  });

  describe("GET /api/works", () => {
    it("returns list of works for authenticated member", async () => {
      const works = [
        mockWork,
        { ...mockWork, id: "work-2", title: "Another Work" },
      ];
      mockGetAllWorks.mockResolvedValue(works);

      const event = createMockEvent();
      const response = await GET(event);

      expect(mockGetAuthenticatedMember).toHaveBeenCalled();
      expect(mockGetAllWorks).toHaveBeenCalled();

      const data = (await response.json()) as Work[];
      expect(data).toHaveLength(2);
      expect(data[0].title).toBe("Test Work");
    });

    it("searches works when query parameter provided", async () => {
      const works = [mockWork];
      mockSearchWorks.mockResolvedValue(works);

      const event = createMockEvent({
        url: new URL("http://localhost/api/works?q=Test"),
      });
      const response = await GET(event);

      // searchWorks now takes (db, orgId, query)
      expect(mockSearchWorks).toHaveBeenCalledWith(
        expect.anything(),
        TEST_ORG_ID,
        "Test",
      );
      expect(mockGetAllWorks).not.toHaveBeenCalled();

      const data = await response.json();
      expect(data).toHaveLength(1);
    });

    it("ignores empty search query", async () => {
      mockGetAllWorks.mockResolvedValue([]);

      const event = createMockEvent({
        url: new URL("http://localhost/api/works?q="),
      });
      await GET(event);

      expect(mockGetAllWorks).toHaveBeenCalled();
      expect(mockSearchWorks).not.toHaveBeenCalled();
    });

    it("throws 500 if database not available", async () => {
      const event = createMockEvent({
        platform: undefined,
      });

      await expect(GET(event)).rejects.toThrow();
    });
  });

  describe("POST /api/works", () => {
    it("creates work with valid data", async () => {
      mockCreateWork.mockResolvedValue(mockWork);

      const event = createMockEvent({
        request: new Request("http://localhost/api/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "Test Work",
            composer: "Test Composer",
          }),
        }),
      });

      const response = await POST(event);

      expect(mockAssertLibrarian).toHaveBeenCalledWith(mockMember);
      expect(mockCreateWork).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: "Test Work",
          composer: "Test Composer",
        }),
      );
      expect(response.status).toBe(201);
    });

    it("requires title", async () => {
      const event = createMockEvent({
        request: new Request("http://localhost/api/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ composer: "No Title" }),
        }),
      });

      const response = await POST(event);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toContain("Title is required");
    });

    it("rejects empty title", async () => {
      const event = createMockEvent({
        request: new Request("http://localhost/api/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "   " }),
        }),
      });

      const response = await POST(event);

      expect(response.status).toBe(400);
    });

    it("trims title and optional fields", async () => {
      mockCreateWork.mockResolvedValue(mockWork);

      const event = createMockEvent({
        request: new Request("http://localhost/api/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: "  Padded Title  ",
            composer: "  Padded Composer  ",
            lyricist: "  Padded Lyricist  ",
          }),
        }),
      });

      await POST(event);

      expect(mockCreateWork).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          title: "Padded Title",
          composer: "Padded Composer",
          lyricist: "Padded Lyricist",
        }),
      );
    });

    it("requires librarian role", async () => {
      mockAssertLibrarian.mockImplementation(() => {
        throw new Error("Insufficient permissions");
      });

      const event = createMockEvent({
        request: new Request("http://localhost/api/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Test Work" }),
        }),
      });

      await expect(POST(event)).rejects.toThrow("Insufficient permissions");
    });
  });

  describe("GET /api/works/[id]", () => {
    it("returns work by ID", async () => {
      mockGetWorkById.mockResolvedValue(mockWork);

      const event = createMockEvent({
        params: { id: "work-1" },
      });

      const response = await GET_ID(event);

      expect(mockGetWorkById).toHaveBeenCalledWith(
        expect.anything(),
        "work-1",
        TEST_ORG_ID,
      );

      const data = (await response.json()) as Work;
      expect(data.id).toBe("work-1");
      expect(data.title).toBe("Test Work");
    });

    it("throws 404 for non-existent work", async () => {
      mockGetWorkById.mockResolvedValue(null);

      const event = createMockEvent({
        params: { id: "non-existent" },
      });

      await expect(GET_ID(event)).rejects.toThrow();
    });

    it("throws 400 if ID missing", async () => {
      const event = createMockEvent({
        params: {},
      });

      await expect(GET_ID(event)).rejects.toThrow();
    });
  });

  describe("PATCH /api/works/[id]", () => {
    it("updates work with valid data", async () => {
      const updatedWork = { ...mockWork, title: "Updated Title" };
      mockUpdateWork.mockResolvedValue(updatedWork);

      const event = createMockEvent({
        params: { id: "work-1" },
        request: new Request("http://localhost/api/works/work-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "Updated Title" }),
        }),
      });

      const response = await PATCH(event);

      expect(mockAssertLibrarian).toHaveBeenCalled();
      expect(mockUpdateWork).toHaveBeenCalledWith(
        expect.anything(),
        "work-1",
        expect.objectContaining({ title: "Updated Title" }),
        TEST_ORG_ID,
      );

      const data = (await response.json()) as Work;
      expect(data.title).toBe("Updated Title");
    });

    it("allows clearing composer with null", async () => {
      const updatedWork = { ...mockWork, composer: null };
      mockUpdateWork.mockResolvedValue(updatedWork);

      const event = createMockEvent({
        params: { id: "work-1" },
        request: new Request("http://localhost/api/works/work-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ composer: null }),
        }),
      });

      const response = await PATCH(event);

      expect(mockUpdateWork).toHaveBeenCalledWith(
        expect.anything(),
        "work-1",
        expect.objectContaining({ composer: null }),
        TEST_ORG_ID,
      );

      const data = (await response.json()) as Work;
      expect(data.composer).toBeNull();
    });

    it("rejects empty title", async () => {
      const event = createMockEvent({
        params: { id: "work-1" },
        request: new Request("http://localhost/api/works/work-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "" }),
        }),
      });

      const response = await PATCH(event);

      expect(response.status).toBe(400);
      expect(mockUpdateWork).not.toHaveBeenCalled();
    });

    it("throws 404 for non-existent work", async () => {
      mockUpdateWork.mockResolvedValue(null);

      const event = createMockEvent({
        params: { id: "non-existent" },
        request: new Request("http://localhost/api/works/non-existent", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "New Title" }),
        }),
      });

      await expect(PATCH(event)).rejects.toThrow();
    });
  });

  describe("DELETE /api/works/[id]", () => {
    it("deletes work", async () => {
      mockDeleteWork.mockResolvedValue(true);

      const event = createMockEvent({
        params: { id: "work-1" },
      });

      const response = await DELETE(event);

      expect(mockAssertLibrarian).toHaveBeenCalled();
      expect(mockDeleteWork).toHaveBeenCalledWith(
        expect.anything(),
        "work-1",
        TEST_ORG_ID,
      );
      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it("throws 404 for non-existent work", async () => {
      mockDeleteWork.mockResolvedValue(false);

      const event = createMockEvent({
        params: { id: "non-existent" },
      });

      await expect(DELETE(event)).rejects.toThrow();
    });

    it("requires librarian role", async () => {
      mockAssertLibrarian.mockImplementation(() => {
        throw new Error("Insufficient permissions");
      });

      const event = createMockEvent({
        params: { id: "work-1" },
      });

      await expect(DELETE(event)).rejects.toThrow("Insufficient permissions");
    });
  });
});
