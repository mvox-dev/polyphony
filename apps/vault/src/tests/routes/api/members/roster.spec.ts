// Tests for POST /api/members/roster endpoint
import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "../../../../routes/api/members/roster/+server";
import type { RequestEvent } from "@sveltejs/kit";

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
    json: (data: any, options?: any) =>
      new Response(JSON.stringify(data), {
        status: options?.status || 200,
        headers: { "content-type": "application/json" },
      }),
  };
});

// Mock database
const mockDb = {
  prepare: vi.fn(() => ({
    bind: vi.fn(() => ({
      run: vi.fn(),
      first: vi.fn(),
      all: vi.fn(),
    })),
  })),
};

// Mock authenticated member (admin)
const mockAdminMember = {
  id: "admin-id",
  email_id: "admin@test.com",
  email_contact: null,
  name: "Admin User",
  nickname: null,
  roles: ["admin" as const],
  voices: [],
  sections: [],
  invited_by: null,
  joined_at: "2024-01-01T00:00:00Z",
};

// Helper to create mock request event
function createMockEvent(
  body: any,
  isAuthenticated: boolean = true,
): RequestEvent<any, any> {
  return {
    route: { id: "/api/members/roster" },
    request: new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    platform: {
      env: { DB: mockDb },
    },
    cookies: {
      get: vi.fn(() => (isAuthenticated ? "mock-token" : undefined)),
    },
    locals: {
      org: { id: "org_test_001" },
    },
  } as any;
}

// Mock auth middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

// Mock members DB functions
vi.mock("$lib/server/db/members", () => ({
  getMemberByName: vi.fn(),
  createRosterMember: vi.fn(),
}));

