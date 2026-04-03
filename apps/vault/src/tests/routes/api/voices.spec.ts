// Voices API route tests
// Tests for /api/voices CRUD + reorder endpoints
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";
import type { Member } from "$lib/server/db/members";
import type { Voice } from "$lib/types";

// Mock the middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

// Mock the DB functions
vi.mock("$lib/server/db/voices", () => ({
  createVoice: vi.fn(),
  getVoiceById: vi.fn(),
  toggleVoiceActive: vi.fn(),
  deleteVoice: vi.fn(),
  reorderVoices: vi.fn(),
  getAllVoicesWithCounts: vi.fn(),
}));

import { POST } from "../../../routes/api/voices/+server";
import { PATCH, DELETE } from "../../../routes/api/voices/[id]/+server";
import { POST as REORDER } from "../../../routes/api/voices/reorder/+server";
import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  createVoice,
  getVoiceById,
  toggleVoiceActive,
  deleteVoice,
  reorderVoices,
  getAllVoicesWithCounts,
} from "$lib/server/db/voices";

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

// Sample voice data
const mockVoice: Voice & { assignmentCount?: number } = {
  id: "voice-1",
  name: "Soprano",
  abbreviation: "S",
  category: "vocal",
  rangeGroup: "high",
  displayOrder: 1,
  isActive: true,
};

const mockVoiceWithCount = { ...mockVoice, assignmentCount: 10 };

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
    request: new Request("http://localhost/api/voices"),
    url: new URL("http://localhost/api/voices"),
    locals: { org: { id: createOrgId("test-org") } } as any,
    route: { id: "/api/voices" },
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
  vi.mocked(createVoice).mockResolvedValue(mockVoice);
  vi.mocked(getVoiceById).mockResolvedValue(mockVoice);
  vi.mocked(toggleVoiceActive).mockResolvedValue(true);
  vi.mocked(deleteVoice).mockResolvedValue(true);
  vi.mocked(reorderVoices).mockResolvedValue(undefined);
  vi.mocked(getAllVoicesWithCounts).mockResolvedValue([mockVoiceWithCount]);
});

// ============================================================================
// POST /api/voices - Create voice
// ============================================================================

describe("POST /api/voices", () => {
  it("creates a voice with required fields", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Tenor",
          abbreviation: "T",
          category: "vocal",
        }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(201);
    expect(createVoice).toHaveBeenCalledWith(
      {},
      {
        orgId: "test-org",
        name: "Tenor",
        abbreviation: "T",
        category: "vocal",
        rangeGroup: undefined,
        displayOrder: 0,
        isActive: true,
      },
    );
  });

  it("creates voice with all optional fields", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Tenor",
          abbreviation: "T",
          category: "vocal",
          rangeGroup: "mid",
          displayOrder: 5,
          isActive: false,
        }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(201);
    expect(createVoice).toHaveBeenCalledWith(
      {},
      {
        orgId: "test-org",
        name: "Tenor",
        abbreviation: "T",
        category: "vocal",
        rangeGroup: "mid",
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
      request: new Request("http://localhost/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Test",
          abbreviation: "T",
          category: "vocal",
        }),
      }),
    });

    await expect(POST(event)).rejects.toMatchObject({ status: 403 });
  });

  it("returns 400 if name is missing", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ abbreviation: "T", category: "vocal" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("Name");
  });

  it("returns 400 if abbreviation is missing", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tenor", category: "vocal" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("Abbreviation");
  });

  it("returns 400 if category is missing", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Tenor", abbreviation: "T" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as { error: string };
    expect(data.error).toContain("Category");
  });

  it("returns 400 if category is invalid", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Tenor",
          abbreviation: "T",
          category: "invalid",
        }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
  });

  it("returns 409 if voice already exists", async () => {
    vi.mocked(createVoice).mockRejectedValue(new Error("Voice already exists"));

    const event = createMockEvent({
      request: new Request("http://localhost/api/voices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Soprano",
          abbreviation: "S",
          category: "vocal",
        }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(409);
  });
});

// ============================================================================
// PATCH /api/voices/[id] - Toggle voice active status
// ============================================================================

