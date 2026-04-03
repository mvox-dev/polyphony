// Editions API route tests
// Tests GET/POST /api/works/[id]/editions and GET/PATCH/DELETE /api/editions/[id]
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";
import type { Edition } from "$lib/types";

// Mock the middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertLibrarian: vi.fn(),
}));

// Mock the DB functions
vi.mock("$lib/server/db/editions", () => ({
  getEditionById: vi.fn(),
  updateEdition: vi.fn(),
  deleteEdition: vi.fn(),
  createEdition: vi.fn(),
  getEditionsByWorkId: vi.fn(),
}));

vi.mock("$lib/server/db/works", () => ({
  getWorkById: vi.fn(),
}));

import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import {
  getEditionById,
  updateEdition,
  deleteEdition,
  createEdition,
  getEditionsByWorkId,
} from "$lib/server/db/editions";
import { getWorkById } from "$lib/server/db/works";
import {
  GET as GET_EDITION,
  PATCH,
  DELETE,
} from "../../../routes/api/editions/[id]/+server";
import {
  GET as GET_EDITIONS,
  POST,
} from "../../../routes/api/works/[id]/editions/+server";

const mockGetAuthenticatedMember = getAuthenticatedMember as ReturnType<
  typeof vi.fn
>;
const mockAssertLibrarian = assertLibrarian as ReturnType<typeof vi.fn>;
const mockGetEditionById = getEditionById as ReturnType<typeof vi.fn>;
const mockUpdateEdition = updateEdition as ReturnType<typeof vi.fn>;
const mockDeleteEdition = deleteEdition as ReturnType<typeof vi.fn>;
const mockCreateEdition = createEdition as ReturnType<typeof vi.fn>;
const mockGetEditionsByWorkId = getEditionsByWorkId as ReturnType<typeof vi.fn>;
const mockGetWorkById = getWorkById as ReturnType<typeof vi.fn>;

const mockMember = {
  id: "member-1",
  name: "Test User",
  email_id: "test@example.com",
  roles: ["librarian"],
  voices: [],
  sections: [],
};

const mockEdition: Edition = {
  id: "edition-1",
  workId: "work-1",
  name: "Test Edition",
  arranger: "Test Arranger",
  publisher: "Test Publisher",
  voicing: "SATB",
  editionType: "vocal_score",
  licenseType: "public_domain",
  notes: null,
  externalUrl: null,
  fileKey: null,
  fileName: null,
  fileSize: null,
  fileUploadedAt: null,
  fileUploadedBy: null,
  createdAt: new Date().toISOString(),
};

const mockWork = {
  id: "work-1",
  title: "Test Work",
  composer: "Test Composer",
  lyricist: null,
  createdAt: new Date().toISOString(),
};

function createMockEvent(overrides: Partial<RequestEvent> = {}): RequestEvent {
  return {
    url: new URL("http://localhost/api/editions/edition-1"),
    params: {},
    platform: { env: { DB: {} } },
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
      serialize: vi.fn(),
    },
    request: new Request("http://localhost/api/editions/edition-1"),
    locals: { org: { id: createOrgId("test-org") } } as any,
    ...overrides,
  } as unknown as RequestEvent;
}

