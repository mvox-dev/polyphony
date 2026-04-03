// Sections API route tests
// Tests for /api/sections CRUD + reorder endpoints
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";
import type { Member } from "$lib/server/db/members";
import type { Section } from "$lib/types";

// Mock the middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

// Mock the DB functions
vi.mock("$lib/server/db/sections", () => ({
  createSection: vi.fn(),
  getSectionById: vi.fn(),
  toggleSectionActive: vi.fn(),
  deleteSection: vi.fn(),
  reorderSections: vi.fn(),
  getAllSectionsWithCounts: vi.fn(),
}));

import { POST } from "../../../routes/api/sections/+server";
import { PATCH, DELETE } from "../../../routes/api/sections/[id]/+server";
import { POST as REORDER } from "../../../routes/api/sections/reorder/+server";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  createSection,
  getSectionById,
  toggleSectionActive,
  deleteSection,
  reorderSections,
  getAllSectionsWithCounts,
} from "$lib/server/db/sections";

// Mock admin member
const mockAdmin: Member = {
  id: "admin-1",
  name: "Admin User",
  nickname: null,
  email_id: "admin@example.com",
  email_contact: null,
  roles: ["admin"],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2024-01-01T00:00:00Z",
};

// Sample section data
const mockSection: Section & { assignmentCount?: number } = {
  id: "section-1",
  orgId: "org_crede_001",
  name: "Soprano 1",
  abbreviation: "S1",
  parentSectionId: null,
  displayOrder: 1,
  isActive: true,
};

const mockSectionWithCount = { ...mockSection, assignmentCount: 5 };

// Helper to create mock request event
function createMockEvent(overrides: Partial<RequestEvent> = {}): RequestEvent {
  return {
    platform: { env: { DB: {} as D1Database } },
    cookies: {
      get: vi.fn(),
      getAll: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      serialize: vi.fn(),
    },
    params: {},
    request: new Request("http://localhost/api/sections"),
    url: new URL("http://localhost/api/sections"),
    locals: { org: { id: createOrgId("test-org") } } as any,
    route: { id: "/api/sections" },
    getClientAddress: () => "127.0.0.1",
    fetch: vi.fn(),
    setHeaders: vi.fn(),
    isDataRequest: false,
    isSubRequest: false,
    ...overrides,
  } as unknown as RequestEvent;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdmin);
  vi.mocked(assertAdmin).mockReturnValue(undefined);
  vi.mocked(createSection).mockResolvedValue(mockSection);
  vi.mocked(getSectionById).mockResolvedValue(mockSection);
  vi.mocked(toggleSectionActive).mockResolvedValue(true);
  vi.mocked(deleteSection).mockResolvedValue(true);
  vi.mocked(reorderSections).mockResolvedValue(undefined);
  vi.mocked(getAllSectionsWithCounts).mockResolvedValue([mockSectionWithCount]);
});

// ============================================================================
// POST /api/sections - Create section
// ============================================================================

