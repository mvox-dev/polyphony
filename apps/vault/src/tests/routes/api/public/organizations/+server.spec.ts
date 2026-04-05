// Tests for /api/public/organizations endpoint
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  GET,
  POST,
} from "../../../../../routes/api/public/organizations/+server";
import type { RequestEvent } from "@sveltejs/kit";

// Helper: build a mock D1Database that also supports db.batch()
function makeMockDb(overrides?: Partial<D1Database>): D1Database {
  const prepared = {
    bind: vi.fn(function (this: unknown) {
      return { run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }) };
    }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    all: vi.fn().mockResolvedValue({ results: [] }),
    first: vi.fn().mockResolvedValue(null),
  };
  return {
    prepare: vi.fn(() => prepared),
    batch: vi.fn().mockResolvedValue([]),
    dump: vi.fn(),
    exec: vi.fn(),
    ...overrides,
  } as unknown as D1Database;
}

type OrgParams = Record<string, never>;
type OrgResponse =
  | { organizations: any[] }
  | { organization: any }
  | { error: string };

describe("GET /api/public/organizations", () => {
  let mockDB: D1Database;
  let mockEvent: Partial<RequestEvent<OrgParams>>;

  beforeEach(() => {
    const mockPrepare = vi.fn(() => ({
      all: vi.fn().mockResolvedValue({ results: [] }),
    }));
    mockDB = {
      prepare: mockPrepare,
    } as unknown as D1Database;

    mockEvent = {
      platform: { env: { DB: mockDB } },
    } as any;
  });

  it("returns empty array when no organizations exist", async () => {
    (mockDB.prepare as any)().all = vi.fn().mockResolvedValue({ results: [] });

    const response = await GET(mockEvent as any);
    const data = (await response.json()) as any;

    expect(data.organizations).toEqual([]);
  });

  it("returns list of all organizations", async () => {
    const mockOrgs = [
      {
        id: "org_1",
        name: "Test Choir",
        subdomain: "testchoir",
        type: "collective",
        contact_email: "test@example.com",
        created_at: "2026-01-01T00:00:00Z",
        language: null,
        locale: null,
        timezone: null,
      },
      {
        id: "org_2",
        name: "Another Choir",
        subdomain: "another",
        type: "umbrella",
        contact_email: "another@example.com",
        created_at: "2026-01-02T00:00:00Z",
        language: null,
        locale: null,
        timezone: null,
      },
    ];

    mockDB.prepare = vi.fn(() => ({
      all: vi.fn().mockResolvedValue({ results: mockOrgs }),
    })) as any;

    const response = await GET(mockEvent as any);
    const data = (await response.json()) as any;

    expect(data.organizations).toHaveLength(2);
    expect(data.organizations[0]).toMatchObject({
      id: "org_1",
      name: "Test Choir",
      subdomain: "testchoir",
      type: "collective",
      contactEmail: "test@example.com",
    });
  });

  it("returns 500 if database is unavailable", async () => {
    mockEvent.platform = { env: {} } as any;

    try {
      await GET(mockEvent as any);
      expect.fail("Should have thrown error");
    } catch (err: any) {
      expect(err.status).toBe(500);
    }
  });
});

