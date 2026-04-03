// Event repertoire API route tests
// Tests for /api/events/:id/works and nested routes
// Issue #121
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";

// Mock SvelteKit error/json functions to make error() actually throw
vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    error: (status: number, message: string) => {
      const err = new Error(message) as Error & { status: number };
      err.status = status;
      throw err;
    },
    json: (data: unknown, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  };
});

// Mock the middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertLibrarian: vi.fn(),
}));

// Mock the event-repertoire DB functions
vi.mock("$lib/server/db/event-repertoire", () => ({
  getEventRepertoire: vi.fn(),
  addWorkToEvent: vi.fn(),
  removeWorkFromEvent: vi.fn(),
  updateEventWorkNotes: vi.fn(),
  getEventWork: vi.fn(),
  reorderEventWorks: vi.fn(),
  addEditionToEventWork: vi.fn(),
  removeEditionFromEventWork: vi.fn(),
  setPrimaryEdition: vi.fn(),
  updateEventWorkEditionNotes: vi.fn(),
}));

// Mock the events DB functions
vi.mock("$lib/server/db/events", () => ({
  getEventById: vi.fn(),
}));

import {
  getAuthenticatedMember,
  assertLibrarian,
} from "$lib/server/auth/middleware";
import {
  getEventRepertoire,
  addWorkToEvent,
  removeWorkFromEvent,
  updateEventWorkNotes,
  getEventWork,
  reorderEventWorks,
  addEditionToEventWork,
  removeEditionFromEventWork,
  setPrimaryEdition,
  updateEventWorkEditionNotes,
} from "$lib/server/db/event-repertoire";
import { getEventById } from "$lib/server/db/events";

// Import route handlers
import { GET, POST } from "../../../../routes/api/events/[id]/works/+server";
import {
  DELETE as DELETE_WORK,
  PATCH as PATCH_WORK,
} from "../../../../routes/api/events/[id]/works/[workId]/+server";
import { POST as POST_EDITION } from "../../../../routes/api/events/[id]/works/[workId]/editions/+server";
import {
  DELETE as DELETE_EDITION,
  PATCH as PATCH_EDITION,
} from "../../../../routes/api/events/[id]/works/[workId]/editions/[editionId]/+server";
import { POST as POST_REORDER } from "../../../../routes/api/events/[id]/works/reorder/+server";

// Type-safe parameter extraction for route handlers
type GetEventParams = Parameters<typeof GET>[0];
type PostEventParams = Parameters<typeof POST>[0];
type DeleteWorkParams = Parameters<typeof DELETE_WORK>[0];
type PatchWorkParams = Parameters<typeof PATCH_WORK>[0];
type PostEditionParams = Parameters<typeof POST_EDITION>[0];
type DeleteEditionParams = Parameters<typeof DELETE_EDITION>[0];
type PatchEditionParams = Parameters<typeof PATCH_EDITION>[0];
type PostReorderParams = Parameters<typeof POST_REORDER>[0];

// Cast mocks
const mockGetAuthenticatedMember = getAuthenticatedMember as ReturnType<
  typeof vi.fn
>;
const mockAssertLibrarian = assertLibrarian as ReturnType<typeof vi.fn>;
const mockGetEventRepertoire = getEventRepertoire as ReturnType<typeof vi.fn>;
const mockAddWorkToEvent = addWorkToEvent as ReturnType<typeof vi.fn>;
const mockRemoveWorkFromEvent = removeWorkFromEvent as ReturnType<typeof vi.fn>;
const mockUpdateEventWorkNotes = updateEventWorkNotes as ReturnType<
  typeof vi.fn
>;
const mockGetEventWork = getEventWork as ReturnType<typeof vi.fn>;
const mockReorderEventWorks = reorderEventWorks as ReturnType<typeof vi.fn>;
const mockAddEditionToEventWork = addEditionToEventWork as ReturnType<
  typeof vi.fn
>;
const mockRemoveEditionFromEventWork = removeEditionFromEventWork as ReturnType<
  typeof vi.fn
>;
const mockSetPrimaryEdition = setPrimaryEdition as ReturnType<typeof vi.fn>;
const mockUpdateEventWorkEditionNotes =
  updateEventWorkEditionNotes as ReturnType<typeof vi.fn>;
