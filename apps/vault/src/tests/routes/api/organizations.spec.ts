// Tests for /api/organizations/[id] endpoint (Issue #185)
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import type { Organization } from "$lib/types";

// Mock SvelteKit error function
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

// Mock database
function createMockDb(
  config: {
    members?: Map<string, any>;
    organizations?: Map<string, any>;
  } = {},
) {
  const members = config.members ?? new Map();
  const organizations = config.organizations ?? new Map();

  return {
    prepare: (query: string) => {
      const statement = {
        _params: [] as unknown[],
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
            const id = statement._params?.[0] as string;
            const memberData = members.get(id);
            if (!memberData) return null;
            return {
              id: memberData.id,
              email_id: memberData.email_id,
              name: memberData.name,
              nickname: memberData.nickname ?? null,
              email_contact: memberData.email_contact ?? null,
              invited_by: memberData.invited_by ?? null,
              joined_at: memberData.joined_at ?? new Date().toISOString(),
            };
          }
          // Organization lookup
          if (query.includes("FROM organizations WHERE id")) {
            const id = statement._params?.[0] as string;
            const org = organizations.get(id);
            return org ?? null;
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
          }
          return { results: [] };
        },
        run: async () => {
          // Update organization
          if (query.includes("UPDATE organizations SET")) {
            const id = statement._params?.[
              statement._params.length - 1
            ] as string;
            const org = organizations.get(id);
            if (!org) return { meta: { changes: 0 } };

            // Parse which fields are being updated
            let paramIndex = 0;
            if (query.includes("language = ?")) {
              org.language = statement._params[paramIndex++];
            }
            if (query.includes("locale = ?")) {
              org.locale = statement._params[paramIndex++];
            }
            if (query.includes("timezone = ?")) {
              org.timezone = statement._params[paramIndex++];
            }

            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return statement;
    },
  };
}

function createMockCookies(memberId: string | null) {
  return {
    get: (name: string) => (name === "member_id" ? memberId : null),
    set: vi.fn(),
    delete: vi.fn(),
    serialize: vi.fn(),
    getAll: vi.fn(),
  };
}

function createAdminMember(id: string = "admin-123") {
  return {
    id,
    email_id: "admin@test.com",
    name: "Admin User",
    roles: ["admin"],
  };
}

function createOwnerMember(id: string = "owner-123") {
  return {
    id,
    email_id: "owner@test.com",
    name: "Owner User",
    roles: ["owner"],
  };
}

function createRegularMember(id: string = "member-123") {
  return {
    id,
    email_id: "member@test.com",
    name: "Regular User",
    roles: [],
  };
}

function createOrganization(id: string = "org-123"): {
  id: string;
  name: string;
  subdomain: string;
  type: string;
  contact_email: string;
  created_at: string;
  language: string | null;
  locale: string | null;
  timezone: string | null;
} {
  return {
    id,
    name: "Test Choir",
    subdomain: "test",
    type: "collective",
    contact_email: "choir@test.com",
    created_at: new Date().toISOString(),
    language: null,
    locale: null,
    timezone: null,
  };
}

describe("PATCH /api/organizations/[id]", () => {
  it("updates organization i18n settings for admin", async () => {
    const admin = createAdminMember();
    const org = createOrganization("org-123");
    const members = new Map([[admin.id, admin]]);
    const organizations = new Map([[org.id, org]]);

    const { PATCH } =
      await import("$lib/../routes/api/organizations/[id]/+server");

    const event = {
      params: { id: "org-123" },
      request: new Request("http://localhost/api/organizations/org-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "et",
          locale: "et-EE",
          timezone: "Europe/Tallinn",
        }),
      }),
      platform: { env: { DB: createMockDb({ members, organizations }) } },
      cookies: createMockCookies(admin.id),
      locals: { org: { id: "org-123" } },
    } as unknown as RequestEvent;

    const response = await PATCH(event);
    const data = (await response.json()) as Organization;

    expect(response.status).toBe(200);
    expect(data.language).toBe("et");
    expect(data.locale).toBe("et-EE");
    expect(data.timezone).toBe("Europe/Tallinn");
  });

  it("updates organization i18n settings for owner", async () => {
    const owner = createOwnerMember();
    const org = createOrganization("org-123");
    const members = new Map([[owner.id, owner]]);
    const organizations = new Map([[org.id, org]]);

    const { PATCH } =
      await import("$lib/../routes/api/organizations/[id]/+server");

    const event = {
      params: { id: "org-123" },
      request: new Request("http://localhost/api/organizations/org-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: "en",
          locale: "en-GB",
          timezone: "Europe/London",
        }),
      }),
      platform: { env: { DB: createMockDb({ members, organizations }) } },
      cookies: createMockCookies(owner.id),
      locals: { org: { id: "org-123" } },
    } as unknown as RequestEvent;

    const response = await PATCH(event);
    const data = (await response.json()) as Organization;

    expect(response.status).toBe(200);
    expect(data.language).toBe("en");
  });

  it("allows setting values to null (system default)", async () => {
    const admin = createAdminMember();
    const org = createOrganization("org-123");
    org.language = "et";
    org.locale = "et-EE";
    org.timezone = "Europe/Tallinn";

    const members = new Map([[admin.id, admin]]);
    const organizations = new Map([[org.id, org]]);

    const { PATCH } =
      await import("$lib/../routes/api/organizations/[id]/+server");

    const event = {
      params: { id: "org-123" },
      request: new Request("http://localhost/api/organizations/org-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: null,
          locale: null,
          timezone: null,
        }),
      }),
      platform: { env: { DB: createMockDb({ members, organizations }) } },
      cookies: createMockCookies(admin.id),
      locals: { org: { id: "org-123" } },
    } as unknown as RequestEvent;

    const response = await PATCH(event);
    const data = (await response.json()) as Organization;

    expect(response.status).toBe(200);
    expect(data.language).toBeNull();
    expect(data.locale).toBeNull();
    expect(data.timezone).toBeNull();
  });

  it("rejects non-admin users with 403", async () => {
    const member = createRegularMember();
    const org = createOrganization("org-123");
    const members = new Map([[member.id, member]]);
    const organizations = new Map([[org.id, org]]);

    const { PATCH } =
      await import("$lib/../routes/api/organizations/[id]/+server");

    const event = {
      params: { id: "org-123" },
      request: new Request("http://localhost/api/organizations/org-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "et" }),
      }),
      platform: { env: { DB: createMockDb({ members, organizations }) } },
      cookies: createMockCookies(member.id),
      locals: { org: { id: "org-123" } },
    } as unknown as RequestEvent;

    await expect(PATCH(event)).rejects.toThrow();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const org = createOrganization("org-123");
    const organizations = new Map([[org.id, org]]);

    const { PATCH } =
      await import("$lib/../routes/api/organizations/[id]/+server");

    const event = {
      params: { id: "org-123" },
      request: new Request("http://localhost/api/organizations/org-123", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "et" }),
      }),
      platform: { env: { DB: createMockDb({ organizations }) } },
      cookies: createMockCookies(null),
      locals: { org: { id: "org-123" } },
    } as unknown as RequestEvent;

    await expect(PATCH(event)).rejects.toThrow();
  });

  it("rejects updates to other organizations with 403", async () => {
    const admin = createAdminMember();
    const org = createOrganization("org-123");
    const members = new Map([[admin.id, admin]]);
    const organizations = new Map([[org.id, org]]);

    const { PATCH } =
      await import("$lib/../routes/api/organizations/[id]/+server");

    // Try to update org-456 while logged into org-123
    const event = {
      params: { id: "org-456" }, // Different org!
      request: new Request("http://localhost/api/organizations/org-456", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language: "et" }),
      }),
      platform: { env: { DB: createMockDb({ members, organizations }) } },
      cookies: createMockCookies(admin.id),
      locals: { org: { id: "org-123" } }, // Current org is different
    } as unknown as RequestEvent;

    await expect(PATCH(event)).rejects.toThrow(
      "Cannot update other organizations",
    );
  });
});