describe("POST /api/sections", () => {
  it("creates a section with required fields", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Tenor 1",
          abbreviation: "T1",
        }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(201);
    // orgId comes from locals.org.id (server-side), not request body
    expect(createSection).toHaveBeenCalledWith(
      {},
      {
        orgId: createOrgId("test-org"),
        name: "Tenor 1",
        abbreviation: "T1",
        parentSectionId: undefined,
        displayOrder: 0,
        isActive: true,
      },
    );
  });

  it("creates section with all optional fields", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Tenor 1",
          abbreviation: "T1",
          parentSectionId: "parent-section",
          displayOrder: 5,
          isActive: false,
        }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(201);
    // orgId comes from locals.org.id (server-side), not request body
    expect(createSection).toHaveBeenCalledWith(
      {},
      {
        orgId: createOrgId("test-org"),
        name: "Tenor 1",
        abbreviation: "T1",
        parentSectionId: "parent-section",
        displayOrder: 5,
        isActive: false,
      },
    );
  });

  it("requires admin role", async () => {
    vi.mocked(assertAdmin).mockImplementation(() => {
      throw { status: 403, body: { message: "Admin required" } };
    });

    const event = createMockEvent({
      request: new Request("http://localhost/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Test", abbreviation: "T" }),
      }),
    });

    await expect(POST(event)).rejects.toMatchObject({ status: 403 });
  });

  it("returns 400 if name is missing", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abbreviation: "T1" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("Name");
  });

  it("returns 400 if abbreviation is missing", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tenor 1" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("Abbreviation");
  });

  it("returns 409 if section already exists", async () => {
    vi.mocked(createSection).mockRejectedValue(
      new Error("Section already exists"),
    );

    const event = createMockEvent({
      request: new Request("http://localhost/api/sections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Soprano 1", abbreviation: "S1" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(409);
  });
});

// ============================================================================
// PATCH /api/sections/[id] - Toggle section active status
// ============================================================================

describe("PATCH /api/sections/[id]", () => {
  it("toggles section to inactive", async () => {
    const event = createMockEvent({
      params: { id: "section-1" },
      request: new Request("http://localhost/api/sections/section-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
    });

    const response = await PATCH(event as Parameters<typeof PATCH>[0]);

    expect(response.status).toBe(200);
    expect(toggleSectionActive).toHaveBeenCalledWith(
      {},
      "section-1",
      false,
      expect.anything(),
    );
    expect(getSectionById).toHaveBeenCalledWith(
      {},
      "section-1",
      expect.anything(),
    );
  });

  it("toggles section to active", async () => {
    const event = createMockEvent({
      params: { id: "section-1" },
      request: new Request("http://localhost/api/sections/section-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      }),
    });

    const response = await PATCH(event as Parameters<typeof PATCH>[0]);

    expect(response.status).toBe(200);
    expect(toggleSectionActive).toHaveBeenCalledWith(
      {},
      "section-1",
      true,
      expect.anything(),
    );
  });

  it("returns 400 if isActive is not a boolean", async () => {
    const event = createMockEvent({
      params: { id: "section-1" },
      request: new Request("http://localhost/api/sections/section-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: "yes" }),
      }),
    });

    const response = await PATCH(event as Parameters<typeof PATCH>[0]);

    expect(response.status).toBe(400);
  });

  it("returns 404 if section not found", async () => {
    vi.mocked(toggleSectionActive).mockResolvedValue(false);

    const event = createMockEvent({
      params: { id: "nonexistent" },
      request: new Request("http://localhost/api/sections/nonexistent", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
    });

    await expect(
      PATCH(event as Parameters<typeof PATCH>[0]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("requires admin role", async () => {
    vi.mocked(assertAdmin).mockImplementation(() => {
      throw { status: 403 };
    });

    const event = createMockEvent({
      params: { id: "section-1" },
      request: new Request("http://localhost/api/sections/section-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
    });

    await expect(
      PATCH(event as Parameters<typeof PATCH>[0]),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ============================================================================
// DELETE /api/sections/[id] - Delete section
// ============================================================================

describe("DELETE /api/sections/[id]", () => {
  it("deletes a section", async () => {
    const event = createMockEvent({
      params: { id: "section-1" },
      request: new Request("http://localhost/api/sections/section-1", {
        method: "DELETE",
      }),
    });

    const response = await DELETE(event as Parameters<typeof DELETE>[0]);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(deleteSection).toHaveBeenCalledWith(
      {},
      "section-1",
      expect.anything(),
    );
  });

  it("returns 404 if section not found", async () => {
    vi.mocked(deleteSection).mockResolvedValue(false);

    const event = createMockEvent({
      params: { id: "nonexistent" },
      request: new Request("http://localhost/api/sections/nonexistent", {
        method: "DELETE",
      }),
    });

    await expect(
      DELETE(event as Parameters<typeof DELETE>[0]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns 400 if section has assignments", async () => {
    vi.mocked(deleteSection).mockRejectedValue(
      new Error("Cannot delete section with assignments"),
    );

    const event = createMockEvent({
      params: { id: "section-1" },
      request: new Request("http://localhost/api/sections/section-1", {
        method: "DELETE",
      }),
    });

    const response = await DELETE(event as Parameters<typeof DELETE>[0]);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("assignments");
  });

  it("requires admin role", async () => {
    vi.mocked(assertAdmin).mockImplementation(() => {
      throw { status: 403 };
    });

    const event = createMockEvent({
      params: { id: "section-1" },
      request: new Request("http://localhost/api/sections/section-1", {
        method: "DELETE",
      }),
    });

    await expect(
      DELETE(event as Parameters<typeof DELETE>[0]),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ============================================================================
// POST /api/sections/reorder - Reorder sections
// ============================================================================

describe("POST /api/sections/reorder", () => {
  it("reorders sections", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/sections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionIds: ["section-2", "section-1", "section-3"],
        }),
      }),
    });

    const response = await REORDER(event);

    expect(response.status).toBe(200);
    expect(reorderSections).toHaveBeenCalledWith(
      {},
      ["section-2", "section-1", "section-3"],
      expect.anything(),
    );
    expect(getAllSectionsWithCounts).toHaveBeenCalledWith(
      {},
      expect.anything(),
    );
  });

  it("returns 400 if sectionIds is missing", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/sections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    });

    const response = await REORDER(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 if sectionIds is not an array", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/sections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionIds: "section-1" }),
      }),
    });

    const response = await REORDER(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 if sectionIds is empty array", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/sections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionIds: [] }),
      }),
    });

    const response = await REORDER(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 if sectionIds contains non-strings", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/sections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionIds: ["section-1", 123, "section-2"] }),
      }),
    });

    const response = await REORDER(event);

    expect(response.status).toBe(400);
  });

  it("requires admin role", async () => {
    vi.mocked(assertAdmin).mockImplementation(() => {
      throw { status: 403 };
    });

    const event = createMockEvent({
      request: new Request("http://localhost/api/sections/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionIds: ["section-1"] }),
      }),
    });

    await expect(REORDER(event)).rejects.toMatchObject({ status: 403 });
  });
});
