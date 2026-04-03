// Tests for /api/events/[id] endpoints
import { describe, it, expect, vi } from "vitest";
import { createOrgId } from "@polyphony/shared";
import { GET, PATCH, DELETE } from "$lib/../routes/api/events/[id]/+server";
import type { RequestEvent } from "@sveltejs/kit";
import type { EventType } from "$lib/types";

// Mock SvelteKit error/json functions
vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    error: (status: number, message: string) => {
      const err = new Error(message);
      (err as any).status = status;
      throw err;
    },
    json: (data: any) =>
      new Response(JSON.stringify(data), {
        headers: { "content-type": "application/json" },
      }),
  };
});

// Mock database
function createMockDb() {
  const events = new Map([
    [
      "event-1",
      {
        id: "event-1",
        title: "Weekly Rehearsal",
        description: "Regular weekly practice",
        location: "Main Hall",
        starts_at: "2026-02-15T19:00:00Z",
        ends_at: "2026-02-15T21:00:00Z",
        event_type: "rehearsal" as EventType,
        created_by: "conductor-1",
        created_at: new Date().toISOString(),
      },
    ],
  ]);

  const members = new Map([
    [
      "conductor-1",
      {
        id: "conductor-1",
        email_id: "conductor@example.com",
        name: "Test Conductor",
        roles: ["conductor"],
        invited_by: null,
        joined_at: new Date().toISOString(),
      },
    ],
    [
      "regular-member",
      {
        id: "regular-member",
        email_id: "member@example.com",
        name: "Regular Member",
        roles: [],
        invited_by: null,
        joined_at: new Date().toISOString(),
      },
    ],
  ]);

  return {
    prepare: (query: string) => {
      const statement = {
        bind: (...params: unknown[]) => {
          statement._params = params;
          return statement;
        },
        first: async () => {
          // Member lookup (with JOIN member_organizations)
          if (
            query.includes("FROM members") &&
            query.includes("member_organizations") &&
            query.includes("WHERE m.id")
          ) {
            const memberId = statement._params?.[0] as string;
            return members.get(memberId) || null;
          }
          // Event lookup
          if (query.includes("FROM events WHERE id")) {
            const eventId = statement._params?.[0] as string;
            return events.get(eventId) || null;
          }
          return null;
        },
        all: async () => {
          // Member roles lookup
          if (query.includes("FROM member_roles")) {
            const memberId = statement._params?.[0] as string;
            const member = members.get(memberId);
            if (member) {
              const results = member.roles.map((role: string) => ({ role }));
              return { results };
            }
            return { results: [] };
          }
          return { results: [] };
        },
        run: async () => {
          // UPDATE event
          if (query.includes("UPDATE events")) {
            // Params order: title, description, location, starts_at, ends_at, event_type, id
            const [
              title,
              description,
              location,
              starts_at,
              ends_at,
              event_type,
              id,
            ] = statement._params as any[];
            const event = events.get(id as string);
            if (!event) {
              return { success: false, meta: { changes: 0 } };
            }
            // Update the event in the map
            events.set(id as string, {
              ...event,
              title: title ?? event.title,
              description: description ?? event.description,
              location: location ?? event.location,
              starts_at: starts_at ?? event.starts_at,
              ends_at: ends_at ?? event.ends_at,
              event_type: event_type ?? event.event_type,
            });
            return { success: true, meta: { changes: 1 } };
          }
          // DELETE event
          if (query.includes("DELETE FROM events")) {
            const eventId = statement._params?.[0] as string;
            const existed = events.has(eventId);
            events.delete(eventId);
            return { success: true, meta: { changes: existed ? 1 : 0 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
        _params: [] as unknown[],
      };
      return statement;
    },
  } as any;
}

// Helper to create mock cookies
function createMockCookies(memberId: string | null = "conductor-1"): any {
  return {
    get: (key: string) => {
      if (key === "member_id") return memberId;
      return null;
    },
  };
}

describe("GET /api/events/[id]", () => {
  it("returns event details for authenticated user", async () => {
    const db = createMockDb();

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("conductor-1"),
      params: { id: "event-1" },
      locals: { org: { id: createOrgId("test-org") } },
    } as any;

    const response = await GET(event);
    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.id).toBe("event-1");
    expect(data.title).toBe("Weekly Rehearsal");
  });

  it("returns 401 for unauthenticated user", async () => {
    const db = createMockDb();

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies(null),
      params: { id: "event-1" },
      locals: { org: { id: createOrgId("test-org") } },
    } as any;

    await expect(GET(event)).rejects.toThrow();
  });

  it("returns 404 for non-existent event", async () => {
    const db = createMockDb();

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("conductor-1"),
      params: { id: "nonexistent" },
      locals: { org: { id: createOrgId("test-org") } },
    } as any;

    try {
      await GET(event);
      expect.fail("Should have thrown an error");
    } catch (err: any) {
      expect(err.status).toBe(404);
    }
  });
});

describe("PATCH /api/events/[id]", () => {
  it("updates event with conductor role", async () => {
    const db = createMockDb();

    const requestBody = {
      title: "Updated Rehearsal",
      location: "New Hall",
    };

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("conductor-1"),
      params: { id: "event-1" },
      request: {
        json: async () => requestBody,
      },
      locals: { org: { id: createOrgId("test-org") } },
    } as any;

    const response = await PATCH(event);
    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.title).toBe("Updated Rehearsal");
    expect(data.location).toBe("New Hall");
  });

  it("returns 403 for non-conductor", async () => {
    const db = createMockDb();

    const requestBody = {
      title: "Updated Title",
    };

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("regular-member"),
      params: { id: "event-1" },
      request: {
        json: async () => requestBody,
      },
      locals: { org: { id: createOrgId("test-org") } },
    } as any;

    await expect(PATCH(event)).rejects.toThrow();
  });

  it("returns 404 when updating non-existent event", async () => {
    const db = createMockDb();

    const requestBody = {
      title: "Updated Title",
    };

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("conductor-1"),
      params: { id: "nonexistent" },
      request: {
        json: async () => requestBody,
      },
      locals: { org: { id: createOrgId("test-org") } },
    } as any;

    await expect(PATCH(event)).rejects.toThrow();
  });
});

describe("DELETE /api/events/[id]", () => {
  it("deletes event with conductor role", async () => {
    const db = createMockDb();

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("conductor-1"),
      params: { id: "event-1" },
      locals: { org: { id: createOrgId("test-org") } },
    } as any;

    const response = await DELETE(event);
    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.message).toContain("deleted");
  });

  it("returns 403 for non-conductor", async () => {
    const db = createMockDb();

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("regular-member"),
      params: { id: "event-1" },
      locals: { org: { id: createOrgId("test-org") } },
    } as any;

    await expect(DELETE(event)).rejects.toThrow();
  });

  it("returns 404 when deleting non-existent event", async () => {
    const db = createMockDb();

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("conductor-1"),
      params: { id: "nonexistent" },
      locals: { org: { id: createOrgId("test-org") } },
    } as any;

    await expect(DELETE(event)).rejects.toThrow();
  });
});
