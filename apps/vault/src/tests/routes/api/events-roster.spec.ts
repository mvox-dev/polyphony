// Tests for roster API endpoint
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "$lib/../routes/api/events/roster/+server";
import type { Member } from "$lib/server/auth/permissions";
import type { RosterView } from "$lib/types";

// Mock the auth middleware
let mockCurrentMember: Member | null = null;

vi.mock("$lib/server/auth/middleware", () => ({
  getAuthenticatedMember: vi.fn(() => mockCurrentMember),
}));

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

// Mock database with roster data
function createMockDB() {
  const mockState = {
    members: new Map<string, any>(),
    events: new Map<string, any>(),
    participation: new Map<string, any>(),
    sections: new Map<string, any>(),
    member_sections: new Map<string, any>(),
  };

  return {
    prepare: (sql: string) => {
      let params: any[] = [];

      const queryHandler = {
        first: async () => {
          return null;
        },
        all: async () => {
          // Mock events query - now uses explicit columns: id, title as name, starts_at as date, event_type as type
          if (sql.includes("FROM events")) {
            let results = Array.from(mockState.events.values());
            // Handle org_id + date filtering
            // When org_id is present, it's the first param
            let dateParams = [...params];
            if (sql.includes("org_id = ?")) {
              // org_id filter - skip for mock (all events are same org)
              dateParams = dateParams.slice(1);
            }
            if (
              dateParams.length >= 2 &&
              sql.includes("starts_at >= ?") &&
              sql.includes("starts_at <= ?")
            ) {
              results = results.filter((e: any) => {
                const eventDate = new Date(e.starts_at);
                return (
                  eventDate >= new Date(dateParams[0] as string) &&
                  eventDate <= new Date(dateParams[1] as string)
                );
              });
            } else if (dateParams.length >= 1 && sql.includes("starts_at >=")) {
              results = results.filter(
                (e: any) =>
                  new Date(e.starts_at) >= new Date(dateParams[0] as string),
              );
            } else if (dateParams.length >= 1 && sql.includes("starts_at <=")) {
              results = results.filter(
                (e: any) =>
                  new Date(e.starts_at) <= new Date(dateParams[0] as string),
              );
            }
            return { results };
          }

          // Mock members query - now includes section columns
          if (
            sql.includes("SELECT DISTINCT m.") &&
            sql.includes("FROM members m")
          ) {
            let results = Array.from(mockState.members.values());

            // Track param offset (org_id may consume the first param)
            let paramOffset = 0;
            if (sql.includes("member_organizations")) {
              // org_id filtering via member_organizations JOIN - skip for mock
              paramOffset = 1;
            }

            // Apply section filtering if WHERE clause present
            if (
              sql.includes("ms.section_id = ?") &&
              params.length > paramOffset
            ) {
              const sectionId = params[paramOffset];
              const memberIds = Array.from(mockState.member_sections.values())
                .filter((ms: any) => ms.section_id === sectionId)
                .map((ms: any) => ms.member_id);
              results = results.filter((m: any) => memberIds.includes(m.id));
            }

            // Join section data if query includes section columns
            if (sql.includes("ms.section_id as primary_section")) {
              results = results.map((m: any) => {
                // Find primary section for this member
                const memberSecs = Array.from(
                  mockState.member_sections.values(),
                ).filter((ms: any) => ms.member_id === m.id);
                const primarySec = memberSecs.find(
                  (ms: any) => ms.is_primary === 1,
                );

                if (primarySec) {
                  const section = mockState.sections.get(primarySec.section_id);
                  if (section) {
                    return {
                      ...m,
                      primary_section: primarySec.section_id,
                      section_name: section.name,
                      section_abbr: section.abbreviation,
                      section_is_active: section.is_active,
                    };
                  }
                }
                return m;
              });
            }

            return { results };
          }

          // Mock member sections query
          if (
            sql
              .replace(/\s+/g, " ")
              .includes("FROM sections s JOIN member_sections ms")
          ) {
            const memberId = params[0];
            const memberSections = Array.from(
              mockState.member_sections.values(),
            )
              .filter((ms: any) => ms.member_id === memberId)
              .map((ms: any) => {
                const section = mockState.sections.get(ms.section_id);
                if (!section) return null;
                return {
                  ...section,
                  is_primary: ms.is_primary,
                };
              })
              .filter((s: any) => s !== null);
            return { results: memberSections };
          }

          // Mock participation query (now scoped by event IDs)
          if (sql.includes("FROM participation")) {
            const allParticipation = Array.from(
              mockState.participation.values(),
            );
            // If filtering by event_id IN (...), filter by params
            if (sql.includes("event_id IN") && params.length > 0) {
              return {
                results: allParticipation.filter((p: any) =>
                  params.includes(p.event_id),
                ),
              };
            }
            return { results: allParticipation };
          }

          return { results: [] };
        },
      };

      return {
        bind: (...bindParams: any[]) => {
          params = bindParams;
          return queryHandler;
        },
        // Allow calling .all() and .first() directly without .bind()
        ...queryHandler,
      };
    },
    __mockState: mockState,
  } as unknown as D1Database;
}