describe("POST /api/public/organizations", () => {
  let mockDB: D1Database;
  let mockEvent: Partial<RequestEvent>;

  beforeEach(() => {
    mockDB = {
      prepare: vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
        })),
      })),
    } as unknown as D1Database;

    mockEvent = {
      request: {
        json: vi.fn(),
      } as unknown as Request,
      platform: { env: { DB: mockDB } },
    } as any;
  });

  it("creates a new collective organization", async () => {
    const input = {
      name: "New Choir",
      subdomain: "newchoir",
      type: "collective",
      contactEmail: "new@example.com",
    };

    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue(input);

    const response = await POST(mockEvent as any);
    const data = (await response.json()) as any;

    expect(response.status).toBe(201);
    expect(data.organization).toMatchObject({
      name: "New Choir",
      subdomain: "newchoir",
      type: "collective",
      contactEmail: "new@example.com",
    });
    expect(data.organization.id).toMatch(/^org_/);
    expect(data.organization.createdAt).toBeTruthy();
  });

  it("creates an owner member for the contact email", async () => {
    const queries: string[] = [];
    const bindings: any[][] = [];

    mockDB.prepare = vi.fn((sql: string) => {
      queries.push(sql);
      return {
        bind: vi.fn((...args: any[]) => {
          bindings.push(args);
          return {
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          };
        }),
      };
    }) as any;

    const input = {
      name: "New Choir",
      subdomain: "newchoir",
      type: "collective",
      contactEmail: "owner@example.com",
    };

    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue(input);

    const response = await POST(mockEvent as any);
    expect(response.status).toBe(201);

    const data = (await response.json()) as any;
    expect(data.owner).toBeDefined();
    expect(data.owner.email).toBe("owner@example.com");
    expect(data.owner.memberId).toBeTruthy();

    // Verify member INSERT was called
    const memberInsert = queries.find((q) => q.includes("INSERT INTO members"));
    expect(memberInsert).toBeTruthy();

    // Verify member_organizations INSERT was called
    const orgMemberInsert = queries.find((q) =>
      q.includes("INSERT INTO member_organizations"),
    );
    expect(orgMemberInsert).toBeTruthy();

    // Verify member_roles INSERT with 'owner' role was called
    const roleInsert = queries.find((q) =>
      q.includes("INSERT INTO member_roles"),
    );
    expect(roleInsert).toBeTruthy();
    const roleBindings = bindings[queries.indexOf(roleInsert!)];
    expect(roleBindings).toContain("owner");
  });

  it("creates a new umbrella organization", async () => {
    const input = {
      name: "Umbrella Org",
      subdomain: "umbrella",
      type: "umbrella",
      contactEmail: "umbrella@example.com",
    };

    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue(input);

    const response = await POST(mockEvent as any);
    const data = (await response.json()) as any;

    expect(response.status).toBe(201);
    expect(data.organization.type).toBe("umbrella");
  });

  it("normalizes subdomain to lowercase", async () => {
    const input = {
      name: "Test Choir",
      subdomain: "TestChoir",
      type: "collective",
      contactEmail: "test@example.com",
    };

    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue(input);

    const response = await POST(mockEvent as any);
    const data = (await response.json()) as any;

    expect(data.organization.subdomain).toBe("testchoir");
  });

  describe("Validation", () => {
    it("rejects invalid JSON", async () => {
      (mockEvent.request!.json as any) = vi
        .fn()
        .mockRejectedValue(new Error("Invalid JSON"));

      try {
        await POST(mockEvent as any);
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.status).toBe(400);
      }
    });

    it("rejects missing name", async () => {
      (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
        subdomain: "test",
        type: "collective",
        contactEmail: "test@example.com",
      });

      try {
        await POST(mockEvent as any);
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.status).toBe(400);
      }
    });

    it("rejects empty name", async () => {
      (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
        name: "   ",
        subdomain: "test",
        type: "collective",
        contactEmail: "test@example.com",
      });

      try {
        await POST(mockEvent as any);
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.status).toBe(400);
      }
    });

    it("rejects missing subdomain", async () => {
      (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
        name: "Test",
        type: "collective",
        contactEmail: "test@example.com",
      });

      try {
        await POST(mockEvent as any);
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.status).toBe(400);
      }
    });

    it("rejects invalid type", async () => {
      (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
        name: "Test",
        subdomain: "test",
        type: "invalid",
        contactEmail: "test@example.com",
      });

      try {
        await POST(mockEvent as any);
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.status).toBe(400);
      }
    });

    it("rejects missing contactEmail", async () => {
      (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
        name: "Test",
        subdomain: "test",
        type: "collective",
      });

      try {
        await POST(mockEvent as any);
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.status).toBe(400);
      }
    });
  });

  describe("Unique constraint handling", () => {
    it("returns 409 if subdomain already exists", async () => {
      const input = {
        name: "Duplicate",
        subdomain: "existing",
        type: "collective" as const,
        contactEmail: "test@example.com",
      };

      (mockEvent.request!.json as any) = vi.fn().mockResolvedValue(input);

      // Simulate unique constraint violation
      (mockDB.prepare as any) = vi.fn(() => ({
        bind: vi.fn(() => ({
          run: vi
            .fn()
            .mockRejectedValue(
              new Error("UNIQUE constraint failed: organizations.subdomain"),
            ),
        })),
      }));

      try {
        await POST(mockEvent as any);
        expect.fail("Should have thrown error");
      } catch (err: any) {
        expect(err.status).toBe(409);
      }
    });
  });

  it("returns 500 if database is unavailable", async () => {
    mockEvent.platform = { env: {} } as any;

    try {
      await POST(mockEvent as any);
      expect.fail("Should have thrown error");
    } catch (err: any) {
      expect(err.status).toBe(500);
    }
  });
});

// ─── POST with sections preset (#340) ────────────────────────────────────────