const mockGetEventById = getEventById as ReturnType<typeof vi.fn>;

// Test fixtures
const mockMember = {
  id: "member-1",
  name: "Test User",
  email_id: "test@example.com",
  roles: ["librarian"],
  voices: [],
  sections: [],
};

const mockEvent = {
  id: "event-1",
  title: "Concert",
  type: "concert",
  starts_at: "2026-02-15T19:00:00Z",
};

const mockEventWork = {
  id: "ew-1",
  event_id: "event-1",
  work_id: "work-1",
  display_order: 0,
  notes: null,
  added_at: new Date().toISOString(),
  added_by: "member-1",
};

const mockRepertoire = {
  eventId: "event-1",
  works: [
    {
      eventWorkId: "ew-1",
      work: { id: "work-1", title: "Symphony No. 5", composer: "Beethoven" },
      displayOrder: 0,
      notes: null,
      editions: [],
    },
  ],
};

// Helper to create mock request event base (cast at call site with Parameters<typeof Handler>[0])
function createMockEventBase(
  overrides: {
    params?: Record<string, string>;
    platform?: { env: { DB: unknown } } | undefined;
    request?: Request;
    url?: URL;
  } = {},
) {
  const defaultPlatform = { env: { DB: {} } };
  return {
    platform: "platform" in overrides ? overrides.platform : defaultPlatform,
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
      serialize: vi.fn(),
    },
    params: overrides.params ?? { id: "event-1" },
    request:
      overrides.request ??
      new Request("http://localhost/api/events/event-1/works"),
    url: overrides.url ?? new URL("http://localhost/api/events/event-1/works"),
    locals: { org: { id: createOrgId("test-org") } } as any,
    route: { id: "/api/events/[id]/works" },
    getClientAddress: () => "127.0.0.1",
    fetch: vi.fn(),
    setHeaders: vi.fn(),
    isDataRequest: false,
    isSubRequest: false,
  };
}

