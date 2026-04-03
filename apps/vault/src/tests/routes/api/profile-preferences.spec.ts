// Tests for /api/profile/preferences endpoint (Issue #186)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";
import type { MemberPreferences } from "$lib/types";

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

// Mock authenticated member
const mockMember = {
  id: "member-123",
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

// Mock preferences
const mockPreferences: MemberPreferences = {
  memberId: "member-123",
  language: "et",
  locale: "et-EE",
  timezone: "Europe/Tallinn",
  updatedAt: "2024-01-15T00:00:00Z",
};

// Mock auth middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
}));

// Mock member preferences DB functions
vi.mock("$lib/server/db/member-preferences", () => ({
  getMemberPreferences: vi.fn(),
  setMemberPreferences: vi.fn(),
}));

// Helper to create mock request event
function createMockEvent(
  method: "GET" | "PATCH",
  body?: any,
  isAuthenticated: boolean = true,
): RequestEvent<any, any> {
  const request =
    method === "GET"
      ? new Request("http://localhost/api/profile/preferences", { method })
      : new Request("http://localhost/api/profile/preferences", {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

  return {
    route: { id: "/api/profile/preferences" },
    request,
    platform: {
      env: { DB: {} },
    },
    cookies: {
      get: vi.fn(() => (isAuthenticated ? mockMember.id : undefined)),
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: { org: { id: createOrgId("test-org") } } as any,
  } as any;
}

describe("GET /api/profile/preferences", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockMember);
  });

  it("returns member preferences for authenticated user", async () => {
    const { getMemberPreferences } =
      await import("$lib/server/db/member-preferences");
    vi.mocked(getMemberPreferences).mockResolvedValue(mockPreferences);

    const { GET } =
      await import("$lib/../routes/api/profile/preferences/+server");
    const event = createMockEvent("GET");
    const response = await GET(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as MemberPreferences;
    expect(data.language).toBe("et");
    expect(data.locale).toBe("et-EE");
    expect(data.timezone).toBe("Europe/Tallinn");
  });

  it("returns null when no preferences exist", async () => {
    const { getMemberPreferences } =
      await import("$lib/server/db/member-preferences");
    vi.mocked(getMemberPreferences).mockResolvedValue(null);

    const { GET } =
      await import("$lib/../routes/api/profile/preferences/+server");
    const event = createMockEvent("GET");
    const response = await GET(event);

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toBeNull();
  });

  it("rejects unauthenticated requests with 401", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockRejectedValue(
      Object.assign(new Error("Not authenticated"), { status: 401 }),
    );

    const { GET } =
      await import("$lib/../routes/api/profile/preferences/+server");
    const event = createMockEvent("GET", undefined, false);

    await expect(GET(event)).rejects.toThrow();
  });
});

describe("PATCH /api/profile/preferences", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockResolvedValue(mockMember);
  });

  it("updates member preferences successfully", async () => {
    const { setMemberPreferences } =
      await import("$lib/server/db/member-preferences");
    const updatedPrefs: MemberPreferences = {
      memberId: "member-123",
      language: "en",
      locale: "en-US",
      timezone: "America/New_York",
      updatedAt: "2024-01-20T00:00:00Z",
    };
    vi.mocked(setMemberPreferences).mockResolvedValue(updatedPrefs);

    const { PATCH } =
      await import("$lib/../routes/api/profile/preferences/+server");
    const event = createMockEvent("PATCH", {
      language: "en",
      locale: "en-US",
      timezone: "America/New_York",
    });
    const response = await PATCH(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as MemberPreferences;
    expect(data.language).toBe("en");
    expect(data.locale).toBe("en-US");
    expect(data.timezone).toBe("America/New_York");

    // Verify PARAGLIDE_LOCALE cookie was set
    expect(event.cookies.set).toHaveBeenCalledWith(
      "PARAGLIDE_LOCALE",
      "en",
      expect.objectContaining({ path: "/" }),
    );
  });

  it("allows setting values to null (use defaults)", async () => {
    const { setMemberPreferences } =
      await import("$lib/server/db/member-preferences");
    const clearedPrefs: MemberPreferences = {
      memberId: "member-123",
      language: null,
      locale: null,
      timezone: null,
      updatedAt: "2024-01-20T00:00:00Z",
    };
    vi.mocked(setMemberPreferences).mockResolvedValue(clearedPrefs);

    const { PATCH } =
      await import("$lib/../routes/api/profile/preferences/+server");
    const event = createMockEvent("PATCH", {
      language: null,
      locale: null,
      timezone: null,
    });
    const response = await PATCH(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as MemberPreferences;
    expect(data.language).toBeNull();
    expect(data.locale).toBeNull();
    expect(data.timezone).toBeNull();

    // Verify PARAGLIDE_LOCALE cookie was deleted
    expect(event.cookies.delete).toHaveBeenCalledWith("PARAGLIDE_LOCALE", {
      path: "/",
    });
  });

  it("allows partial updates", async () => {
    const { setMemberPreferences } =
      await import("$lib/server/db/member-preferences");
    const partialUpdate: MemberPreferences = {
      memberId: "member-123",
      language: "de",
      locale: "et-EE", // unchanged
      timezone: "Europe/Tallinn", // unchanged
      updatedAt: "2024-01-20T00:00:00Z",
    };
    vi.mocked(setMemberPreferences).mockResolvedValue(partialUpdate);

    const { PATCH } =
      await import("$lib/../routes/api/profile/preferences/+server");
    const event = createMockEvent("PATCH", { language: "de" }); // only language
    const response = await PATCH(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as MemberPreferences;
    expect(data.language).toBe("de");
  });

  it("rejects unauthenticated requests with 401", async () => {
    const { getAuthenticatedMember } =
      await import("$lib/server/auth/middleware");
    vi.mocked(getAuthenticatedMember).mockRejectedValue(
      Object.assign(new Error("Not authenticated"), { status: 401 }),
    );

    const { PATCH } =
      await import("$lib/../routes/api/profile/preferences/+server");
    const event = createMockEvent("PATCH", { language: "en" }, false);

    await expect(PATCH(event)).rejects.toThrow();
  });
});
