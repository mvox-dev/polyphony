// Tests for PATCH /api/profile endpoint
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import { PATCH } from "../../../routes/api/profile/+server";
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

// Mock authenticated member
const mockMember = {
  id: "member-id",
  email_id: "user@test.com",
  email_contact: null,
  name: "Test User",
  nickname: null,
  roles: [],
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
    route: { id: "/api/profile" },
    request: new Request("http://localhost", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    platform: {
      env: { DB: mockDb },
    },
    cookies: {
      get: vi.fn(() => (isAuthenticated ? "mock-token" : undefined)),
    },
    locals: { org: { id: createOrgId("test-org") } } as any,
  } as any;
}

// Mock auth middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
}));

// Mock members DB functions
vi.mock("$lib/server/db/members", () => ({
  updateMemberName: vi.fn(),
}));

describe("PATCH /api/profile", () => {
  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mocks
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockMember);
  });

  it("updates member name successfully", async () => {
    const { updateMemberName } = await import("$lib/server/db/members");
    const updatedMember = { ...mockMember, name: "New Name" };
    vi.mocked(updateMemberName).mockResolvedValue(updatedMember);

    const event = createMockEvent({ name: "New Name" });
    const response = await PATCH(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as any;
    expect(data).toMatchObject({
      id: "member-id",
      name: "New Name",
    });
    expect(updateMemberName).toHaveBeenCalledWith(
      mockDb,
      "member-id",
      "New Name",
      "test-org",
    );
  });

  it("trims whitespace from name", async () => {
    const { updateMemberName } = await import("$lib/server/db/members");
    const updatedMember = { ...mockMember, name: "New Name" };
    vi.mocked(updateMemberName).mockResolvedValue(updatedMember);

    const event = createMockEvent({ name: "  New Name  " });
    await PATCH(event);

    expect(updateMemberName).toHaveBeenCalledWith(
      mockDb,
      "member-id",
      "New Name",
      "test-org",
    );
  });

  it("rejects empty name", async () => {
    const event = createMockEvent({ name: "" });
    const response = await PATCH(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Name is required");
  });

  it("rejects whitespace-only name", async () => {
    const event = createMockEvent({ name: "   " });
    const response = await PATCH(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Name cannot be empty");
  });

  it("rejects missing name field", async () => {
    const event = createMockEvent({});
    const response = await PATCH(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Name is required");
  });

  it("rejects non-string name", async () => {
    const event = createMockEvent({ name: 123 });
    const response = await PATCH(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Name is required");
  });

  it("returns 409 when name already exists", async () => {
    const { updateMemberName } = await import("$lib/server/db/members");
    vi.mocked(updateMemberName).mockRejectedValue(
      new Error('Member with name "Duplicate Name" already exists'),
    );

    const event = createMockEvent({ name: "Duplicate Name" });
    const response = await PATCH(event);

    expect(response.status).toBe(409);
    const data = (await response.json()) as any;
    expect(data.error).toBe("A member with this name already exists");
  });

  it("requires authentication", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockRejectedValue({
      status: 401,
      body: { message: "Authentication required" },
    });

    const event = createMockEvent({ name: "New Name" }, false);

    await expect(PATCH(event)).rejects.toThrow();
    expect(getAuthenticatedMember).toHaveBeenCalled();
  });

  it("handles database errors gracefully", async () => {
    const { updateMemberName } = await import("$lib/server/db/members");
    vi.mocked(updateMemberName).mockRejectedValue(
      new Error("Database connection failed"),
    );

    const event = createMockEvent({ name: "New Name" });
    const response = await PATCH(event);

    expect(response.status).toBe(500);
    const data = (await response.json()) as any;
    expect(data.error).toBe("Database connection failed");
  });

  it("preserves member data except name", async () => {
    const { updateMemberName } = await import("$lib/server/db/members");
    const updatedMember = {
      ...mockMember,
      name: "Updated Name",
      roles: ["librarian" as const],
      voices: [
        {
          id: "v1",
          name: "Tenor",
          abbreviation: "T",
          category: "vocal" as const,
          rangeGroup: "medium",
          displayOrder: 1,
          isActive: true,
        },
      ],
      sections: [
        {
          id: "s1",
          orgId: "org_crede_001",
          name: "Tenor 1",
          abbreviation: "T1",
          parentSectionId: null,
          displayOrder: 1,
          isActive: true,
        },
      ],
    };
    vi.mocked(updateMemberName).mockResolvedValue(updatedMember);

    const event = createMockEvent({ name: "Updated Name" });
    const response = await PATCH(event);

    const data = (await response.json()) as any;
    expect(data.id).toBe("member-id");
    expect(data.email_id).toBe("user@test.com");
    expect(data.roles).toEqual(["librarian"]);
    expect(data.voices).toHaveLength(1);
    expect(data.sections).toHaveLength(1);
  });
});
