// @ts-nocheck — Mock RequestEvent objects don't match SvelteKit's strict route types
// Tests for GET /api/internal/stats endpoint
// Issue #275 — Vault stats endpoint with shared secret auth
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "./+server";
import type { RequestEvent } from "@sveltejs/kit";

// Mock SvelteKit error/json
vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    error: (status: number, message: string) => {
      const err = new Error(message);
      (err as any).status = status;
      throw err;
    },
  };
});

const VALID_API_KEY = "test-notify-api-key-secret";

/**
 * Creates a mock D1Database that returns configurable aggregate counts.
 * Each query is matched by SQL pattern to return appropriate mock data.
 */
function createMockDb(overrides?: {
  memberCount?: number;
  orgCount?: number;
  worksCount?: number;
  editionsCount?: number;
  totalFileSize?: number;
  eventRows?: Array<{ event_type: string; count: number }>;
}) {
  const {
    memberCount = 42,
    orgCount = 3,
    worksCount = 15,
    editionsCount = 28,
    totalFileSize = 1048576,
    eventRows = [],
  } = overrides ?? {};

  return {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn().mockReturnThis(),
      first: vi.fn(async () => {
        if (sql.includes("FROM members")) {
          return { count: memberCount };
        }
        if (sql.includes("FROM organizations")) {
          return { count: orgCount };
        }
        if (sql.includes("FROM works")) {
          return { count: worksCount };
        }
        if (sql.includes("FROM editions")) {
          return { count: editionsCount };
        }
        if (
          sql.includes("edition_files") ||
          sql.includes("total_size") ||
          sql.includes("file_size") ||
          sql.includes("SUM")
        ) {
          return { total_size: totalFileSize };
        }
        return null;
      }),
      all: vi.fn(async () => {
        if (sql.includes("events") && sql.includes("event_type")) {
          return { results: eventRows };
        }
        return { results: [] };
      }),
    })),
  } as unknown as D1Database;
}

function createMockRequest(apiKey?: string): Request {
  const headers = new Headers();
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }
  return new Request("http://localhost/api/internal/stats", { headers });
}

function createMockEvent(overrides?: {
  apiKey?: string;
  envApiKey?: string;
  db?: D1Database;
}): RequestEvent {
  const { apiKey, envApiKey, db = createMockDb() } = overrides ?? {};

  return {
    request: createMockRequest(apiKey),
    platform: {
      env: {
        DB: db,
        ...(envApiKey !== undefined && { NOTIFY_API_KEY: envApiKey }),
      },
    },
  } as unknown as RequestEvent;
}

// ============================================================================
// Authentication tests
// ============================================================================

describe("GET /api/internal/stats — authentication", () => {
  it("returns 401 when no API key is provided", async () => {
    const event = createMockEvent({
      apiKey: undefined,
      envApiKey: VALID_API_KEY,
    });

    try {
      await GET(event);
      expect.fail("Should have rejected unauthenticated request");
    } catch (err: any) {
      expect(err.status).toBe(401);
    }
  });

  it("returns 401 when API key is wrong", async () => {
    const event = createMockEvent({
      apiKey: "wrong-key-totally-invalid",
      envApiKey: VALID_API_KEY,
    });

    try {
      await GET(event);
      expect.fail("Should have rejected invalid API key");
    } catch (err: any) {
      expect(err.status).toBe(401);
    }
  });

  it("returns 401 when Authorization header has wrong scheme", async () => {
    const request = new Request("http://localhost/api/internal/stats", {
      headers: { Authorization: `Basic ${VALID_API_KEY}` },
    });

    const event = {
      request,
      platform: {
        env: {
          DB: createMockDb(),
          NOTIFY_API_KEY: VALID_API_KEY,
        },
      },
    } as unknown as RequestEvent;

    try {
      await GET(event);
      expect.fail("Should have rejected non-Bearer auth");
    } catch (err: any) {
      expect(err.status).toBe(401);
    }
  });

  it("returns 401 when NOTIFY_API_KEY is not configured on server", async () => {
    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      // envApiKey intentionally omitted — server has no NOTIFY_API_KEY configured
    });

    try {
      await GET(event);
      expect.fail("Should have rejected when server key not configured");
    } catch (err: any) {
      expect(err.status).toBe(401);
    }
  });
});

// ============================================================================
// Successful response shape
// ============================================================================

