// Tests for /api/public/organizations endpoint
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  GET,
  POST,
} from "../../../../../routes/api/public/organizations/+server";
import type { RequestEvent } from "@sveltejs/kit";

// Helper: build a mock D1Database that supports bind().run(), bind().first(), and db.batch()
// bind().first() returns null by default (no existing member) — override prepare for specific behaviour
function makeMockDb(overrides?: Partial<D1Database>): D1Database {
  const bound = {
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: [] }),
  };
  const prepared = {
    bind: vi.fn(() => bound),
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
    mockDB = makeMockDb();

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
      const isSelect = sql.toUpperCase().startsWith("SELECT");
      return {
        bind: vi.fn((...args: any[]) => {
          bindings.push(args);
          return {
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
            first: vi.fn().mockResolvedValue(isSelect ? null : undefined),
          };
        }),
        first: vi.fn().mockResolvedValue(null),
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
        const isSelect = sql.toUpperCase().startsWith("SELECT");
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
            first: vi.fn().mockResolvedValue(isSelect ? null : undefined),
          })),
          first: vi.fn().mockResolvedValue(null),
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

// ─── POST — existing member registers new org (#343) ─────────────────────────
//
// When contactEmail already exists in the members table:
//   - member record must NOT be re-inserted (would violate UNIQUE email_id)
//   - existing member ID must be reused
//   - member_organizations row still created for the new org
//   - member_roles row still created (owner) for the new org
//   - sections preset still applied if provided
//   - response shape identical to new-member path

