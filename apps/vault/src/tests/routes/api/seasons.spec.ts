// Tests for Seasons API route handlers (#290)
// GET/POST /api/seasons  and  GET/PATCH/DELETE /api/seasons/[id]
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import type { RequestEvent } from "@sveltejs/kit";

// Mock SvelteKit BEFORE importing handlers
vi.mock("@sveltejs/kit", async () => {
  const actual = await vi.importActual("@sveltejs/kit");
  return {
    ...actual,
    error: (status: number, message: string) => {
      const err = new Error(message);
      (err as any).status = status;
      throw err;
    },
    json: (data: any, init?: ResponseInit) =>
      new Response(JSON.stringify(data), {
        status: (init as any)?.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
  };
});

// Mock middleware
vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(),
  assertAdmin: vi.fn(),
}));

// Mock DB functions
vi.mock("$lib/server/db/seasons", () => ({
  getAllSeasons: vi.fn(),
  getSeasonByDate: vi.fn(),
  createSeason: vi.fn(),
  getSeason: vi.fn(),
  getSeasonEvents: vi.fn(),
  updateSeason: vi.fn(),
  deleteSeason: vi.fn(),
}));

import {
  getAuthenticatedMember,
  assertAdmin,
} from "$lib/server/auth/middleware";
import {
  getAllSeasons,
  getSeasonByDate,
  createSeason,
  getSeason,
  getSeasonEvents,
  updateSeason,
  deleteSeason,
} from "$lib/server/db/seasons";
import { GET as GET_SEASONS, POST } from "../../../routes/api/seasons/+server";
import {
  GET as GET_SEASON,
  PATCH,
  DELETE,
} from "../../../routes/api/seasons/[id]/+server";

const mockGetAuthenticatedMember = getAuthenticatedMember as ReturnType<
  typeof vi.fn
>;
const mockAssertAdmin = assertAdmin as ReturnType<typeof vi.fn>;
const mockGetAllSeasons = getAllSeasons as ReturnType<typeof vi.fn>;
const mockGetSeasonByDate = getSeasonByDate as ReturnType<typeof vi.fn>;
const mockCreateSeason = createSeason as ReturnType<typeof vi.fn>;
const mockGetSeason = getSeason as ReturnType<typeof vi.fn>;
const mockGetSeasonEvents = getSeasonEvents as ReturnType<typeof vi.fn>;
const mockUpdateSeason = updateSeason as ReturnType<typeof vi.fn>;
const mockDeleteSeason = deleteSeason as ReturnType<typeof vi.fn>;

const TEST_ORG_ID = createOrgId("org_crede_001");

const mockAdminMember = {
  id: "admin-1",
  email_id: "admin@example.com",
  name: "Admin User",
  roles: ["admin"],
  voices: [],
  sections: [],
};

const mockSeason = {
  id: "season-1",
  orgId: TEST_ORG_ID,
  name: "Fall 2026",
  start_date: "2026-09-01",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function createMockEvent(overrides: Partial<RequestEvent> = {}): RequestEvent {
  return {
    url: new URL("http://localhost/api/seasons"),
    params: {},
    platform: { env: { DB: {} } },
    cookies: {
      get: vi.fn(),
      set: vi.fn(),
      delete: vi.fn(),
      getAll: vi.fn(),
      serialize: vi.fn(),
    },
    request: new Request("http://localhost/api/seasons"),
    locals: { org: { id: TEST_ORG_ID } },
    ...overrides,
  } as unknown as RequestEvent;
}

// ─── GET /api/seasons ───────────────────────────────────────────────────────

describe("GET /api/seasons", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockAdminMember);
  });

  it("returns list of seasons for authenticated member", async () => {
    mockGetAllSeasons.mockResolvedValue([mockSeason]);
    const event = createMockEvent();

    const response = await GET_SEASONS(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as any[];
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0].name).toBe("Fall 2026");
  });

  it("returns empty array when no seasons exist", async () => {
    mockGetAllSeasons.mockResolvedValue([]);
    const event = createMockEvent();

    const response = await GET_SEASONS(event);

    const data = (await response.json()) as any[];
    expect(data).toEqual([]);
  });

  it("returns season by date when ?date= param provided", async () => {
    mockGetSeasonByDate.mockResolvedValue(mockSeason);
    const event = createMockEvent({
      url: new URL("http://localhost/api/seasons?date=2026-10-15"),
    });

    const response = await GET_SEASONS(event);

    expect(mockGetSeasonByDate).toHaveBeenCalled();
    expect(mockGetAllSeasons).not.toHaveBeenCalled();
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.name).toBe("Fall 2026");
  });

  it("requires authentication", async () => {
    mockGetAuthenticatedMember.mockRejectedValue(
      Object.assign(new Error("Authentication required"), { status: 401 }),
    );
    const event = createMockEvent();

    await expect(GET_SEASONS(event)).rejects.toMatchObject({ status: 401 });
  });
});