describe("GET /api/internal/stats — success response", () => {
  it("returns 200 with correct API key", async () => {
    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
    });
    const response = await GET(event);
    expect(response.status).toBe(200);
  });

  it("returns all expected top-level fields", async () => {
    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
    });
    const response = await GET(event);
    const data = (await response.json()) as Record<string, unknown>;

    expect(data).toHaveProperty("member_count");
    expect(data).toHaveProperty("org_count");
    expect(data).toHaveProperty("works_count");
    expect(data).toHaveProperty("editions_count");
    expect(data).toHaveProperty("total_file_size");
    expect(data).toHaveProperty("events_today");
  });

  it("returns numeric values for counts", async () => {
    const db = createMockDb({
      memberCount: 100,
      orgCount: 5,
      worksCount: 42,
      editionsCount: 87,
      totalFileSize: 5242880,
    });

    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
      db,
    });
    const response = await GET(event);
    const data = (await response.json()) as any;

    expect(data.member_count).toBe(100);
    expect(data.org_count).toBe(5);
    expect(data.works_count).toBe(42);
    expect(data.editions_count).toBe(87);
    expect(data.total_file_size).toBe(5242880);
  });

  it("returns 0 for total_file_size when no files exist", async () => {
    const db = createMockDb({ totalFileSize: 0 });
    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
      db,
    });
    const response = await GET(event);
    const data = (await response.json()) as any;

    expect(data.total_file_size).toBe(0);
  });

  it("handles null total_file_size (no edition_files rows)", async () => {
    // SUM() returns null when there are no rows
    const db = {
      prepare: vi.fn((sql: string) => ({
        bind: vi.fn().mockReturnThis(),
        first: vi.fn(async () => {
          if (
            sql.includes("edition_files") ||
            sql.includes("total_size") ||
            sql.includes("file_size") ||
            sql.includes("SUM")
          ) {
            return { total_size: null };
          }
          return { count: 0 };
        }),
        all: vi.fn(async () => ({ results: [] })),
      })),
    } as unknown as D1Database;

    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
      db,
    });
    const response = await GET(event);
    const data = (await response.json()) as any;

    expect(data.total_file_size).toBe(0);
  });
});

// ============================================================================
// Events breakdown by category
// ============================================================================

describe("GET /api/internal/stats — events_today breakdown", () => {
  it("returns events_today as an object with event type keys", async () => {
    const db = createMockDb({
      eventRows: [
        { event_type: "rehearsal", count: 3 },
        { event_type: "concert", count: 1 },
      ],
    });

    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
      db,
    });
    const response = await GET(event);
    const data = (await response.json()) as any;

    expect(data.events_today).toEqual({
      rehearsal: 3,
      concert: 1,
      retreat: 0,
      festival: 0,
    });
  });

  it("returns all zeros when no events today", async () => {
    const db = createMockDb({ eventRows: [] });
    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
      db,
    });
    const response = await GET(event);
    const data = (await response.json()) as any;

    expect(data.events_today).toEqual({
      rehearsal: 0,
      concert: 0,
      retreat: 0,
      festival: 0,
    });
  });

  it("handles all four event types present", async () => {
    const db = createMockDb({
      eventRows: [
        { event_type: "rehearsal", count: 5 },
        { event_type: "concert", count: 2 },
        { event_type: "retreat", count: 1 },
        { event_type: "festival", count: 3 },
      ],
    });

    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
      db,
    });
    const response = await GET(event);
    const data = (await response.json()) as any;

    expect(data.events_today).toEqual({
      rehearsal: 5,
      concert: 2,
      retreat: 1,
      festival: 3,
    });
  });

  it("includes only recognized event types in events_today", async () => {
    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
    });
    const response = await GET(event);
    const data = (await response.json()) as any;

    const keys = Object.keys(data.events_today);
    expect(keys).toContain("rehearsal");
    expect(keys).toContain("concert");
    expect(keys).toContain("retreat");
    expect(keys).toContain("festival");
    expect(keys).toHaveLength(4);
  });
});

// ============================================================================
// No PII in response
// ============================================================================

describe("GET /api/internal/stats — no PII", () => {
  it("response contains only aggregate counts, no names or emails", async () => {
    const event = createMockEvent({
      apiKey: VALID_API_KEY,
      envApiKey: VALID_API_KEY,
    });
    const response = await GET(event);
    const text = await response.clone().text();

    // Should not contain any email-like pattern
    expect(text).not.toMatch(/@/);
    // Should not contain common PII field names
    expect(text).not.toMatch(/"email"/);
    expect(text).not.toMatch(/"name"/);
    expect(text).not.toMatch(/"member_id"/);
  });
});