describe("POST /api/public/organizations — existing member (#343)", () => {
  const EXISTING_EMAIL = "returning@example.com";
  const EXISTING_MEMBER_ID = "member-already-exists-123";

  /** Build a db mock that returns an existing member row on SELECT by email */
  function makeDbWithExistingMember(extraOverrides?: Partial<D1Database>): {
    db: D1Database;
    queries: string[];
    bindArgs: unknown[][];
  } {
    const queries: string[] = [];
    const bindArgs: unknown[][] = [];

    const existingMemberRow = {
      id: EXISTING_MEMBER_ID,
      name: EXISTING_EMAIL,
      email_id: EXISTING_EMAIL,
      email_contact: null,
      invited_by: null,
    };

    const db = makeMockDb({
      prepare: vi.fn((sql: string) => {
        queries.push(sql);
        const isSelect =
          sql.toUpperCase().includes("SELECT") &&
          sql.toLowerCase().includes("email_id");
        return {
          bind: vi.fn((...args: unknown[]) => {
            bindArgs.push(args);
            return {
              run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
              first: vi
                .fn()
                .mockResolvedValue(isSelect ? existingMemberRow : null),
            };
          }),
          first: vi.fn().mockResolvedValue(isSelect ? existingMemberRow : null),
        } as unknown as D1PreparedStatement;
      }),
      ...extraOverrides,
    });

    return { db, queries, bindArgs };
  }

  it("returns 201 when contact email already exists", async () => {
    const { db } = makeDbWithExistingMember();
    const event = {
      request: {
        json: vi.fn().mockResolvedValue({
          name: "Second Choir",
          subdomain: "secondchoir",
          type: "collective",
          contactEmail: EXISTING_EMAIL,
        }),
      },
      platform: { env: { DB: db } },
    } as any;

    const response = await POST(event);
    expect(response.status).toBe(201);
  });

  it("reuses the existing member ID (no INSERT INTO members)", async () => {
    const { db, queries } = makeDbWithExistingMember();
    const event = {
      request: {
        json: vi.fn().mockResolvedValue({
          name: "Second Choir",
          subdomain: "secondchoir",
          type: "collective",
          contactEmail: EXISTING_EMAIL,
        }),
      },
      platform: { env: { DB: db } },
    } as any;

    await POST(event);

    const memberInserts = queries.filter(
      (q) =>
        q.toUpperCase().includes("INSERT") &&
        q.toLowerCase().includes("into members"),
    );
    expect(memberInserts).toHaveLength(0);
  });

  it("returns existing member ID in owner.memberId", async () => {
    const { db } = makeDbWithExistingMember();
    const event = {
      request: {
        json: vi.fn().mockResolvedValue({
          name: "Second Choir",
          subdomain: "secondchoir",
          type: "collective",
          contactEmail: EXISTING_EMAIL,
        }),
      },
      platform: { env: { DB: db } },
    } as any;

    const response = await POST(event);
    const data = (await response.json()) as any;

    expect(data.owner.memberId).toBe(EXISTING_MEMBER_ID);
    expect(data.owner.email).toBe(EXISTING_EMAIL);
  });

  it("inserts member_organizations row for the new org", async () => {
    const { db, queries } = makeDbWithExistingMember();
    const event = {
      request: {
        json: vi.fn().mockResolvedValue({
          name: "Second Choir",
          subdomain: "secondchoir",
          type: "collective",
          contactEmail: EXISTING_EMAIL,
        }),
      },
      platform: { env: { DB: db } },
    } as any;

    await POST(event);

    expect(
      queries.some((q) => q.includes("INSERT INTO member_organizations")),
    ).toBe(true);
  });

  it("grants owner role in the new org", async () => {
    const { db, queries, bindArgs } = makeDbWithExistingMember();
    const event = {
      request: {
        json: vi.fn().mockResolvedValue({
          name: "Second Choir",
          subdomain: "secondchoir",
          type: "collective",
          contactEmail: EXISTING_EMAIL,
        }),
      },
      platform: { env: { DB: db } },
    } as any;

    await POST(event);

    const roleInsertIdx = queries.findIndex((q) =>
      q.includes("INSERT INTO member_roles"),
    );
    expect(roleInsertIdx).toBeGreaterThanOrEqual(0);
    expect(bindArgs[roleInsertIdx]).toContain("owner");
  });

  it("still applies sections preset when existing member registers", async () => {
    const batchCalls: D1PreparedStatement[][] = [];
    const { db } = makeDbWithExistingMember({
      batch: vi.fn((stmts: D1PreparedStatement[]) => {
        batchCalls.push(stmts);
        return Promise.resolve([]);
      }),
    });
    const event = {
      request: {
        json: vi.fn().mockResolvedValue({
          name: "Second Choir",
          subdomain: "secondchoir",
          type: "collective",
          contactEmail: EXISTING_EMAIL,
          sections: "satb",
        }),
      },
      platform: { env: { DB: db } },
    } as any;

    await POST(event);

    // At least one batch call for section INSERTs
    expect(batchCalls.length).toBeGreaterThanOrEqual(1);
    // SATB has 4 sections, no parents → one batch of 4
    expect(batchCalls[0]).toHaveLength(4);
  });

  it("new member path still works (SELECT returns null → INSERT proceeds)", async () => {
    // Default makeMockDb has first() → null, so SELECT finds nothing → INSERT
    const queries: string[] = [];
    const db = makeMockDb({
      prepare: vi.fn((sql: string) => {
        queries.push(sql);
        return {
          bind: vi.fn(() => ({
            run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
            first: vi.fn().mockResolvedValue(null),
          })),
          first: vi.fn().mockResolvedValue(null),
        } as unknown as D1PreparedStatement;
      }),
    });

    const event = {
      request: {
        json: vi.fn().mockResolvedValue({
          name: "Brand New Choir",
          subdomain: "brandnew",
          type: "collective",
          contactEmail: "new@example.com",
        }),
      },
      platform: { env: { DB: db } },
    } as any;

    const response = await POST(event);
    expect(response.status).toBe(201);

    expect(
      queries.some(
        (q) =>
          q.toUpperCase().includes("INSERT") &&
          q.toLowerCase().includes("into members"),
      ),
    ).toBe(true);
  });
});