describe("Event Repertoire API Routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockMember);
    mockGetEventById.mockResolvedValue(mockEvent);
  });

  // ============================================================================
  // GET /api/events/:id/works
  // ============================================================================

  describe("GET /api/events/:id/works", () => {
    it("returns repertoire for existing event", async () => {
      mockGetEventRepertoire.mockResolvedValue(mockRepertoire);

      const event = createMockEventBase();
      const response = await GET(event as unknown as GetEventParams);

      expect(mockGetEventById).toHaveBeenCalledWith(
        expect.anything(),
        "event-1",
        expect.anything(),
      );
      expect(mockGetEventRepertoire).toHaveBeenCalledWith(
        expect.anything(),
        "event-1",
      );

      const data = (await response.json()) as {
        eventId: string;
        works: unknown[];
      };
      expect(data.eventId).toBe("event-1");
      expect(data.works).toHaveLength(1);
    });

    it("returns 404 for non-existent event", async () => {
      mockGetEventById.mockResolvedValue(null);

      const event = createMockEventBase();

      await expect(GET(event as unknown as GetEventParams)).rejects.toThrow();
    });

    it("throws 500 if database not available", async () => {
      const event = createMockEventBase({ platform: undefined });

      await expect(GET(event as unknown as GetEventParams)).rejects.toThrow();
    });
  });

  // ============================================================================
  // POST /api/events/:id/works
  // ============================================================================

  describe("POST /api/events/:id/works", () => {
    it("adds work to event with valid data", async () => {
      mockAddWorkToEvent.mockResolvedValue(mockEventWork);

      const event = createMockEventBase({
        request: new Request("http://localhost/api/events/event-1/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workId: "work-1", notes: "Opening piece" }),
        }),
      });

      const response = await POST(event as unknown as PostEventParams);

      expect(response.status).toBe(201);
      expect(mockAssertLibrarian).toHaveBeenCalledWith(mockMember);
      expect(mockAddWorkToEvent).toHaveBeenCalledWith(
        expect.anything(),
        "event-1",
        "work-1",
        "member-1",
        "Opening piece",
      );
    });

    it("returns 400 if workId missing", async () => {
      const event = createMockEventBase({
        request: new Request("http://localhost/api/events/event-1/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }),
      });

      const response = await POST(event as unknown as PostEventParams);

      expect(response.status).toBe(400);
    });

    it("returns 409 if work already in event", async () => {
      mockAddWorkToEvent.mockRejectedValue(
        new Error("Work is already in this event's repertoire"),
      );

      const event = createMockEventBase({
        request: new Request("http://localhost/api/events/event-1/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workId: "work-1" }),
        }),
      });

      const response = await POST(event as unknown as PostEventParams);

      expect(response.status).toBe(409);
    });

    it("returns 404 for non-existent event", async () => {
      mockGetEventById.mockResolvedValue(null);

      const event = createMockEventBase({
        request: new Request("http://localhost/api/events/event-1/works", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workId: "work-1" }),
        }),
      });

      await expect(POST(event as unknown as PostEventParams)).rejects.toThrow();
    });
  });

  // ============================================================================
  // DELETE /api/events/:id/works/:workId
  // ============================================================================

  describe("DELETE /api/events/:id/works/:workId", () => {
    it("removes work from event", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);
      mockRemoveWorkFromEvent.mockResolvedValue(true);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1" },
      });

      const response = await DELETE_WORK(event as unknown as DeleteWorkParams);

      expect(response.status).toBe(204);
      expect(mockRemoveWorkFromEvent).toHaveBeenCalledWith(
        expect.anything(),
        "ew-1",
      );
    });

    it("returns 404 if work not in event", async () => {
      mockGetEventWork.mockResolvedValue(null);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-999" },
      });

      await expect(
        DELETE_WORK(event as unknown as DeleteWorkParams),
      ).rejects.toThrow();
    });

    it("returns 404 if event_id mismatch", async () => {
      mockGetEventWork.mockResolvedValue({
        ...mockEventWork,
        event_id: "other-event",
      });

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1" },
      });

      await expect(
        DELETE_WORK(event as unknown as DeleteWorkParams),
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // PATCH /api/events/:id/works/:workId
  // ============================================================================

  describe("PATCH /api/events/:id/works/:workId", () => {
    it("updates work notes", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);
      mockUpdateEventWorkNotes.mockResolvedValue(undefined);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1" },
        request: new Request("http://localhost/api/events/event-1/works/ew-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: "Updated notes" }),
        }),
      });

      const response = await PATCH_WORK(event as unknown as PatchWorkParams);

      expect(response.status).toBe(200);
      expect(mockUpdateEventWorkNotes).toHaveBeenCalledWith(
        expect.anything(),
        "ew-1",
        "Updated notes",
      );
    });

    it("clears notes when set to null", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1" },
        request: new Request("http://localhost/api/events/event-1/works/ew-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notes: null }),
        }),
      });

      await PATCH_WORK(event as unknown as PatchWorkParams);

      expect(mockUpdateEventWorkNotes).toHaveBeenCalledWith(
        expect.anything(),
        "ew-1",
        null,
      );
    });
  });

  // ============================================================================
  // POST /api/events/:id/works/reorder
  // ============================================================================

  describe("POST /api/events/:id/works/reorder", () => {
    it("reorders works in event", async () => {
      mockReorderEventWorks.mockResolvedValue(undefined);

      const event = createMockEventBase({
        request: new Request(
          "http://localhost/api/events/event-1/works/reorder",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventWorkIds: ["ew-2", "ew-1", "ew-3"] }),
          },
        ),
      });

      const response = await POST_REORDER(
        event as unknown as PostReorderParams,
      );

      expect(response.status).toBe(200);
      expect(mockReorderEventWorks).toHaveBeenCalledWith(
        expect.anything(),
        "event-1",
        ["ew-2", "ew-1", "ew-3"],
      );
    });

    it("returns 400 if eventWorkIds missing", async () => {
      const event = createMockEventBase({
        request: new Request(
          "http://localhost/api/events/event-1/works/reorder",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        ),
      });

      await expect(
        POST_REORDER(event as unknown as PostReorderParams),
      ).rejects.toThrow();
    });

    it("returns 400 if eventWorkIds is empty array", async () => {
      const event = createMockEventBase({
        request: new Request(
          "http://localhost/api/events/event-1/works/reorder",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventWorkIds: [] }),
          },
        ),
      });

      await expect(
        POST_REORDER(event as unknown as PostReorderParams),
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // POST /api/events/:id/works/:workId/editions
  // ============================================================================

  describe("POST /api/events/:id/works/:workId/editions", () => {
    it("adds edition to event work", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);
      mockAddEditionToEventWork.mockResolvedValue({
        id: "ewe-1",
        event_work_id: "ew-1",
        edition_id: "edition-1",
        is_primary: false,
        notes: null,
        added_at: new Date().toISOString(),
        added_by: "member-1",
      });

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1" },
        request: new Request(
          "http://localhost/api/events/event-1/works/ew-1/editions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ editionId: "edition-1", isPrimary: true }),
          },
        ),
      });

      const response = await POST_EDITION(
        event as unknown as PostEditionParams,
      );

      expect(response.status).toBe(201);
      expect(mockAddEditionToEventWork).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventWorkId: "ew-1",
          editionId: "edition-1",
          isPrimary: true,
        }),
      );
    });

    it("returns 400 if editionId missing", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1" },
        request: new Request(
          "http://localhost/api/events/event-1/works/ew-1/editions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({}),
          },
        ),
      });

      await expect(
        POST_EDITION(event as unknown as PostEditionParams),
      ).rejects.toThrow();
    });

    it("returns 409 if edition already selected", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);
      mockAddEditionToEventWork.mockRejectedValue(
        new Error("Edition is already selected"),
      );

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1" },
        request: new Request(
          "http://localhost/api/events/event-1/works/ew-1/editions",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ editionId: "edition-1" }),
          },
        ),
      });

      await expect(
        POST_EDITION(event as unknown as PostEditionParams),
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // DELETE /api/events/:id/works/:workId/editions/:editionId
  // ============================================================================

  describe("DELETE /api/events/:id/works/:workId/editions/:editionId", () => {
    it("removes edition from event work", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);
      mockRemoveEditionFromEventWork.mockResolvedValue(true);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1", editionId: "ewe-1" },
      });

      const response = await DELETE_EDITION(
        event as unknown as DeleteEditionParams,
      );

      expect(response.status).toBe(204);
      expect(mockRemoveEditionFromEventWork).toHaveBeenCalledWith(
        expect.anything(),
        "ewe-1",
      );
    });

    it("returns 404 if edition not found", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);
      mockRemoveEditionFromEventWork.mockResolvedValue(false);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1", editionId: "ewe-999" },
      });

      await expect(
        DELETE_EDITION(event as unknown as DeleteEditionParams),
      ).rejects.toThrow();
    });
  });

  // ============================================================================
  // PATCH /api/events/:id/works/:workId/editions/:editionId
  // ============================================================================

  describe("PATCH /api/events/:id/works/:workId/editions/:editionId", () => {
    it("sets edition as primary", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1", editionId: "ewe-1" },
        request: new Request(
          "http://localhost/api/events/event-1/works/ew-1/editions/ewe-1",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isPrimary: true }),
          },
        ),
      });

      const response = await PATCH_EDITION(
        event as unknown as PatchEditionParams,
      );

      expect(response.status).toBe(200);
      expect(mockSetPrimaryEdition).toHaveBeenCalledWith(
        expect.anything(),
        "ew-1",
        "ewe-1",
      );
    });

    it("updates edition notes", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1", editionId: "ewe-1" },
        request: new Request(
          "http://localhost/api/events/event-1/works/ew-1/editions/ewe-1",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ notes: "Use vocal score" }),
          },
        ),
      });

      const response = await PATCH_EDITION(
        event as unknown as PatchEditionParams,
      );

      expect(response.status).toBe(200);
      expect(mockUpdateEventWorkEditionNotes).toHaveBeenCalledWith(
        expect.anything(),
        "ewe-1",
        "Use vocal score",
      );
    });

    it("does not call setPrimaryEdition if isPrimary is false", async () => {
      mockGetEventWork.mockResolvedValue(mockEventWork);

      const event = createMockEventBase({
        params: { id: "event-1", workId: "ew-1", editionId: "ewe-1" },
        request: new Request(
          "http://localhost/api/events/event-1/works/ew-1/editions/ewe-1",
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ isPrimary: false }),
          },
        ),
      });

      await PATCH_EDITION(event as unknown as PatchEditionParams);

      expect(mockSetPrimaryEdition).not.toHaveBeenCalled();
    });
  });
});