describe("Editions API Routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
  });

  describe("GET /api/editions/[id]", () => {
    it("returns edition by ID", async () => {
      mockGetEditionById.mockResolvedValue(mockEdition);

      const event = createMockEvent({
        params: { id: "edition-1" },
      });

      const response = await GET_EDITION(event);

      expect(mockGetEditionById).toHaveBeenCalledWith(
        expect.anything(),
        "edition-1",
        expect.anything(),
      );

      const data = (await response.json()) as Edition;
      expect(data.id).toBe("edition-1");
      expect(data.name).toBe("Test Edition");
    });

    it("throws 404 for non-existent edition", async () => {
      mockGetEditionById.mockResolvedValue(null);

      const event = createMockEvent({
        params: { id: "non-existent" },
      });

      await expect(GET_EDITION(event)).rejects.toThrow();
    });

    it("throws 400 if ID missing", async () => {
      const event = createMockEvent({
        params: {},
      });

      await expect(GET_EDITION(event)).rejects.toThrow();
    });

    it("requires authentication", async () => {
      mockGetAuthenticatedMember.mockRejectedValue(new Error("Unauthorized"));

      const event = createMockEvent({
        params: { id: "edition-1" },
      });

      await expect(GET_EDITION(event)).rejects.toThrow("Unauthorized");
    });
  });

  describe("PATCH /api/editions/[id]", () => {
    it("updates edition with valid data", async () => {
      const updatedEdition = { ...mockEdition, name: "Updated Edition" };
      mockUpdateEdition.mockResolvedValue(updatedEdition);

      const event = createMockEvent({
        params: { id: "edition-1" },
        request: new Request("http://localhost/api/editions/edition-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated Edition" }),
        }),
      });

      const response = await PATCH(event);

      expect(mockAssertLibrarian).toHaveBeenCalled();
      expect(mockUpdateEdition).toHaveBeenCalledWith(
        expect.anything(),
        "edition-1",
        expect.objectContaining({ name: "Updated Edition" }),
        expect.anything(),
      );

      const data = (await response.json()) as Edition;
      expect(data.name).toBe("Updated Edition");
    });

    it("rejects empty name", async () => {
      const event = createMockEvent({
        params: { id: "edition-1" },
        request: new Request("http://localhost/api/editions/edition-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "" }),
        }),
      });

      const response = await PATCH(event);

      expect(response.status).toBe(400);
      expect(mockUpdateEdition).not.toHaveBeenCalled();
    });

    it("rejects invalid edition type", async () => {
      const event = createMockEvent({
        params: { id: "edition-1" },
        request: new Request("http://localhost/api/editions/edition-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editionType: "invalid_type" }),
        }),
      });

      const response = await PATCH(event);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toContain("Invalid edition type");
    });

    it("rejects invalid license type", async () => {
      const event = createMockEvent({
        params: { id: "edition-1" },
        request: new Request("http://localhost/api/editions/edition-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ licenseType: "invalid_license" }),
        }),
      });

      const response = await PATCH(event);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toContain("Invalid license type");
    });

    it("allows clearing optional fields with null", async () => {
      const updatedEdition = { ...mockEdition, arranger: null };
      mockUpdateEdition.mockResolvedValue(updatedEdition);

      const event = createMockEvent({
        params: { id: "edition-1" },
        request: new Request("http://localhost/api/editions/edition-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arranger: null }),
        }),
      });

      const response = await PATCH(event);

      expect(mockUpdateEdition).toHaveBeenCalledWith(
        expect.anything(),
        "edition-1",
        expect.objectContaining({ arranger: null }),
        expect.anything(),
      );

      const data = (await response.json()) as Edition;
      expect(data.arranger).toBeNull();
    });

    it("throws 404 for non-existent edition", async () => {
      mockUpdateEdition.mockResolvedValue(null);

      const event = createMockEvent({
        params: { id: "non-existent" },
        request: new Request("http://localhost/api/editions/non-existent", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "New Name" }),
        }),
      });

      await expect(PATCH(event)).rejects.toThrow();
    });

    it("requires librarian role", async () => {
      mockAssertLibrarian.mockImplementation(() => {
        throw new Error("Insufficient permissions");
      });

      const event = createMockEvent({
        params: { id: "edition-1" },
        request: new Request("http://localhost/api/editions/edition-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Updated" }),
        }),
      });

      await expect(PATCH(event)).rejects.toThrow("Insufficient permissions");
    });
  });

  describe("DELETE /api/editions/[id]", () => {
    it("deletes edition", async () => {
      mockDeleteEdition.mockResolvedValue(true);

      const event = createMockEvent({
        params: { id: "edition-1" },
      });

      const response = await DELETE(event);

      expect(mockAssertLibrarian).toHaveBeenCalled();
      expect(mockDeleteEdition).toHaveBeenCalledWith(
        expect.anything(),
        "edition-1",
        expect.anything(),
      );
      expect(response.status).toBe(200);

      const data = (await response.json()) as { success: boolean };
      expect(data.success).toBe(true);
    });

    it("throws 404 for non-existent edition", async () => {
      mockDeleteEdition.mockResolvedValue(false);

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
        params: { id: "edition-1" },
      });

      await expect(DELETE(event)).rejects.toThrow("Insufficient permissions");
    });
  });

  describe("GET /api/works/[id]/editions", () => {
    it("returns editions for a work", async () => {
      mockGetWorkById.mockResolvedValue(mockWork);
      mockGetEditionsByWorkId.mockResolvedValue([mockEdition]);

      const event = createMockEvent({
        params: { id: "work-1" },
      });

      const response = await GET_EDITIONS(event);

      expect(mockGetWorkById).toHaveBeenCalledWith(
        expect.anything(),
        "work-1",
        expect.anything(),
      );
      expect(mockGetEditionsByWorkId).toHaveBeenCalledWith(
        expect.anything(),
        "work-1",
        expect.anything(),
      );

      const data = (await response.json()) as Edition[];
      expect(data).toHaveLength(1);
      expect(data[0].name).toBe("Test Edition");
    });

    it("throws 404 if work not found", async () => {
      mockGetWorkById.mockResolvedValue(null);

      const event = createMockEvent({
        params: { id: "non-existent" },
      });

      await expect(GET_EDITIONS(event)).rejects.toThrow();
    });

    it("returns empty array if work has no editions", async () => {
      mockGetWorkById.mockResolvedValue(mockWork);
      mockGetEditionsByWorkId.mockResolvedValue([]);

      const event = createMockEvent({
        params: { id: "work-1" },
      });

      const response = await GET_EDITIONS(event);

      const data = (await response.json()) as Edition[];
      expect(data).toHaveLength(0);
    });
  });

  describe("POST /api/works/[id]/editions", () => {
    it("creates edition with valid data", async () => {
      mockGetWorkById.mockResolvedValue(mockWork);
      mockCreateEdition.mockResolvedValue(mockEdition);

      const event = createMockEvent({
        params: { id: "work-1" },
        request: new Request("http://localhost/api/works/work-1/editions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "Test Edition",
            editionType: "vocal_score",
          }),
        }),
      });

      const response = await POST(event);

      expect(mockAssertLibrarian).toHaveBeenCalled();
      expect(mockCreateEdition).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          workId: "work-1",
          name: "Test Edition",
        }),
      );
      expect(response.status).toBe(201);
    });

    it("requires name", async () => {
      mockGetWorkById.mockResolvedValue(mockWork);

      const event = createMockEvent({
        params: { id: "work-1" },
        request: new Request("http://localhost/api/works/work-1/editions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ editionType: "vocal_score" }),
        }),
      });

      const response = await POST(event);

      expect(response.status).toBe(400);
      const data = (await response.json()) as { error: string };
      expect(data.error).toContain("Name is required");
    });

    it("rejects invalid edition type", async () => {
      mockGetWorkById.mockResolvedValue(mockWork);

      const event = createMockEvent({
        params: { id: "work-1" },
        request: new Request("http://localhost/api/works/work-1/editions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test", editionType: "invalid" }),
        }),
      });

      const response = await POST(event);

      expect(response.status).toBe(400);
    });

    it("throws 404 if work not found", async () => {
      mockGetWorkById.mockResolvedValue(null);

      const event = createMockEvent({
        params: { id: "non-existent" },
        request: new Request(
          "http://localhost/api/works/non-existent/editions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name: "Test Edition" }),
          },
        ),
      });

      await expect(POST(event)).rejects.toThrow();
    });

    it("requires librarian role", async () => {
      mockGetWorkById.mockResolvedValue(mockWork);
      mockAssertLibrarian.mockImplementation(() => {
        throw new Error("Insufficient permissions");
      });

      const event = createMockEvent({
        params: { id: "work-1" },
        request: new Request("http://localhost/api/works/work-1/editions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Test Edition" }),
        }),
      });

      await expect(POST(event)).rejects.toThrow("Insufficient permissions");
    });

    it("trims name and optional fields", async () => {
      mockGetWorkById.mockResolvedValue(mockWork);
      mockCreateEdition.mockResolvedValue(mockEdition);

      const event = createMockEvent({
        params: { id: "work-1" },
        request: new Request("http://localhost/api/works/work-1/editions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "  Padded Name  ",
            arranger: "  Padded Arranger  ",
          }),
        }),
      });

      await POST(event);

      expect(mockCreateEdition).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          name: "Padded Name",
          arranger: "Padded Arranger",
        }),
      );
    });
  });
});
