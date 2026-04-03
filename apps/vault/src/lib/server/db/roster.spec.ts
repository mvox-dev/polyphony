import { describe, it, expect, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import { createOrgId } from "@polyphony/shared";
import { getRosterView } from "./roster";
import type { RosterViewFilters } from "$lib/types";

const TEST_ORG_ID = createOrgId("org_test_001");

// Mock D1Database for testing
function createMockDB(): D1Database & { __mockState: any } {
  // Use a shared state object that both the SQL handlers and seedData can reference
  const mockState = {
    events: new Map<string, any>(),
    members: new Map<string, any>(),
    participation: new Map<string, any>(),
    sections: new Map<string, any>(),
    voices: new Map<string, any>(),
    memberSections: new Map<string, any[]>(),
    memberVoices: new Map<string, any[]>(),
  };

  const db = {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => ({
          first: async () => null,
          all: async () => {
            // Events query - now uses explicit columns with aliases
            // SELECT id, title as name, starts_at as date, event_type as type FROM events WHERE org_id = ? [AND ...]
            // First param is always orgId now
            if (sql.includes("FROM events")) {
              let results = Array.from(mockState.events.values());

              // params[0] is always orgId; date filters start at params[1]
              // Apply date filters (uses starts_at column)
              if (
                sql.includes("starts_at >= ?") &&
                sql.includes("starts_at <= ?")
              ) {
                const start = params[1];
                const end = params[2];
                results = results.filter(
                  (e) =>
                    new Date(e.starts_at) >= new Date(start) &&
                    new Date(e.starts_at) <= new Date(end),
                );
              } else if (sql.includes("starts_at >= ?")) {
                const start = params[1];
                results = results.filter(
                  (e) => new Date(e.starts_at) >= new Date(start),
                );
              } else if (sql.includes("starts_at <= ?")) {
                const end = params[1];
                results = results.filter(
                  (e) => new Date(e.starts_at) <= new Date(end),
                );
              }

              // Sort by starts_at ASC (implementation uses ORDER BY starts_at ASC)
              results.sort(
                (a, b) =>
                  new Date(a.starts_at).getTime() -
                  new Date(b.starts_at).getTime(),
              );

              // Apply aliases to match SQL: title as name, starts_at as date, event_type as type
              results = results.map((e) => ({
                id: e.id,
                name: e.name,
                date: e.starts_at, // Alias: starts_at becomes date
                type: e.type,
              }));

              return { results };
            }

            // Members query (with section filtering and section columns)
            // params[0] is always orgId (for member_organizations join)
            if (
              sql.includes("SELECT DISTINCT m.") ||
              sql.includes("SELECT * FROM members")
            ) {
              let results = Array.from(mockState.members.values());

              // Apply section filter via WHERE clause; sectionId is params[1] (after orgId)
              if (sql.includes("section_id = ?") && params.length > 1) {
                const sectionId = params[1];
                const membersInSection = Array.from(
                  mockState.memberSections.entries(),
                )
                  .filter(([_, secs]) =>
                    secs.some((s) => s.section_id === sectionId),
                  )
                  .map(([memberId]) => memberId);
                results = results.filter((m) =>
                  membersInSection.includes(m.id),
                );
              }

              // Join section data if query includes section columns
              if (sql.includes("ms.section_id as primary_section")) {
                results = results.map((m) => {
                  // If member has section_id property (shorthand in tests), look up the section
                  if (m.section_id) {
                    const section = mockState.sections.get(m.section_id);
                    return {
                      ...m,
                      primary_section: m.section_id,
                      section_name: section?.name,
                      section_abbr: section?.abbreviation,
                      section_is_active: section?.is_active,
                    };
                  }
                  // Otherwise check memberSections map
                  const memberSecs = mockState.memberSections.get(m.id) || [];
                  const primarySec = memberSecs.find((s) => s.is_primary === 1);
                  if (primarySec) {
                    const section = mockState.sections.get(
                      primarySec.section_id,
                    );
                    return {
                      ...m,
                      primary_section: primarySec.section_id,
                      section_name: section?.name,
                      section_abbr: section?.abbreviation,
                      section_is_active: section?.is_active,
                    };
                  }
                  return m;
                });
              }

              // Sort by name ASC
              results.sort((a, b) =>
                (a.name || a.email).localeCompare(b.name || b.email),
              );

              return { results };
            }

            // Participation query
            if (sql.includes("SELECT * FROM participation")) {
              return { results: Array.from(mockState.participation.values()) };
            }

            // Sections query
            if (sql.includes("SELECT * FROM sections")) {
              return { results: Array.from(mockState.sections.values()) };
            }

            // Voices query
            if (sql.includes("SELECT * FROM voices")) {
              return { results: Array.from(mockState.voices.values()) };
            }

            // Member sections query (queryMemberSections joins sections + member_sections)
            if (
              sql.includes("FROM sections") &&
              sql.includes("member_sections") &&
              sql.includes("member_id = ?")
            ) {
              const [memberId] = params;
              const memberSecs = mockState.memberSections.get(memberId) || [];
              // Join with section data to return full section objects
              const results = memberSecs.map((ms: any) => {
                const section = mockState.sections.get(ms.section_id);
                return {
                  id: ms.section_id,
                  org_id: TEST_ORG_ID,
                  name: section?.name ?? "",
                  abbreviation: section?.abbreviation ?? "",
                  parent_section_id: null,
                  display_order: section?.display_order ?? 0,
                  is_active: section?.is_active ?? 1,
                  is_primary: ms.is_primary ?? 0,
                };
              });
              return { results };
            }

            // Legacy member sections query
            if (sql.includes("FROM member_sections WHERE member_id = ?")) {
              const [memberId] = params;
              const memberSecs = mockState.memberSections.get(memberId) || [];
              return { results: memberSecs };
            }

            // Member voices query
            if (
              sql.includes("FROM member_voices WHERE member_id = ?") ||
              (sql.includes("FROM voices") &&
                sql.includes("member_voices") &&
                sql.includes("member_id = ?"))
            ) {
              const [memberId] = params;
              const memberVcs = mockState.memberVoices.get(memberId) || [];
              return { results: memberVcs };
            }

            return { results: [] };
          },
          run: async () => ({ success: false, meta: { changes: 0 } }),
        }),
        // Also support .all() without .bind() for queries without parameters
        all: async () => {
          // Participation query
          if (sql.includes("SELECT * FROM participation")) {
            return { results: Array.from(mockState.participation.values()) };
          }

          // Sections query
          if (sql.includes("SELECT * FROM sections")) {
            return { results: Array.from(mockState.sections.values()) };
          }

          // Voices query
          if (sql.includes("SELECT * FROM voices")) {
            return { results: Array.from(mockState.voices.values()) };
          }

          return { results: [] };
        },
        first: async () => null,
        run: async () => ({ success: false, meta: { changes: 0 } }),
      };
    },
    dump: () => new ArrayBuffer(0),
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
    __mockState: mockState,
  } as unknown as D1Database & { __mockState: any };

  return db;
}