describe("PATCH /api/voices/[id]", () => {
  it("toggles voice to inactive", async () => {
    const event = createMockEvent({
      params: { id: "voice-1" },
      request: new Request("http://localhost/api/voices/voice-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: false }),
      }),
    });

    const response = await PATCH(event as Parameters<typeof PATCH>[0]);

    expect(response.status).toBe(200);
    expect(toggleVoiceActive).toHaveBeenCalledWith(
      {},
      "voice-1",
      false,
      "test-org",
    );
    expect(getVoiceById).toHaveBeenCalledWith({}, "voice-1", "test-org");
  });

  it("toggles voice to active", async () => {
    const event = createMockEvent({
      params: { id: "voice-1" },
      request: new Request("http://localhost/api/voices/voice-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true }),
      }),
    });

    const response = await PATCH(event as Parameters<typeof PATCH>[0]);

    expect(response.status).toBe(200);
    expect(toggleVoiceActive).toHaveBeenCalledWith(
      {},
      "voice-1",
      true,
      "test-org",
    );
  });

  it("returns 400 if isActive is not a boolean", async () => {
    const event = createMockEvent({
      params: { id: "voice-1" },
      request: new Request("http://localhost/api/voices/voice-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: "yes" }),
      }),
    });

    const response = await PATCH(event as Parameters<typeof PATCH>[0]);

    expect(response.status).toBe(400);
  });

  it("returns 404 if voice not found", async () => {
    vi.mocked(toggleVoiceActive).mockResolvedValue(false);

    const event = createMockEvent({
      params: { id: "nonexistent" },
      request: new Request("http://localhost/api/voices/nonexistent", {
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
      params: { id: "voice-1" },
      request: new Request("http://localhost/api/voices/voice-1", {
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
// DELETE /api/voices/[id] - Delete voice
// ============================================================================

describe("DELETE /api/voices/[id]", () => {
  it("deletes a voice", async () => {
    const event = createMockEvent({
      params: { id: "voice-1" },
      request: new Request("http://localhost/api/voices/voice-1", {
        method: "DELETE",
      }),
    });

    const response = await DELETE(event as Parameters<typeof DELETE>[0]);

    expect(response.status).toBe(200);
    const data = (await response.json()) as { success: boolean };
    expect(data.success).toBe(true);
    expect(deleteVoice).toHaveBeenCalledWith({}, "voice-1", "test-org");
  });

  it("returns 404 if voice not found", async () => {
    vi.mocked(deleteVoice).mockResolvedValue(false);

    const event = createMockEvent({
      params: { id: "nonexistent" },
      request: new Request("http://localhost/api/voices/nonexistent", {
        method: "DELETE",
      }),
    });

    await expect(
      DELETE(event as Parameters<typeof DELETE>[0]),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("returns 400 if voice has assignments", async () => {
    vi.mocked(deleteVoice).mockRejectedValue(
      new Error("Cannot delete voice with assignments"),
    );

    const event = createMockEvent({
      params: { id: "voice-1" },
      request: new Request("http://localhost/api/voices/voice-1", {
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
      params: { id: "voice-1" },
      request: new Request("http://localhost/api/voices/voice-1", {
        method: "DELETE",
      }),
    });

    await expect(
      DELETE(event as Parameters<typeof DELETE>[0]),
    ).rejects.toMatchObject({ status: 403 });
  });
});

// ============================================================================
// POST /api/voices/reorder - Reorder voices
// ============================================================================

describe("POST /api/voices/reorder", () => {
  it("reorders voices", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceIds: ["voice-2", "voice-1", "voice-3"] }),
      }),
    });

    const response = await REORDER(event);

    expect(response.status).toBe(200);
    expect(reorderVoices).toHaveBeenCalledWith(
      {},
      ["voice-2", "voice-1", "voice-3"],
      "test-org",
    );
    expect(getAllVoicesWithCounts).toHaveBeenCalledWith({}, "test-org");
  });

  it("returns 400 if voiceIds is missing", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }),
    });

    const response = await REORDER(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 if voiceIds is not an array", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceIds: "voice-1" }),
      }),
    });

    const response = await REORDER(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 if voiceIds is empty array", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceIds: [] }),
      }),
    });

    const response = await REORDER(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 if voiceIds contains non-strings", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/voices/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceIds: ["voice-1", 123, "voice-2"] }),
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
      request: new Request("http://localhost/api/voices/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voiceIds: ["voice-1"] }),
      }),
    });

    await expect(REORDER(event)).rejects.toMatchObject({ status: 403 });
  });
});