// Helper to create mock request event
function createMockEvent(url: string, cookies: any = {}) {
  return {
    url: new URL(url),
    cookies: {
      get: (name: string) => cookies[name] || "mock-session-id",
    },
    locals: {
      org: { id: "org_test_001" },
    },
    platform: {
      env: {
        DB: createMockDB(),
      },
    },
  } as any;
}

// Seed function for test data
function seedMockDB(db: D1Database) {
  const mockDb = db as any;
  const state = mockDb.__mockState;

  return {
    addMember: (member: any) => {
      state.members.set(member.id, member);
    },
    addEvent: (event: any) => {
      state.events.set(event.id, event);
    },
    addParticipation: (participation: any) => {
      state.participation.set(participation.id, participation);
    },
    addSection: (section: any) => {
      state.sections.set(section.id, section);
    },
    addMemberSection: (memberSection: any) => {
      const key = `${memberSection.member_id}_${memberSection.section_id}`;
      state.member_sections.set(key, memberSection);
    },
    clear: () => {
      state.members.clear();
      state.events.clear();
      state.participation.clear();
      state.sections.clear();
      state.member_sections.clear();
    },
  };
}

describe("GET /api/events/roster", () => {
  let mockEvent: any;
  let seed: ReturnType<typeof seedMockDB>;
  let adminMember: Member;

  beforeEach(() => {
    mockEvent = createMockEvent(
      "http://localhost/api/events/roster?start=2024-01-01T00:00:00Z&end=2024-02-01T00:00:00Z",
    );
    seed = seedMockDB(mockEvent.platform.env.DB);
    seed.clear();

    // Set up authenticated member
    adminMember = {
      id: "admin-123",
      email_id: "admin@example.com",
      roles: ["admin"],
    };
    mockCurrentMember = adminMember;
  });

  it("returns 400 for missing start parameter", async () => {
    mockEvent.url = new URL(
      "http://localhost/api/events/roster?end=2024-02-01T00:00:00Z",
    );

    await expect(GET(mockEvent)).rejects.toThrow(
      "expected string, received undefined",
    );
  });

  it("returns 400 for missing end parameter", async () => {
    mockEvent.url = new URL(
      "http://localhost/api/events/roster?start=2024-01-01T00:00:00Z",
    );

    await expect(GET(mockEvent)).rejects.toThrow(
      "expected string, received undefined",
    );
    mockEvent.url = new URL(
      "http://localhost/api/events/roster?start=not-a-date&end=2024-02-01T00:00:00Z",
    );

    await expect(GET(mockEvent)).rejects.toThrow();
  });

  it("returns empty roster when no data exists", async () => {
    const response = await GET(mockEvent);
    const data = (await response.json()) as RosterView;
    expect(data.events).toEqual([]);
    expect(data.members).toEqual([]);
    expect(data.summary).toEqual({
      totalEvents: 0,
      totalMembers: 0,
      averageAttendance: 0,
      sectionStats: {},
    });
  });

  it("returns roster data with events and members", async () => {
    // Add test data
    seed.addEvent({
      id: "evt-1",
      name: "Rehearsal 1",
      starts_at: "2024-01-15",
      type: "rehearsal",
    });

    seed.addMember({
      id: "mem-1",
      email: "singer@example.com",
      name: "Test Singer",
    });

    seed.addSection({
      id: "section-1",
      name: "Soprano 1",
      abbreviation: "S1",
      parent_section_id: null,
      display_order: 1,
      is_active: 1,
    });

    seed.addMemberSection({
      member_id: "mem-1",
      section_id: "section-1",
      is_primary: 1,
    });

    seed.addParticipation({
      id: "part-1",
      member_id: "mem-1",
      event_id: "evt-1",
      planned_status: "yes",
      actual_status: "present",
      recorded_at: "2024-01-15T10:00:00Z",
    });

    const response = await GET(mockEvent);
    const data = (await response.json()) as RosterView;

    expect(response.status).toBe(200);
    expect(data.events).toHaveLength(1);
    expect(data.events[0].id).toBe("evt-1");
    expect(data.events[0].name).toBe("Rehearsal 1");
    expect(data.members).toHaveLength(1);
    expect(data.members[0].id).toBe("mem-1");
    expect(data.members[0].name).toBe("Test Singer");
    expect(data.members[0].primarySection).toBeDefined();
    if (data.members[0].primarySection) {
      expect(data.members[0].primarySection.id).toBe("section-1");
    }
    expect(data.summary.totalEvents).toBe(1);
    expect(data.summary.totalMembers).toBe(1);
  });

  it("filters events by date range", async () => {
    seed.addEvent({
      id: "evt-before",
      name: "Before Range",
      starts_at: "2023-12-15",
      type: "rehearsal",
    });

    seed.addEvent({
      id: "evt-during",
      name: "During Range",
      starts_at: "2024-01-15",
      type: "rehearsal",
    });

    seed.addEvent({
      id: "evt-after",
      name: "After Range",
      starts_at: "2024-03-15",
      type: "rehearsal",
    });

    const response = await GET(mockEvent);
    const data = (await response.json()) as RosterView;

    expect(data.events).toHaveLength(1);
    expect(data.events[0].id).toBe("evt-during");
  });

  it("accepts optional sectionId filter", async () => {
    mockEvent.url = new URL(
      "http://localhost/api/events/roster?start=2024-01-01T00:00:00Z&end=2024-02-01T00:00:00Z&sectionId=soprano-1",
    );

    seed.addMember({
      id: "mem-soprano",
      email: "soprano@example.com",
      name: "Soprano Singer",
    });

    seed.addMember({
      id: "mem-alto",
      email: "alto@example.com",
      name: "Alto Singer",
    });

    seed.addSection({
      id: "soprano-1",
      name: "Soprano 1",
      abbreviation: "S1",
      parent_section_id: null,
      display_order: 1,
      is_active: 1,
    });

    seed.addSection({
      id: "alto-1",
      name: "Alto 1",
      abbreviation: "A1",
      parent_section_id: null,
      display_order: 2,
      is_active: 1,
    });

    seed.addMemberSection({
      member_id: "mem-soprano",
      section_id: "soprano-1",
      is_primary: 1,
    });

    seed.addMemberSection({
      member_id: "mem-alto",
      section_id: "alto-1",
      is_primary: 1,
    });

    const response = await GET(mockEvent);
    const data = (await response.json()) as RosterView;

    expect(response.status).toBe(200);
    expect(data.members).toHaveLength(1);
    expect(data.members[0].id).toBe("mem-soprano");
    expect(data.members[0].primarySection).toBeDefined();
    if (data.members[0].primarySection) {
      expect(data.members[0].primarySection.id).toBe("soprano-1");
    }
  });

  it("handles invalid sectionId gracefully (returns empty members)", async () => {
    mockEvent.url = new URL(
      "http://localhost/api/events/roster?start=2024-01-01T00:00:00Z&end=2024-02-01T00:00:00Z&sectionId=invalid-section",
    );

    seed.addMember({
      id: "mem-1",
      email: "singer@example.com",
      name: "Test Singer",
    });

    const response = await GET(mockEvent);
    const data = (await response.json()) as RosterView;

    expect(response.status).toBe(200);
    expect(data.members).toEqual([]);
  });
});