// ─── POST /api/seasons ──────────────────────────────────────────────────────

describe("POST /api/seasons", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockAdminMember);
    mockAssertAdmin.mockReturnValue(undefined);
  });

  it("creates season with valid name and start_date", async () => {
    mockCreateSeason.mockResolvedValue(mockSeason);
    const event = createMockEvent({
      request: new Request("http://localhost/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Fall 2026", start_date: "2026-09-01" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(201);
    expect(mockAssertAdmin).toHaveBeenCalled();
    expect(mockCreateSeason).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "Fall 2026", start_date: "2026-09-01" }),
    );
  });

  it("trims whitespace from name", async () => {
    mockCreateSeason.mockResolvedValue(mockSeason);
    const event = createMockEvent({
      request: new Request("http://localhost/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "  Fall 2026  ",
          start_date: "2026-09-01",
        }),
      }),
    });

    await POST(event);

    expect(mockCreateSeason).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ name: "Fall 2026" }),
    );
  });

  it("returns 400 when name is missing", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: "2026-09-01" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toContain("Name");
  });

  it("returns 400 when name is empty string", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "   ", start_date: "2026-09-01" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
  });

  it("returns 400 when start_date is missing", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Fall 2026" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toContain("date");
  });

  it("returns 400 when start_date is not YYYY-MM-DD format", async () => {
    const event = createMockEvent({
      request: new Request("http://localhost/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Fall 2026", start_date: "01/09/2026" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toContain("YYYY-MM-DD");
  });

  it("returns 409 when season name conflicts", async () => {
    mockCreateSeason.mockRejectedValue(new Error("Season already exists"));
    const event = createMockEvent({
      request: new Request("http://localhost/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Fall 2026", start_date: "2026-09-01" }),
      }),
    });

    const response = await POST(event);

    expect(response.status).toBe(409);
  });

  it("requires admin role", async () => {
    mockAssertAdmin.mockImplementation(() => {
      throw Object.assign(new Error("Admin or owner role required"), {
        status: 403,
      });
    });
    const event = createMockEvent({
      request: new Request("http://localhost/api/seasons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Fall 2026", start_date: "2026-09-01" }),
      }),
    });

    await expect(POST(event)).rejects.toMatchObject({ status: 403 });
    expect(mockCreateSeason).not.toHaveBeenCalled();
  });
});

// ─── GET /api/seasons/[id] ──────────────────────────────────────────────────

describe("GET /api/seasons/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockAdminMember);
  });

  it("returns season by ID", async () => {
    mockGetSeason.mockResolvedValue(mockSeason);
    const event = createMockEvent({ params: { id: "season-1" } });

    const response = await GET_SEASON(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.id).toBe("season-1");
    expect(data.name).toBe("Fall 2026");
  });

  it("throws 404 for non-existent season", async () => {
    mockGetSeason.mockResolvedValue(null);
    const event = createMockEvent({ params: { id: "no-such-season" } });

    await expect(GET_SEASON(event)).rejects.toMatchObject({ status: 404 });
  });

  it("includes events when ?events=true", async () => {
    const mockEvents = [
      { id: "ev-1", title: "Rehearsal", starts_at: "2026-10-01T19:00:00Z" },
    ];
    mockGetSeason.mockResolvedValue(mockSeason);
    mockGetSeasonEvents.mockResolvedValue(mockEvents);
    const event = createMockEvent({
      params: { id: "season-1" },
      url: new URL("http://localhost/api/seasons/season-1?events=true"),
    });

    const response = await GET_SEASON(event);

    expect(mockGetSeasonEvents).toHaveBeenCalled();
    const data = (await response.json()) as Record<string, unknown>;
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.events as any[]).toHaveLength(1);
  });

  it("does NOT fetch events without ?events=true", async () => {
    mockGetSeason.mockResolvedValue(mockSeason);
    const event = createMockEvent({ params: { id: "season-1" } });

    await GET_SEASON(event);

    expect(mockGetSeasonEvents).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mockGetAuthenticatedMember.mockRejectedValue(
      Object.assign(new Error("Authentication required"), { status: 401 }),
    );
    const event = createMockEvent({ params: { id: "season-1" } });

    await expect(GET_SEASON(event)).rejects.toMatchObject({ status: 401 });
  });
});

