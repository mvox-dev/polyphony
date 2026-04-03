// Edition file upload/download API tests
// Tests for /api/editions/[id]/file endpoints
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";

// Mock the auth middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertLibrarian: vi.fn(),
}));

// Mock the editions DB functions
vi.mock("$lib/server/db/editions", () => ({
  getEditionById: vi.fn(),
  updateEditionFile: vi.fn(),
  removeEditionFile: vi.fn(),
}));

// Mock the chunked storage
vi.mock("$lib/server/storage/edition-storage", () => ({
  uploadEditionFile: vi.fn(),
  getEditionFile: vi.fn(),
  deleteEditionFile: vi.fn(),
}));

import {
  GET,
  POST,
  DELETE,
} from "../../../../routes/api/editions/[id]/file/+server";
import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import {
  getEditionById,
  updateEditionFile,
  removeEditionFile,
} from "$lib/server/db/editions";
import {
  uploadEditionFile,
  getEditionFile,
  deleteEditionFile,
} from "$lib/server/storage/edition-storage";

const mockGetAuthenticatedMember = vi.mocked(getAuthenticatedMember);
const mockAssertLibrarian = vi.mocked(assertLibrarian);
const mockGetEditionById = vi.mocked(getEditionById);
const mockUpdateEditionFile = vi.mocked(updateEditionFile);
const mockRemoveEditionFile = vi.mocked(removeEditionFile);
const mockUploadEditionFile = vi.mocked(uploadEditionFile);
const mockGetEditionFile = vi.mocked(getEditionFile);
const mockDeleteEditionFile = vi.mocked(deleteEditionFile);

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
  fileKey: "edition-edition-1",
  fileName: "test.pdf",
  fileSize: 1024,
  fileUploadedAt: "2026-01-01T00:00:00Z",
  fileUploadedBy: "member-1",
  createdAt: "2026-01-01T00:00:00Z",
  sectionIds: [],
};

// Helper to create mock request event
function createMockEvent(overrides: Partial<RequestEvent> = {}): RequestEvent {
  const requestUrl = "http://localhost/api/editions/edition-1/file";
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
    request: new Request(requestUrl),
    url: new URL(requestUrl),
    locals: { org: { id: createOrgId("test-org") } } as any,
    ...overrides,
  } as unknown as RequestEvent;
}

// Helper to create mock file
function createMockFile(
  name = "test.pdf",
  type = "application/pdf",
  size = 1024,
): File {
  const content = new ArrayBuffer(size);
  return new File([content], name, { type });
}

describe("GET /api/editions/[id]/file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
  });

  it("returns PDF file with correct headers", async () => {
    const fileData = new ArrayBuffer(1024);
    mockGetEditionById.mockResolvedValue(mockEdition);
    mockGetEditionFile.mockResolvedValue({
      editionId: "edition-1",
      data: fileData,
      size: 1024,
      originalName: "test.pdf",
      uploadedAt: "2026-01-01T00:00:00Z",
    });

    const event = createMockEvent();
    const response = await GET(event);

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toBe(
      'inline; filename="test.pdf"',
    );
    expect(response.headers.get("Content-Length")).toBe("1024");
  });

  it("returns 404 when edition not found", async () => {
    mockGetEditionById.mockResolvedValue(null);

    const event = createMockEvent();

    await expect(GET(event)).rejects.toMatchObject({
      status: 404,
      body: { message: "Edition not found" },
    });
  });

  it("returns 404 when edition has no file attached", async () => {
    mockGetEditionById.mockResolvedValue({ ...mockEdition, fileKey: null });

    const event = createMockEvent();

    await expect(GET(event)).rejects.toMatchObject({
      status: 404,
      body: { message: "No file attached to this edition" },
    });
  });

  it("returns 404 when file not found in storage", async () => {
    mockGetEditionById.mockResolvedValue(mockEdition);
    mockGetEditionFile.mockResolvedValue(null);

    const event = createMockEvent();

    await expect(GET(event)).rejects.toMatchObject({
      status: 404,
      body: { message: "File not found in storage" },
    });
  });

  it("requires authentication", async () => {
    mockGetAuthenticatedMember.mockRejectedValue({ status: 401 });

    const event = createMockEvent();

    await expect(GET(event)).rejects.toMatchObject({ status: 401 });
  });
});

