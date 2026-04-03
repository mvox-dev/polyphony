import { describe, it, expect, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  createParticipation,
  getParticipation,
  updateParticipation,
  getEventParticipation,
  getParticipationSummary,
  deleteParticipation,
} from "./participation";
import type {
  CreateParticipationInput,
  UpdateParticipationInput,
} from "$lib/types";

// Mock D1Database for testing
function createMockDB(): D1Database {
  const participation = new Map<string, any>();
  const members = new Map<string, any>();

  // Seed some members
  members.set("mem_123", { id: "mem_123", email: "test@test.com" });
  members.set("mem_conductor", {
    id: "mem_conductor",
    email: "conductor@test.com",
  });

  return {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => ({
          first: async () => {
            if (sql.includes("SELECT * FROM participation")) {
              const [memberId, eventId] = params;
              const key = `${memberId}_${eventId}`;
              return participation.get(key) || null;
            }
            if (sql.includes("SELECT COUNT(*) as count FROM members")) {
              return { count: members.size };
            }
            return null;
          },
          all: async () => {
            if (
              sql.includes("SELECT * FROM participation WHERE event_id = ?")
            ) {
              const [eventId] = params;
              const results = Array.from(participation.values()).filter(
                (p) => p.event_id === eventId,
              );
              return { results };
            }
            if (
              sql.includes(
                "SELECT planned_status, actual_status FROM participation",
              )
            ) {
              const [eventId] = params;
              const results = Array.from(participation.values())
                .filter((p) => p.event_id === eventId)
                .map((p) => ({
                  planned_status: p.planned_status,
                  actual_status: p.actual_status,
                }));
              return { results };
            }
            return { results: [] };
          },
          run: async () => {
            if (sql.includes("INSERT INTO participation")) {
              const [
                id,
                memberId,
                eventId,
                plannedStatus,
                plannedAt,
                plannedNotes,
              ] = params;
              const key = `${memberId}_${eventId}`;

              // Check for duplicate
              if (participation.has(key)) {
                throw new Error("UNIQUE constraint failed");
              }

              participation.set(key, {
                id,
                member_id: memberId,
                event_id: eventId,
                planned_status: plannedStatus,
                planned_at: plannedAt,
                planned_notes: plannedNotes,
                actual_status: null,
                recorded_at: null,
                recorded_by: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE participation")) {
              const memberId = params[params.length - 2];
              const eventId = params[params.length - 1];
              const key = `${memberId}_${eventId}`;
              const record = participation.get(key);

              if (!record) {
                return { success: false, meta: { changes: 0 } };
              }

              // Parse SQL to understand what's being updated
              // Format: SET updated_at = ?, [other fields], WHERE member_id = ? AND event_id = ?
              record.updated_at = params[0]; // First param is always updated_at

              let paramIndex = 1;
              if (sql.includes("planned_status =")) {
                record.planned_status = params[paramIndex++];
                record.planned_at = params[paramIndex++];
              }
              if (sql.includes("planned_notes =")) {
                record.planned_notes = params[paramIndex++];
              }
              if (sql.includes("actual_status =")) {
                record.actual_status = params[paramIndex++];
                record.recorded_at = params[paramIndex++];
              }
              if (sql.includes("recorded_by =")) {
                record.recorded_by = params[paramIndex++];
              }

              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("DELETE FROM participation")) {
              const [memberId, eventId] = params;
              const key = `${memberId}_${eventId}`;
              const had = participation.has(key);
              participation.delete(key);
              return { success: had, meta: { changes: had ? 1 : 0 } };
            }
            return { success: false, meta: { changes: 0 } };
          },
        }),
        all: async () => ({ results: [] }),
        first: async () => null,
        run: async () => ({ success: false, meta: { changes: 0 } }),
      };
    },
    dump: () => new ArrayBuffer(0),
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

let mockDb: D1Database;

describe("Participation Database Functions", () => {
  beforeEach(() => {
    mockDb = createMockDB();
  });

  describe("createParticipation", () => {
    it("should create participation with planned status", async () => {
      const input: CreateParticipationInput = {
        memberId: "mem_123",
        eventId: "evt_456",
        plannedStatus: "yes",
      };

      const result = await createParticipation(mockDb, input);

      expect(result.memberId).toBe("mem_123");
      expect(result.eventId).toBe("evt_456");
      expect(result.plannedStatus).toBe("yes");
      expect(result.actualStatus).toBeNull();
    });

    it("should create participation without planned status", async () => {
      const input: CreateParticipationInput = {
        memberId: "mem_123",
        eventId: "evt_456",
      };

      const result = await createParticipation(mockDb, input);

      expect(result.plannedStatus).toBeNull();
    });

    it("should throw on duplicate member+event", async () => {
      const input: CreateParticipationInput = {
        memberId: "mem_123",
        eventId: "evt_456",
        plannedStatus: "yes",
      };

      await createParticipation(mockDb, input);

      await expect(createParticipation(mockDb, input)).rejects.toThrow(
        "UNIQUE constraint",
      );
    });
  });

  describe("getParticipation", () => {
    it("should return participation by member and event", async () => {
      // Create a participation record first
      await createParticipation(mockDb, {
        memberId: "mem_123",
        eventId: "evt_456",
        plannedStatus: "yes",
      });

      const participation = await getParticipation(
        mockDb,
        "mem_123",
        "evt_456",
      );

      expect(participation).toBeDefined();
      expect(participation?.memberId).toBe("mem_123");
    });

    it("should return null if not found", async () => {
      const participation = await getParticipation(
        mockDb,
        "invalid",
        "invalid",
      );

      expect(participation).toBeNull();
    });
  });

  describe("updateParticipation", () => {
    it("should update planned status", async () => {
      // Create first
      await createParticipation(mockDb, {
        memberId: "mem_123",
        eventId: "evt_456",
        plannedStatus: "maybe",
      });

      // Update
      const updated = await updateParticipation(mockDb, "mem_123", "evt_456", {
        plannedStatus: "yes",
      });

      expect(updated?.plannedStatus).toBe("yes");
    });

    it("should record actual attendance", async () => {
      // Create first
      await createParticipation(mockDb, {
        memberId: "mem_123",
        eventId: "evt_456",
      });

      const updated = await updateParticipation(mockDb, "mem_123", "evt_456", {
        actualStatus: "present",
        recordedBy: "mem_conductor",
      });

      expect(updated?.actualStatus).toBe("present");
      expect(updated?.recordedBy).toBe("mem_conductor");
    });

    it("should return null if participation does not exist", async () => {
      const updated = await updateParticipation(mockDb, "invalid", "invalid", {
        plannedStatus: "yes",
      });

      expect(updated).toBeNull();
    });
  });

  describe("getEventParticipation", () => {
    it("should return all participation for an event", async () => {
      const participation = await getEventParticipation(mockDb, "evt_456");

      expect(Array.isArray(participation)).toBe(true);
    });

    it("should return empty array if no participation", async () => {
      const participation = await getEventParticipation(mockDb, "evt_empty");

      expect(participation).toEqual([]);
    });
  });

  describe("getParticipationSummary", () => {
    it("should calculate summary statistics", async () => {
      const summary = await getParticipationSummary(mockDb, "evt_456");

      expect(summary.eventId).toBe("evt_456");
      expect(summary.totalMembers).toBeGreaterThanOrEqual(0);
      expect(summary.plannedYes).toBeGreaterThanOrEqual(0);
    });

    it("should handle event with no participation", async () => {
      const summary = await getParticipationSummary(mockDb, "evt_empty");

      expect(summary.totalMembers).toBe(0);
      expect(summary.plannedYes).toBe(0);
      expect(summary.noResponse).toBe(0);
    });
  });

  describe("deleteParticipation", () => {
    it("should delete participation record", async () => {
      await createParticipation(mockDb, {
        memberId: "mem_123",
        eventId: "evt_456",
      });

      const deleted = await deleteParticipation(mockDb, "mem_123", "evt_456");

      expect(deleted).toBe(true);
    });

    it("should return false if not found", async () => {
      const deleted = await deleteParticipation(mockDb, "invalid", "invalid");

      expect(deleted).toBe(false);
    });
  });
});