describe("POST /api/public/organizations — with sections preset", () => {
  let mockEvent: Partial<RequestEvent>;

  beforeEach(() => {
    mockEvent = {
      request: { json: vi.fn() } as unknown as Request,
      platform: { env: { DB: makeMockDb() } },
    } as any;
  });

  it("accepts a valid sections preset ID and returns 201", async () => {
    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Test Choir",
      subdomain: "testchoir",
      type: "collective",
      contactEmail: "test@example.com",
      sections: "satb",
    });

    const response = await POST(mockEvent as any);
    expect(response.status).toBe(201);
  });

  it("calls db.batch() to insert sections when preset is provided", async () => {
    const db = makeMockDb();
    mockEvent.platform = { env: { DB: db } } as any;

    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Test Choir",
      subdomain: "testchoir",
      type: "collective",
      contactEmail: "test@example.com",
      sections: "satb",
    });

    await POST(mockEvent as any);

    // createPresetSections calls db.batch() at least once for the INSERT pass
    expect(db.batch).toHaveBeenCalled();
  });

  it("calls db.batch() twice for hierarchical preset (inserts + parent updates)", async () => {
    const db = makeMockDb();
    mockEvent.platform = { env: { DB: db } } as any;

    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Test Choir",
      subdomain: "testchoir",
      type: "collective",
      contactEmail: "test@example.com",
      sections: "ssaattbb",
    });

    await POST(mockEvent as any);

    // First batch: all 12 INSERT statements
    // Second batch: parent_section_id UPDATE statements for 8 children
    expect((db.batch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it("first batch for ssaattbb contains 12 prepared statements", async () => {
    const batchCalls: D1PreparedStatement[][] = [];
    const db = makeMockDb({
      batch: vi.fn((stmts: D1PreparedStatement[]) => {
        batchCalls.push(stmts);
        return Promise.resolve([]);
      }),
    });
    mockEvent.platform = { env: { DB: db } } as any;

    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Test Choir",
      subdomain: "testchoir",
      type: "collective",
      contactEmail: "test@example.com",
      sections: "ssaattbb",
    });

    await POST(mockEvent as any);

    expect(batchCalls[0]).toHaveLength(12);
  });

  it("second batch for ssaattbb contains 8 parent update statements", async () => {
    const batchCalls: D1PreparedStatement[][] = [];
    const db = makeMockDb({
      batch: vi.fn((stmts: D1PreparedStatement[]) => {
        batchCalls.push(stmts);
        return Promise.resolve([]);
      }),
    });
    mockEvent.platform = { env: { DB: db } } as any;

    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Test Choir",
      subdomain: "testchoir",
      type: "collective",
      contactEmail: "test@example.com",
      sections: "ssaattbb",
    });

    await POST(mockEvent as any);

    // ssaattbb has 8 child sections (S1, S2, A1, A2, T1, T2, B1, B2)
    expect(batchCalls[1]).toHaveLength(8);
  });

  it("rejects invalid sections preset ID with 400", async () => {
    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Test Choir",
      subdomain: "testchoir",
      type: "collective",
      contactEmail: "test@example.com",
      sections: "bagpipe-choir",
    });

    await expect(POST(mockEvent as any)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects non-string sections value with 400", async () => {
    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Test Choir",
      subdomain: "testchoir",
      type: "collective",
      contactEmail: "test@example.com",
      sections: 42,
    });

    await expect(POST(mockEvent as any)).rejects.toMatchObject({ status: 400 });
  });

  it("rejects sections: null with 400", async () => {
    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Test Choir",
      subdomain: "testchoir",
      type: "collective",
      contactEmail: "test@example.com",
      sections: null,
    });

    await expect(POST(mockEvent as any)).rejects.toMatchObject({ status: 400 });
  });
});

// ─── POST without sections — backward compatibility (#340) ───────────────────

describe("POST /api/public/organizations — without sections (backward compat)", () => {
  let mockDB: D1Database;
  let mockEvent: Partial<RequestEvent>;

  beforeEach(() => {
    mockDB = makeMockDb();
    mockEvent = {
      request: { json: vi.fn() } as unknown as Request,
      platform: { env: { DB: mockDB } },
    } as any;
  });

  it("returns 201 when sections field is absent", async () => {
    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Classic Choir",
      subdomain: "classic",
      type: "collective",
      contactEmail: "classic@example.com",
    });

    const response = await POST(mockEvent as any);
    expect(response.status).toBe(201);
  });

  it("does NOT call db.batch() for section inserts when sections is absent", async () => {
    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Classic Choir",
      subdomain: "classic",
      type: "collective",
      contactEmail: "classic@example.com",
    });

    await POST(mockEvent as any);

    expect(mockDB.batch).not.toHaveBeenCalled();
  });

  it("still creates organization and owner member", async () => {
    const queries: string[] = [];
    const db = makeMockDb({
      prepare: vi.fn((sql: string) => {
        queries.push(sql);
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
          })),
        } as unknown as D1PreparedStatement;
      }),
    });
    mockEvent.platform = { env: { DB: db } } as any;

    (mockEvent.request!.json as any) = vi.fn().mockResolvedValue({
      name: "Classic Choir",
      subdomain: "classic",
      type: "collective",
      contactEmail: "classic@example.com",
    });

    const response = await POST(mockEvent as any);
    expect(response.status).toBe(201);

    expect(queries.some((q) => q.includes("INSERT INTO members"))).toBe(true);
    expect(queries.some((q) => q.includes("INSERT INTO member_roles"))).toBe(
      true,
    );
  });
});
