// Tests for /api/events endpoints
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET, POST } from "$lib/../routes/api/events/+server";
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
  const events: any[] = [];
  const members = new Map([
    [
      "test-member",
      {
        id: "test-member",
        email_id: "conductor@example.com",
        name: "Test Conductor",
        roles: ["conductor"],
        invited_by: null,
        joined_at: new Date().toISOString(),
      },
    ],
    [
      "librarian-member",
      {
        id: "librarian-member",
        email_id: "librarian@example.com",
        name: "Test Librarian",
        roles: ["librarian"],
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
          // Member lookup for authentication (with JOIN member_organizations)
          if (
            query.includes("FROM members") &&
            query.includes("member_organizations") &&
            query.includes("WHERE m.id")
          ) {
            const memberId = statement._params?.[0] as string;
            return members.get(memberId) || null;
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
          // Get upcoming events
          if (query.includes("WHERE starts_at >= datetime")) {
            const now = new Date().toISOString();
            const upcoming = events.filter((e) => e.starts_at >= now);
            return { results: upcoming };
          }
          return { results: [] };
        },
        run: async () => {
          if (query.includes("INSERT INTO events")) {
            const [
              id,
              title,
              description,
              location,
              starts_at,
              ends_at,
              event_type,
              created_by,
            ] = statement._params as any[];
            events.push({
              id,
              title,
              description,
              location,
              starts_at,
              ends_at,
              event_type,
              created_by,
              created_at: new Date().toISOString(),
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      } as any;
      return statement;
    },
    batch: async (statements: any[]) => {
      return await Promise.all(statements.map((s) => s.run()));
    },
  } as any;
}

// Helper to create mock member
function createMockMember(roles: string[]) {
  return {
    id: "test-member",
    email: "test@example.com",
    roles,
  };
}

// Helper to create mock cookies
function createMockCookies(memberId: string | null = "test-member"): any {
  return {
    get: (key: string) => {
      if (key === "member_id") return memberId;
      return null;
    },
  };
}

// Mock org for subdomain routing (Schema V2)
const mockOrg = {
  id: "org_crede_001",
  name: "Crede",
  subdomain: "crede",
  type: "collective" as const,
  contactEmail: "test@example.com",
  createdAt: new Date().toISOString(),
};

describe("GET /api/events", () => {
  it("returns upcoming events for authenticated user", async () => {
    const db = createMockDb();

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("test-member"),
      locals: { org: mockOrg },
    } as any;

    const response = await GET(event);
    expect(response.status).toBe(200);

    const data = await response.json();
    expect(Array.isArray(data)).toBe(true);
  });

  it("returns 401 for unauthenticated user", async () => {
    const db = createMockDb();

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies(null),
      locals: { org: mockOrg },
    } as any;

    await expect(GET(event)).rejects.toThrow();
  });
});

describe("POST /api/events", () => {
  it("creates single event with conductor role", async () => {
    const db = createMockDb();

    const requestBody = {
      events: [
        {
          title: "Weekly Rehearsal",
          starts_at: "2026-02-01T19:00:00Z",
          event_type: "rehearsal" as EventType,
        },
      ],
    };

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("test-member"),
      locals: { org: mockOrg },
      request: {
        json: async () => requestBody,
      },
    } as any;

    const response = await POST(event);
    expect(response.status).toBe(200);

    const data = (await response.json()) as any;
    expect(data.events).toHaveLength(1);
    expect(data.events[0].title).toBe("Weekly Rehearsal");
  });

  it("creates multiple events in batch", async () => {
    const db = createMockDb();

    const requestBody = {
      events: [
        {
          title: "Rehearsal 1",
          starts_at: "2026-02-01T19:00:00Z",
          event_type: "rehearsal" as EventType,
        },
        {
          title: "Rehearsal 2",
          starts_at: "2026-02-08T19:00:00Z",
          event_type: "rehearsal" as EventType,
        },
      ],
    };

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("test-member"),
      locals: { org: mockOrg },
      request: {
        json: async () => requestBody,
      },
    } as any;

    const response = await POST(event);
    const data = (await response.json()) as any;
    expect(data.events).toHaveLength(2);
  });

  it("returns 403 for non-conductor", async () => {
    const db = createMockDb();

    const requestBody = {
      events: [
        {
          title: "Test Event",
          starts_at: "2026-02-01T19:00:00Z",
          event_type: "rehearsal" as EventType,
        },
      ],
    };

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("librarian-member"), // Use librarian (not conductor)
      locals: { org: mockOrg },
      request: {
        json: async () => requestBody,
      },
    } as any;

    await expect(POST(event)).rejects.toThrow();
  });

  it("validates event_type enum", async () => {
    const db = createMockDb();

    const requestBody = {
      events: [
        {
          title: "Test Event",
          starts_at: "2026-02-01T19:00:00Z",
          event_type: "invalid-type", // Invalid type
        },
      ],
    };

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("test-member"),
      locals: { org: mockOrg },
      request: {
        json: async () => requestBody,
      },
    } as any;

    await expect(POST(event)).rejects.toThrow();
  });

  it("validates required fields", async () => {
    const db = createMockDb();

    const requestBody = {
      events: [
        {
          // Missing title and event_type
          starts_at: "2026-02-01T19:00:00Z",
        },
      ],
    };

    const event: RequestEvent<any, any> = {
      platform: { env: { DB: db } },
      cookies: createMockCookies("test-member"),
      locals: { org: mockOrg },
      request: {
        json: async () => requestBody,
      },
    } as any;

    await expect(POST(event)).rejects.toThrow();
  });
});