// ─── PATCH /api/seasons/[id] ────────────────────────────────────────────────

describe("PATCH /api/seasons/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockAdminMember);
    mockAssertAdmin.mockReturnValue(undefined);
  });

  it("updates season name", async () => {
    const updated = { ...mockSeason, name: "Spring 2027" };
    mockUpdateSeason.mockResolvedValue(updated);
    const event = createMockEvent({
      params: { id: "season-1" },
      request: new Request("http://localhost/api/seasons/season-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Spring 2027" }),
      }),
    });

    const response = await PATCH(event);

    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.name).toBe("Spring 2027");
  });

  it("updates season start_date", async () => {
    const updated = { ...mockSeason, start_date: "2027-03-01" };
    mockUpdateSeason.mockResolvedValue(updated);
    const event = createMockEvent({
      params: { id: "season-1" },
      request: new Request("http://localhost/api/seasons/season-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: "2027-03-01" }),
      }),
    });

    const response = await PATCH(event);

    expect(mockUpdateSeason).toHaveBeenCalledWith(
      expect.anything(),
      "season-1",
      expect.objectContaining({ start_date: "2027-03-01" }),
      expect.anything(),
    );
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.start_date).toBe("2027-03-01");
  });

  it("returns 400 when name is empty string", async () => {
    const event = createMockEvent({
      params: { id: "season-1" },
      request: new Request("http://localhost/api/seasons/season-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
      }),
    });

    const response = await PATCH(event);

    expect(response.status).toBe(400);
    expect(mockUpdateSeason).not.toHaveBeenCalled();
  });

  it("returns 400 when start_date is wrong format", async () => {
    const event = createMockEvent({
      params: { id: "season-1" },
      request: new Request("http://localhost/api/seasons/season-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: "September 2026" }),
      }),
    });

    const response = await PATCH(event);

    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.error).toContain("YYYY-MM-DD");
  });

  it("throws 404 when season not found", async () => {
    mockUpdateSeason.mockResolvedValue(null);
    const event = createMockEvent({
      params: { id: "no-such-season" },
      request: new Request("http://localhost/api/seasons/no-such-season", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      }),
    });

    await expect(PATCH(event)).rejects.toMatchObject({ status: 404 });
  });

  it("returns 409 on name conflict", async () => {
    mockUpdateSeason.mockRejectedValue(new Error("Season already exists"));
    const event = createMockEvent({
      params: { id: "season-1" },
      request: new Request("http://localhost/api/seasons/season-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Fall 2026" }),
      }),
    });

    const response = await PATCH(event);

    expect(response.status).toBe(409);
  });

  it("requires admin role", async () => {
    mockAssertAdmin.mockImplementation(() => {
      throw Object.assign(new Error("Admin or owner role required"), {
        status: 403,
      });
    });
    const event = createMockEvent({
      params: { id: "season-1" },
      request: new Request("http://localhost/api/seasons/season-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      }),
    });

    await expect(PATCH(event)).rejects.toMatchObject({ status: 403 });
    expect(mockUpdateSeason).not.toHaveBeenCalled();
  });
});

// ─── DELETE /api/seasons/[id] ───────────────────────────────────────────────

describe("DELETE /api/seasons/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockGetAuthenticatedMember.mockResolvedValue(mockAdminMember);
    mockAssertAdmin.mockReturnValue(undefined);
  });

  it("deletes season and returns success", async () => {
    mockDeleteSeason.mockResolvedValue(true);
    const event = createMockEvent({ params: { id: "season-1" } });

    const response = await DELETE(event);

    expect(response.status).toBe(200);
    expect(mockAssertAdmin).toHaveBeenCalled();
    expect(mockDeleteSeason).toHaveBeenCalledWith(
      expect.anything(),
      "season-1",
      expect.anything(),
    );
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.success).toBe(true);
  });

  it("throws 404 when season not found", async () => {
    mockDeleteSeason.mockResolvedValue(false);
    const event = createMockEvent({ params: { id: "no-such-season" } });

    await expect(DELETE(event)).rejects.toMatchObject({ status: 404 });
  });

  it("requires admin role", async () => {
    mockAssertAdmin.mockImplementation(() => {
      throw Object.assign(new Error("Admin or owner role required"), {
        status: 403,
      });
    });
    const event = createMockEvent({ params: { id: "season-1" } });

    await expect(DELETE(event)).rejects.toMatchObject({ status: 403 });
    expect(mockDeleteSeason).not.toHaveBeenCalled();
  });
});