// Helper to seed test data
function seedData(
  db: any,
  data: {
    events?: any[];
    members?: any[];
    participation?: any[];
    sections?: any[];
    voices?: any[];
    memberSections?: { memberId: string; sections: any[] }[];
    memberVoices?: { memberId: string; voices: any[] }[];
  },
) {
  const mockState = db.__mockState;

  data.events?.forEach((e) => mockState.events.set(e.id, e));
  data.members?.forEach((m) => mockState.members.set(m.id, m));
  data.participation?.forEach((p) => {
    // Store by ID (or generate one if not provided)
    const key = p.id || `${p.member_id}_${p.event_id}`;
    mockState.participation.set(key, p);
  });
  data.sections?.forEach((s) => mockState.sections.set(s.id, s));
  data.voices?.forEach((v) => mockState.voices.set(v.id, v));
  data.memberSections?.forEach(({ memberId, sections }) =>
    mockState.memberSections.set(memberId, sections),
  );
  data.memberVoices?.forEach(({ memberId, voices }) =>
    mockState.memberVoices.set(memberId, voices),
  );
}

let mockDb: D1Database;

describe("Roster View Database Functions", () => {
  beforeEach(() => {
    mockDb = createMockDB();
  });

  describe("getRosterView", () => {
    it("should return empty arrays and zero summary with no data", async () => {
      const result = await getRosterView(mockDb, TEST_ORG_ID);

      expect(result.events).toEqual([]);
      expect(result.members).toEqual([]);
      expect(result.summary.totalEvents).toBe(0);
      expect(result.summary.totalMembers).toBe(0);
      expect(result.summary.averageAttendance).toBe(0);
    });

    it("should list event with no members", async () => {
      seedData(mockDb, {
        events: [
          {
            id: "evt_1",
            name: "Rehearsal 1",
            starts_at: "2026-02-01",
            type: "rehearsal",
          },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      expect(result.events.length).toBe(1);
      expect(result.events[0].name).toBe("Rehearsal 1");
      expect(result.members).toEqual([]);
    });

    it("should list member with no events", async () => {
      seedData(mockDb, {
        members: [
          { id: "mem_1", email: "test@example.com", name: "Test User" },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      expect(result.members.length).toBe(1);
      expect(result.members[0].name).toBe("Test User");
      expect(result.events).toEqual([]);
    });

    it("should show event and member with no participation as null values", async () => {
      seedData(mockDb, {
        events: [
          {
            id: "evt_1",
            name: "Rehearsal 1",
            starts_at: "2026-02-01",
            type: "rehearsal",
          },
        ],
        members: [
          { id: "mem_1", email: "test@example.com", name: "Test User" },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      expect(result.events.length).toBe(1);
      expect(result.members.length).toBe(1);
      // Participation is normalized: all member×event combos have an entry with null values
      expect(result.events[0].participation.get("mem_1")).toEqual({
        plannedStatus: null,
        actualStatus: null,
        recordedAt: null,
      });
    });

    it("should show planned participation without actual status", async () => {
      seedData(mockDb, {
        events: [
          {
            id: "evt_1",
            name: "Rehearsal 1",
            starts_at: "2026-02-01",
            type: "rehearsal",
          },
        ],
        members: [
          { id: "mem_1", email: "test@example.com", name: "Test User" },
        ],
        participation: [
          {
            id: "part_1",
            member_id: "mem_1",
            event_id: "evt_1",
            planned_status: "yes",
            actual_status: null,
            recorded_at: null,
          },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      const status = result.events[0].participation.get("mem_1");
      expect(status?.plannedStatus).toBe("yes");
      expect(status?.actualStatus).toBeNull();
    });

    it("should show both planned and actual attendance", async () => {
      seedData(mockDb, {
        events: [
          {
            id: "evt_1",
            name: "Rehearsal 1",
            starts_at: "2026-02-01",
            type: "rehearsal",
          },
        ],
        members: [
          { id: "mem_1", email: "test@example.com", name: "Test User" },
        ],
        participation: [
          {
            id: "part_1",
            member_id: "mem_1",
            event_id: "evt_1",
            planned_status: "yes",
            actual_status: "present",
            recorded_at: "2026-02-01T10:00:00Z",
          },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      const status = result.events[0].participation.get("mem_1");
      expect(status?.plannedStatus).toBe("yes");
      expect(status?.actualStatus).toBe("present");
      expect(status?.recordedAt).toBe("2026-02-01T10:00:00Z");
    });

    it("should sort multiple events by date ASC (chronological, oldest first)", async () => {
      seedData(mockDb, {
        events: [
          {
            id: "evt_1",
            name: "Event 1",
            starts_at: "2026-01-15",
            type: "rehearsal",
          },
          {
            id: "evt_2",
            name: "Event 2",
            starts_at: "2026-02-20",
            type: "concert",
          },
          {
            id: "evt_3",
            name: "Event 3",
            starts_at: "2026-01-30",
            type: "rehearsal",
          },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      expect(result.events[0].date).toBe("2026-01-15");
      expect(result.events[1].date).toBe("2026-01-30");
      expect(result.events[2].date).toBe("2026-02-20");
    });

    it("should sort multiple members by name ASC (alphabetical)", async () => {
      seedData(mockDb, {
        members: [
          { id: "mem_1", email: "charlie@example.com", name: "Charlie" },
          { id: "mem_2", email: "alice@example.com", name: "Alice" },
          { id: "mem_3", email: "bob@example.com", name: "Bob" },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      expect(result.members[0].name).toBe("Alice");
      expect(result.members[1].name).toBe("Bob");
      expect(result.members[2].name).toBe("Charlie");
    });

    it("should filter events by start date", async () => {
      seedData(mockDb, {
        events: [
          {
            id: "evt_1",
            name: "Event 1",
            starts_at: "2026-01-15",
            type: "rehearsal",
          },
          {
            id: "evt_2",
            name: "Event 2",
            starts_at: "2026-02-20",
            type: "concert",
          },
          {
            id: "evt_3",
            name: "Event 3",
            starts_at: "2026-03-10",
            type: "rehearsal",
          },
        ],
      });

      const filters: RosterViewFilters = { start: "2026-02-01" };
      const result = await getRosterView(mockDb, TEST_ORG_ID, filters);

      expect(result.events.length).toBe(2);
      expect(result.events.every((e) => e.date >= "2026-02-01")).toBe(true);
    });

    it("should filter events by end date", async () => {
      seedData(mockDb, {
        events: [
          {
            id: "evt_1",
            name: "Event 1",
            starts_at: "2026-01-15",
            type: "rehearsal",
          },
          {
            id: "evt_2",
            name: "Event 2",
            starts_at: "2026-02-20",
            type: "concert",
          },
          {
            id: "evt_3",
            name: "Event 3",
            starts_at: "2026-03-10",
            type: "rehearsal",
          },
        ],
      });

      const filters: RosterViewFilters = { end: "2026-02-28" };
      const result = await getRosterView(mockDb, TEST_ORG_ID, filters);

      expect(result.events.length).toBe(2);
      expect(result.events.every((e) => e.date <= "2026-02-28")).toBe(true);
    });

    it("should filter events by date range (both start and end)", async () => {
      seedData(mockDb, {
        events: [
          {
            id: "evt_1",
            name: "Event 1",
            starts_at: "2026-01-15",
            type: "rehearsal",
          },
          {
            id: "evt_2",
            name: "Event 2",
            starts_at: "2026-02-20",
            type: "concert",
          },
          {
            id: "evt_3",
            name: "Event 3",
            starts_at: "2026-03-10",
            type: "rehearsal",
          },
        ],
      });

      const filters: RosterViewFilters = {
        start: "2026-02-01",
        end: "2026-02-28",
      };
      const result = await getRosterView(mockDb, TEST_ORG_ID, filters);

      expect(result.events.length).toBe(1);
      expect(result.events[0].date).toBe("2026-02-20");
    });

    it("should filter members by section", async () => {
      const section = { id: "sec_soprano", name: "Soprano", abbreviation: "S" };

      seedData(mockDb, {
        members: [
          { id: "mem_1", email: "alice@example.com", name: "Alice" },
          { id: "mem_2", email: "bob@example.com", name: "Bob" },
          { id: "mem_3", email: "charlie@example.com", name: "Charlie" },
        ],
        sections: [section],
        memberSections: [
          {
            memberId: "mem_1",
            sections: [{ section_id: "sec_soprano", is_primary: 1 }],
          },
          {
            memberId: "mem_3",
            sections: [{ section_id: "sec_soprano", is_primary: 1 }],
          },
        ],
      });

      const filters: RosterViewFilters = { sectionId: "sec_soprano" };
      const result = await getRosterView(mockDb, TEST_ORG_ID, filters);

      expect(result.members.length).toBe(2);
      expect(result.members.map((m) => m.name)).toContain("Alice");
      expect(result.members.map((m) => m.name)).toContain("Charlie");
      expect(result.members.map((m) => m.name)).not.toContain("Bob");
    });

    it("should calculate summary statistics correctly", async () => {
      seedData(mockDb, {
        events: [
          {
            id: "evt_1",
            name: "Event 1",
            starts_at: "2026-02-01",
            type: "rehearsal",
          },
          {
            id: "evt_2",
            name: "Event 2",
            starts_at: "2026-02-15",
            type: "rehearsal",
          },
        ],
        members: [
          { id: "mem_1", email: "alice@example.com", name: "Alice" },
          { id: "mem_2", email: "bob@example.com", name: "Bob" },
        ],
        participation: [
          {
            id: "part_1",
            member_id: "mem_1",
            event_id: "evt_1",
            planned_status: "yes",
            actual_status: "present",
            recorded_at: "2026-02-01T10:00:00Z",
          },
          {
            id: "part_2",
            member_id: "mem_2",
            event_id: "evt_1",
            planned_status: "yes",
            actual_status: "present",
            recorded_at: "2026-02-01T10:00:00Z",
          },
          {
            id: "part_3",
            member_id: "mem_1",
            event_id: "evt_2",
            planned_status: "yes",
            actual_status: "absent",
            recorded_at: "2026-02-15T10:00:00Z",
          },
          {
            id: "part_4",
            member_id: "mem_2",
            event_id: "evt_2",
            planned_status: "yes",
            actual_status: "absent",
            recorded_at: "2026-02-15T10:00:00Z",
          },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      expect(result.summary.totalEvents).toBe(2);
      expect(result.summary.totalMembers).toBe(2);
      // 2 present out of 4 possible (2 events × 2 members) = 50%
      expect(result.summary.averageAttendance).toBe(50);
    });

    it("should calculate section summary statistics", async () => {
      seedData(mockDb, {
        sections: [
          {
            id: "sec_s1",
            name: "Soprano 1",
            abbreviation: "S1",
            display_order: 1,
            is_active: 1,
          },
          {
            id: "sec_a",
            name: "Alto",
            abbreviation: "A",
            display_order: 2,
            is_active: 1,
          },
        ],
        members: [
          {
            id: "mem_1",
            name: "Alice",
            email: "alice@test.com",
            section_id: "sec_s1",
          },
          {
            id: "mem_2",
            name: "Bob",
            email: "bob@test.com",
            section_id: "sec_s1",
          },
          {
            id: "mem_3",
            name: "Carol",
            email: "carol@test.com",
            section_id: "sec_a",
          },
        ],
        events: [
          {
            id: "evt_1",
            name: "Event 1",
            starts_at: "2026-02-20",
            type: "rehearsal",
          },
        ],
        participation: [
          {
            id: "part_1",
            member_id: "mem_1",
            event_id: "evt_1",
            planned_status: "yes",
          },
          {
            id: "part_2",
            member_id: "mem_2",
            event_id: "evt_1",
            planned_status: "no",
          },
          {
            id: "part_3",
            member_id: "mem_3",
            event_id: "evt_1",
            planned_status: "yes",
          },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      // Check section summary exists
      expect(result.summary.sectionStats).toBeDefined();
      expect(Object.keys(result.summary.sectionStats)).toHaveLength(2);

      // Check S1 stats (2 members: 1 yes, 1 no)
      const s1Stats = result.summary.sectionStats["sec_s1"];
      expect(s1Stats).toBeDefined();
      expect(s1Stats.sectionName).toBe("Soprano 1");
      expect(s1Stats.sectionAbbr).toBe("S1");
      expect(s1Stats.total).toBe(2);
      expect(s1Stats.yes).toBe(1);
      expect(s1Stats.no).toBe(1);
      expect(s1Stats.maybe).toBe(0);
      expect(s1Stats.late).toBe(0);
      expect(s1Stats.responded).toBe(2);

      // Check Alto stats (1 member: 1 yes)
      const aStats = result.summary.sectionStats["sec_a"];
      expect(aStats).toBeDefined();
      expect(aStats.sectionName).toBe("Alto");
      expect(aStats.sectionAbbr).toBe("A");
      expect(aStats.total).toBe(1);
      expect(aStats.yes).toBe(1);
      expect(aStats.responded).toBe(1);
    });

    it("should only include active sections in summary", async () => {
      seedData(mockDb, {
        sections: [
          {
            id: "sec_s1",
            name: "Soprano 1",
            abbreviation: "S1",
            display_order: 1,
            is_active: 1,
          },
          {
            id: "sec_inactive",
            name: "Inactive",
            abbreviation: "IN",
            display_order: 99,
            is_active: 0,
          },
        ],
        members: [
          {
            id: "mem_1",
            name: "Alice",
            email: "alice@test.com",
            section_id: "sec_s1",
          },
          {
            id: "mem_2",
            name: "Bob",
            email: "bob@test.com",
            section_id: "sec_inactive",
          },
        ],
        events: [
          {
            id: "evt_1",
            name: "Event 1",
            starts_at: "2026-02-20",
            type: "rehearsal",
          },
        ],
        participation: [
          {
            id: "part_1",
            member_id: "mem_1",
            event_id: "evt_1",
            planned_status: "yes",
          },
          {
            id: "part_2",
            member_id: "mem_2",
            event_id: "evt_1",
            planned_status: "yes",
          },
        ],
      });

      const result = await getRosterView(mockDb, TEST_ORG_ID);

      // Only active section should appear
      expect(Object.keys(result.summary.sectionStats)).toHaveLength(1);
      expect(result.summary.sectionStats["sec_s1"]).toBeDefined();
      expect(result.summary.sectionStats["sec_inactive"]).toBeUndefined();
    });
  });
});