describe("POST /api/editions/[id]/file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
    mockAssertLibrarian.mockImplementation(() => {});
  });

  it("uploads PDF file successfully", async () => {
    const editionWithoutFile = { ...mockEdition, fileKey: null };
    mockGetEditionById.mockResolvedValue(editionWithoutFile);
    mockUploadEditionFile.mockResolvedValue({
      editionId: "edition-1",
      size: 1024,
      originalName: "test.pdf",
      isChunked: false,
    });
    mockUpdateEditionFile.mockResolvedValue(mockEdition);

    const formData = new FormData();
    formData.append("file", createMockFile());

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "POST",
        body: formData,
      }),
    });

    const response = await POST(event);
    const data = (await response.json()) as { id: string };

    expect(response.status).toBe(200);
    expect(data.id).toBe("edition-1");
    expect(mockUploadEditionFile).toHaveBeenCalledWith(
      expect.anything(),
      "edition-1",
      expect.any(File),
    );
    expect(mockUpdateEditionFile).toHaveBeenCalledWith(
      expect.anything(),
      "edition-1",
      expect.objectContaining({
        fileKey: "edition-1",
        fileName: "test.pdf",
        fileSize: 1024,
        uploadedBy: "member-1",
      }),
      expect.anything(),
    );
  });

  it("replaces existing file", async () => {
    mockGetEditionById.mockResolvedValue(mockEdition);
    mockDeleteEditionFile.mockResolvedValue(true);
    mockUploadEditionFile.mockResolvedValue({
      editionId: "edition-1",
      size: 2048,
      originalName: "new.pdf",
      isChunked: false,
    });
    mockUpdateEditionFile.mockResolvedValue({ ...mockEdition, fileSize: 2048 });

    const formData = new FormData();
    formData.append("file", createMockFile("new.pdf", "application/pdf", 2048));

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "POST",
        body: formData,
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(200);
    expect(mockDeleteEditionFile).toHaveBeenCalledWith(
      expect.anything(),
      "edition-1",
    );
  });

  it("returns 400 when no file provided", async () => {
    mockGetEditionById.mockResolvedValue(mockEdition);

    const formData = new FormData();

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "POST",
        body: formData,
      }),
    });

    await expect(POST(event)).rejects.toMatchObject({
      status: 400,
      body: { message: "No file provided" },
    });
  });

  it("returns 400 for non-PDF files", async () => {
    mockGetEditionById.mockResolvedValue(mockEdition);

    const formData = new FormData();
    formData.append("file", createMockFile("test.txt", "text/plain"));

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "POST",
        body: formData,
      }),
    });

    await expect(POST(event)).rejects.toMatchObject({
      status: 400,
      body: { message: "Only PDF files are allowed" },
    });
  });

  it("requires librarian role", async () => {
    mockAssertLibrarian.mockImplementation(() => {
      throw { status: 403, body: { message: "Insufficient permissions" } };
    });

    const formData = new FormData();
    formData.append("file", createMockFile());

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "POST",
        body: formData,
      }),
    });

    await expect(POST(event)).rejects.toMatchObject({ status: 403 });
  });

  it("returns 404 when edition not found", async () => {
    mockGetEditionById.mockResolvedValue(null);

    const formData = new FormData();
    formData.append("file", createMockFile());

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "POST",
        body: formData,
      }),
    });

    await expect(POST(event)).rejects.toMatchObject({
      status: 404,
      body: { message: "Edition not found" },
    });
  });
});

describe("DELETE /api/editions/[id]/file", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
    mockAssertLibrarian.mockImplementation(() => {});
  });

  it("deletes file successfully", async () => {
    mockGetEditionById.mockResolvedValue(mockEdition);
    mockDeleteEditionFile.mockResolvedValue(true);
    mockRemoveEditionFile.mockResolvedValue({ ...mockEdition, fileKey: null });

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "DELETE",
      }),
    });

    const response = await DELETE(event);
    const data = (await response.json()) as { fileKey: string | null };

    expect(response.status).toBe(200);
    expect(data.fileKey).toBeNull();
    expect(mockDeleteEditionFile).toHaveBeenCalledWith(
      expect.anything(),
      "edition-1",
    );
    expect(mockRemoveEditionFile).toHaveBeenCalledWith(
      expect.anything(),
      "edition-1",
      expect.anything(),
    );
  });

  it("returns 400 when no file attached", async () => {
    mockGetEditionById.mockResolvedValue({ ...mockEdition, fileKey: null });

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "DELETE",
      }),
    });

    await expect(DELETE(event)).rejects.toMatchObject({
      status: 400,
      body: { message: "No file attached to this edition" },
    });
  });

  it("returns 404 when edition not found", async () => {
    mockGetEditionById.mockResolvedValue(null);

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "DELETE",
      }),
    });

    await expect(DELETE(event)).rejects.toMatchObject({
      status: 404,
      body: { message: "Edition not found" },
    });
  });

  it("requires librarian role", async () => {
    mockAssertLibrarian.mockImplementation(() => {
      throw { status: 403, body: { message: "Insufficient permissions" } };
    });

    const event = createMockEvent({
      request: new Request("http://localhost/api/editions/edition-1/file", {
        method: "DELETE",
      }),
    });

    await expect(DELETE(event)).rejects.toMatchObject({ status: 403 });
  });
});