describe("POST /api/members/roster", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mocks
    const { getAuthenticatedMember, assertAdmin } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockAdminMember);
    vi.mocked(assertAdmin).mockImplementation(() => undefined);

    const { getMemberByName } = await import("$lib/server/db/members");
    vi.mocked(getMemberByName).mockResolvedValue(null); // Name available by default
  });

  it("creates roster member with name only", async () => {
    const { createRosterMember } = await import("$lib/server/db/members");
    const newMember = {
      id: "new-member-id",
      name: "John Doe",
      nickname: null,
      email_id: null,
      email_contact: null,
      roles: [],
      voices: [],
      sections: [],
      invited_by: "admin-id",
      joined_at: "2024-01-15T00:00:00Z",
    };
    vi.mocked(createRosterMember).mockResolvedValue(newMember);

    const event = createMockEvent({ name: "John Doe" });
    const response = await POST(event);

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data).toMatchObject({
      id: "new-member-id",
      name: "John Doe",
      emailContact: null,
      voices: [],
      sections: [],
    });
    expect(createRosterMember).toHaveBeenCalledWith(mockDb, {
      name: "John Doe",
      email_contact: undefined,
      voiceIds: undefined,
      sectionIds: undefined,
      addedBy: "admin-id",
      orgId: "org_test_001",
    });
  });

  it("creates roster member with all fields", async () => {
    const { createRosterMember } = await import("$lib/server/db/members");
    const newMember = {
      id: "new-member-id",
      name: "Jane Smith",
      nickname: null,
      email_id: null,
      email_contact: "jane@example.com",
      roles: [],
      voices: [
        {
          id: "voice1",
          name: "Soprano",
          abbreviation: "S",
          category: "vocal" as const,
          rangeGroup: "upper",
          displayOrder: 1,
          isActive: true,
        },
      ],
      sections: [
        {
          id: "sec1",
          orgId: "org_crede_001",
          name: "Soprano 1",
          abbreviation: "S1",
          parentSectionId: null,
          displayOrder: 1,
          isActive: true,
        },
      ],
      invited_by: "admin-id",
      joined_at: "2024-01-15T00:00:00Z",
    };
    vi.mocked(createRosterMember).mockResolvedValue(newMember);

    const event = createMockEvent({
      name: "Jane Smith",
      emailContact: "jane@example.com",
      voiceIds: ["voice1"],
      sectionIds: ["sec1"],
    });
    const response = await POST(event);

    expect(response.status).toBe(201);
    const data = (await response.json()) as any;
    expect(data).toMatchObject({
      id: "new-member-id",
      name: "Jane Smith",
      emailContact: "jane@example.com",
    });
    expect(createRosterMember).toHaveBeenCalledWith(mockDb, {
      name: "Jane Smith",
      email_contact: "jane@example.com",
      voiceIds: ["voice1"],
      sectionIds: ["sec1"],
      addedBy: "admin-id",
      orgId: "org_test_001",
    });
  });

  it("rejects when name is missing", async () => {
    const event = createMockEvent({ emailContact: "test@example.com" });
    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Name is required");
  });

  it("rejects when name is empty string", async () => {
    const event = createMockEvent({ name: "   " });
    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Name is required");
  });

  it("rejects invalid email format", async () => {
    const event = createMockEvent({
      name: "John Doe",
      emailContact: "not-an-email",
    });
    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Invalid email format");
  });

  it("rejects duplicate name (case-insensitive)", async () => {
    // Mock db.prepare().bind().first() to return an existing member
    const mockFirst = vi.fn().mockResolvedValue({ id: "existing-id" });
    mockDb.prepare.mockReturnValueOnce({
      bind: vi.fn(() => ({
        first: mockFirst,
        run: vi.fn(),
        all: vi.fn(),
      })),
    });

    const event = createMockEvent({ name: "John Doe" });
    const response = await POST(event);

    expect(response.status).toBe(409);
    const data = (await response.json()) as any;
    expect(data.error).toBe('Member with name "John Doe" already exists');
  });

  it("requires authentication", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockRejectedValue({
      status: 401,
      body: { message: "Authentication required" },
    });

    const event = createMockEvent({ name: "John Doe" }, false);

    await expect(POST(event)).rejects.toThrow();
    expect(getAuthenticatedMember).toHaveBeenCalled();
  });

  it("requires admin role", async () => {
    const { assertAdmin } = await import("$lib/server/auth/middleware");
    vi.mocked(assertAdmin).mockImplementation(() => {
      const err = new Error("Admin or owner role required");
      (err as any).status = 403;
      throw err;
    });

    const event = createMockEvent({ name: "John Doe" });

    await expect(POST(event)).rejects.toThrow("Admin or owner role required");
    expect(assertAdmin).toHaveBeenCalled();
  });

  it("handles database errors gracefully", async () => {
    const { createRosterMember } = await import("$lib/server/db/members");
    vi.mocked(createRosterMember).mockRejectedValue(
      new Error("Database connection failed"),
    );

    const event = createMockEvent({ name: "John Doe" });
    const response = await POST(event);

    expect(response.status).toBe(500);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Database connection failed");
  });

  it("trims whitespace from name and email", async () => {
    const { createRosterMember } = await import("$lib/server/db/members");
    const newMember = {
      id: "new-member-id",
      name: "John Doe",
      nickname: null,
      email_id: null,
      email_contact: "john@example.com",
      roles: [],
      voices: [],
      sections: [],
      invited_by: "admin-id",
      joined_at: "2024-01-15T00:00:00Z",
    };
    vi.mocked(createRosterMember).mockResolvedValue(newMember);

    const event = createMockEvent({
      name: "  John Doe  ",
      emailContact: "  john@example.com  ",
    });
    await POST(event);

    expect(createRosterMember).toHaveBeenCalledWith(mockDb, {
      name: "John Doe",
      email_contact: "john@example.com",
      voiceIds: undefined,
      sectionIds: undefined,
      addedBy: "admin-id",
      orgId: "org_test_001",
    });
  });

  it("creates roster member with pre-assigned roles", async () => {
    const { createRosterMember } = await import("$lib/server/db/members");
    const newMember = {
      id: "new-member-id",
      name: "Future Admin",
      nickname: null,
      email_id: null,
      email_contact: null,
      roles: ["admin" as const, "librarian" as const],
      voices: [],
      sections: [],
      invited_by: "admin-id",
      joined_at: "2024-01-15T00:00:00Z",
    };
    vi.mocked(createRosterMember).mockResolvedValue(newMember);

    const event = createMockEvent({
      name: "Future Admin",
      roles: ["admin", "librarian"],
    });
    const response = await POST(event);

    expect(response.status).toBe(201);
    const data = (await response.json()) as any;
    expect(data.roles).toEqual(["admin", "librarian"]);
    expect(createRosterMember).toHaveBeenCalledWith(mockDb, {
      name: "Future Admin",
      email_contact: undefined,
      roles: ["admin", "librarian"],
      voiceIds: undefined,
      sectionIds: undefined,
      addedBy: "admin-id",
      orgId: "org_test_001",
    });
  });

  it("rejects invalid role values", async () => {
    const event = createMockEvent({
      name: "Bad Roles",
      roles: ["admin", "superuser"],
    });
    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toContain("Invalid role");
  });

  it("rejects owner role when current user is not owner", async () => {
    // mockAdminMember has roles: ['admin'], not 'owner'
    const event = createMockEvent({
      name: "Wants Owner",
      roles: ["owner"],
    });
    const response = await POST(event);

    expect(response.status).toBe(403);
    const data = (await response.json()) as any;
    expect(data.error).toContain("owner");
  });

  it("allows owner role when current user is owner", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue({
      ...mockAdminMember,
      roles: ["owner" as const, "admin" as const],
    });

    const { createRosterMember } = await import("$lib/server/db/members");
    const newMember = {
      id: "new-member-id",
      name: "New Owner",
      nickname: null,
      email_id: null,
      email_contact: null,
      roles: ["owner" as const],
      voices: [],
      sections: [],
      invited_by: "admin-id",
      joined_at: "2024-01-15T00:00:00Z",
    };
    vi.mocked(createRosterMember).mockResolvedValue(newMember);

    const event = createMockEvent({
      name: "New Owner",
      roles: ["owner"],
    });
    const response = await POST(event);

    expect(response.status).toBe(201);
    const data = (await response.json()) as any;
    expect(data.roles).toEqual(["owner"]);
  });

  it("handles empty emailContact string as undefined", async () => {
    const { createRosterMember } = await import("$lib/server/db/members");
    const newMember = {
      id: "new-member-id",
      name: "John Doe",
      nickname: null,
      email_id: null,
      email_contact: null,
      roles: [],
      voices: [],
      sections: [],
      invited_by: "admin-id",
      joined_at: "2024-01-15T00:00:00Z",
    };
    vi.mocked(createRosterMember).mockResolvedValue(newMember);

    const event = createMockEvent({
      name: "John Doe",
      emailContact: "   ", // Empty after trim
    });
    await POST(event);

    expect(createRosterMember).toHaveBeenCalledWith(mockDb, {
      name: "John Doe",
      email_contact: undefined,
      voiceIds: undefined,
      sectionIds: undefined,
      addedBy: "admin-id",
      orgId: "org_test_001",
    });
  });
});