describe("GET /api/organizations/[id]", () => {
  it("returns organization for admin", async () => {
    const admin = createAdminMember();
    const org = createOrganization("org-123");
    org.language = "et";
    org.locale = "et-EE";
    org.timezone = "Europe/Tallinn";

    const members = new Map([[admin.id, admin]]);
    const organizations = new Map([[org.id, org]]);

    const { GET } =
      await import("$lib/../routes/api/organizations/[id]/+server");

    const event = {
      params: { id: "org-123" },
      platform: { env: { DB: createMockDb({ members, organizations }) } },
      cookies: createMockCookies(admin.id),
      locals: { org: { id: "org-123" } },
    } as unknown as RequestEvent;

    const response = await GET(event);
    const data = (await response.json()) as Organization;

    expect(response.status).toBe(200);
    expect(data.id).toBe("org-123");
    expect(data.language).toBe("et");
    expect(data.locale).toBe("et-EE");
    expect(data.timezone).toBe("Europe/Tallinn");
  });

  it("rejects non-admin users with 403", async () => {
    const member = createRegularMember();
    const org = createOrganization("org-123");
    const members = new Map([[member.id, member]]);
    const organizations = new Map([[org.id, org]]);

    const { GET } =
      await import("$lib/../routes/api/organizations/[id]/+server");

    const event = {
      params: { id: "org-123" },
      platform: { env: { DB: createMockDb({ members, organizations }) } },
      cookies: createMockCookies(member.id),
      locals: { org: { id: "org-123" } },
    } as unknown as RequestEvent;

    await expect(GET(event)).rejects.toThrow();
  });

  it("rejects viewing other organizations with 403", async () => {
    const admin = createAdminMember();
    const org = createOrganization("org-123");
    const members = new Map([[admin.id, admin]]);
    const organizations = new Map([[org.id, org]]);

    const { GET } =
      await import("$lib/../routes/api/organizations/[id]/+server");

    const event = {
      params: { id: "org-456" }, // Different org!
      platform: { env: { DB: createMockDb({ members, organizations }) } },
      cookies: createMockCookies(admin.id),
      locals: { org: { id: "org-123" } },
    } as unknown as RequestEvent;

    await expect(GET(event)).rejects.toThrow("Cannot view other organizations");
  });
});
