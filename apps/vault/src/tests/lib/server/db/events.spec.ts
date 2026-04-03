// Tests for events database operations
import { describe, it, expect, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  createEvents,
  getUpcomingEvents,
  getEventById,
  updateEvent,
  deleteEvent,
} from "$lib/server/db/events";
import type { EventType } from "$lib/types";

// Test org ID (matches DEFAULT_ORG_ID)
const TEST_ORG_ID = createOrgId("org_crede_001");

// Mock D1 database
interface MockRow {
  [key: string]: string | number | null;
}

interface MockResult {
  results: any[];
  success: boolean;
  meta: { changes?: number };
}

function createMockDb(): D1Database {
  const storage = new Map<string, any[]>();
  const tables = ["events"];

  // Initialize tables
  tables.forEach((table) => storage.set(table, []));

  return {
    prepare: (query: string) => {
      const boundValues: unknown[] = [];

      return {
        bind(...values: unknown[]) {
          boundValues.push(...values);
          return this;
        },
        async first<T = MockRow>(): Promise<T | null> {
          const results = await this.all<T>();
          return results.results[0] ?? null;
        },
        async all<T = MockRow>(): Promise<MockResult & { results: T[] }> {
          const lowerQuery = query.toLowerCase();

          // INSERT operations
          if (lowerQuery.includes("insert into events")) {
            const events = storage.get("events") ?? [];
            const [
              id,
              org_id,
              title,
              description,
              location,
              starts_at,
              ends_at,
              event_type,
              created_by,
            ] = boundValues;
            events.push({
              id: id as string,
              org_id: org_id as string,
              title: title as string,
              description: description as string | null,
              location: location as string | null,
              starts_at: starts_at as string,
              ends_at: ends_at as string | null,
              event_type: event_type as string,
              created_by: created_by as string,
              created_at: new Date().toISOString(),
            });
            storage.set("events", events);
            return { results: [] as T[], success: true, meta: { changes: 1 } };
          }

          // SELECT upcoming events
          if (
            lowerQuery.includes("select") &&
            lowerQuery.includes("starts_at >= datetime")
          ) {
            const events = storage.get("events") ?? [];
            const orgId = boundValues[0];
            const now = new Date().toISOString();
            const upcoming = events
              .filter((e) => e.org_id === orgId && e.starts_at >= now)
              .sort((a, b) =>
                (a.starts_at as string).localeCompare(b.starts_at as string),
              );
            return { results: upcoming as T[], success: true, meta: {} };
          }

          // SELECT by ID (+ org_id)
          if (
            lowerQuery.includes("select") &&
            lowerQuery.includes("where id = ?")
          ) {
            const events = storage.get("events") ?? [];
            const id = boundValues[0];
            const orgId = boundValues[1];
            const event = events.find(
              (e) => e.id === id && (!orgId || e.org_id === orgId),
            );
            return {
              results: event ? ([event] as T[]) : [],
              success: true,
              meta: {},
            };
          }

          // UPDATE (id is second-to-last, orgId is last)
          if (lowerQuery.includes("update events")) {
            const events = storage.get("events") ?? [];
            const orgId = boundValues[boundValues.length - 1];
            const id = boundValues[boundValues.length - 2];
            const index = events.findIndex(
              (e) => e.id === id && (!orgId || e.org_id === orgId),
            );
            if (index >= 0) {
              // Parse SET clause to update fields
              const [title, description, location, starts_at, ends_at] =
                boundValues;
              events[index] = {
                ...events[index],
                title: title as string,
                description: description as string | null,
                location: location as string | null,
                starts_at: starts_at as string,
                ends_at: ends_at as string | null,
              };
              storage.set("events", events);
              return {
                results: [] as T[],
                success: true,
                meta: { changes: 1 },
              };
            }
            return { results: [] as T[], success: true, meta: { changes: 0 } };
          }

          // DELETE (id + orgId)
          if (lowerQuery.includes("delete from events")) {
            const events = storage.get("events") ?? [];
            const id = boundValues[0];
            const orgId = boundValues[1];
            const filtered = events.filter(
              (e) => !(e.id === id && (!orgId || e.org_id === orgId)),
            );
            const changes = events.length - filtered.length;
            storage.set("events", filtered);
            return { results: [] as T[], success: true, meta: { changes } };
          }

          return { results: [] as T[], success: true, meta: {} };
        },
        async run(): Promise<MockResult> {
          const result = await this.all();
          return { results: [], success: result.success, meta: result.meta };
        },
      };
    },
    batch: async (statements: unknown[]) => {
      const results = await Promise.all(
        statements.map((stmt: any) =>
          stmt.run ? stmt.run() : Promise.resolve({}),
        ),
      );
      return results;
    },
    dump: async () => new ArrayBuffer(0),
    exec: async () => ({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

describe("Events Database", () => {
  let db: D1Database;
  const testMemberId = "member-001";

  beforeEach(() => {
    db = createMockDb();
  });

  describe("createEvents", () => {
    it("inserts multiple events", async () => {
      const events = [
        {
          title: "Weekly Rehearsal",
          description: "Regular rehearsal",
          location: "Concert Hall",
          starts_at: "2026-02-01T19:00:00Z",
          ends_at: "2026-02-01T21:00:00Z",
          event_type: "rehearsal" as EventType,
        },
        {
          title: "Spring Concert",
          description: "Season finale",
          location: "Opera House",
          starts_at: "2026-04-15T20:00:00Z",
          ends_at: "2026-04-15T22:00:00Z",
          event_type: "concert" as EventType,
        },
      ];

      const created = await createEvents(db, TEST_ORG_ID, events, testMemberId);

      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({
        title: "Weekly Rehearsal",
        event_type: "rehearsal",
      });
      expect(created[1]).toMatchObject({
        title: "Spring Concert",
        event_type: "concert",
      });
    });
  });

  describe("getUpcomingEvents", () => {
    it("returns events ordered by starts_at", async () => {
      // Use relative dates to avoid test becoming flaky as time passes
      const now = new Date();
      const inOneMonth = new Date(
        now.getTime() + 30 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const inTwoMonths = new Date(
        now.getTime() + 60 * 24 * 60 * 60 * 1000,
      ).toISOString();
      const inThreeMonths = new Date(
        now.getTime() + 90 * 24 * 60 * 60 * 1000,
      ).toISOString();

      // Create events in non-chronological order
      await createEvents(
        db,
        TEST_ORG_ID,
        [
          {
            title: "Event C",
            starts_at: inThreeMonths,
            event_type: "rehearsal" as EventType,
          },
          {
            title: "Event A",
            starts_at: inOneMonth,
            event_type: "rehearsal" as EventType,
          },
          {
            title: "Event B",
            starts_at: inTwoMonths,
            event_type: "concert" as EventType,
          },
        ],
        testMemberId,
      );

      const upcoming = await getUpcomingEvents(db, TEST_ORG_ID);

      expect(upcoming).toHaveLength(3);
      expect(upcoming[0].title).toBe("Event A");
      expect(upcoming[1].title).toBe("Event B");
      expect(upcoming[2].title).toBe("Event C");
    });

    it("excludes past events", async () => {
      const pastDate = "2025-01-01T19:00:00Z";
      const futureDate = "2026-12-31T19:00:00Z";

      await createEvents(
        db,
        TEST_ORG_ID,
        [
          {
            title: "Past Event",
            starts_at: pastDate,
            event_type: "rehearsal" as EventType,
          },
          {
            title: "Future Event",
            starts_at: futureDate,
            event_type: "concert" as EventType,
          },
        ],
        testMemberId,
      );

      const upcoming = await getUpcomingEvents(db, TEST_ORG_ID);

      expect(upcoming).toHaveLength(1);
      expect(upcoming[0].title).toBe("Future Event");
    });
  });

  describe("getEventById", () => {
    it("returns event with details", async () => {
      const [created] = await createEvents(
        db,
        TEST_ORG_ID,
        [
          {
            title: "Test Event",
            description: "Test description",
            location: "Test Location",
            starts_at: "2026-02-01T19:00:00Z",
            ends_at: "2026-02-01T21:00:00Z",
            event_type: "rehearsal" as EventType,
          },
        ],
        testMemberId,
      );

      const event = await getEventById(db, created.id, TEST_ORG_ID);

      expect(event).not.toBeNull();
      expect(event?.title).toBe("Test Event");
      expect(event?.description).toBe("Test description");
      expect(event?.location).toBe("Test Location");
      expect(event?.event_type).toBe("rehearsal");
    });

    it("returns null for non-existent event", async () => {
      const event = await getEventById(db, "non-existent-id", TEST_ORG_ID);
      expect(event).toBeNull();
    });
  });

  describe("updateEvent", () => {
    it("updates event fields", async () => {
      const [created] = await createEvents(
        db,
        TEST_ORG_ID,
        [
          {
            title: "Original Title",
            starts_at: "2026-02-01T19:00:00Z",
            event_type: "rehearsal" as EventType,
          },
        ],
        testMemberId,
      );

      const updated = await updateEvent(
        db,
        created.id,
        {
          title: "Updated Title",
          description: "New description",
          location: "New location",
        },
        TEST_ORG_ID,
      );

      expect(updated).toBe(true);

      const event = await getEventById(db, created.id, TEST_ORG_ID);
      expect(event?.title).toBe("Updated Title");
      expect(event?.description).toBe("New description");
      expect(event?.location).toBe("New location");
    });
  });

  describe("deleteEvent", () => {
    it("deletes event", async () => {
      const [created] = await createEvents(
        db,
        TEST_ORG_ID,
        [
          {
            title: "To Delete",
            starts_at: "2026-02-01T19:00:00Z",
            event_type: "rehearsal" as EventType,
          },
        ],
        testMemberId,
      );

      const deleted = await deleteEvent(db, created.id, TEST_ORG_ID);
      expect(deleted).toBe(true);

      const event = await getEventById(db, created.id, TEST_ORG_ID);
      expect(event).toBeNull();
    });
  });
});
