// Event repertoire database layer tests
// Issue #121
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addWorkToEvent,
  removeWorkFromEvent,
  reorderEventWorks,
  updateEventWorkNotes,
  addEditionToEventWork,
  removeEditionFromEventWork,
  setPrimaryEdition,
  updateEventWorkEditionNotes,
  getEventRepertoire,
  getEventWork,
  isWorkInEvent,
} from "./event-repertoire";

// Mock D1Database
function createMockDb() {
  const mockRun = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
  const mockFirst = vi.fn();
  const mockAll = vi.fn().mockResolvedValue({ results: [] });
  const mockBind = vi.fn().mockReturnThis();
  const mockBatch = vi.fn().mockResolvedValue([]);

  return {
    prepare: vi.fn().mockReturnValue({
      bind: mockBind,
      run: mockRun,
      first: mockFirst,
      all: mockAll,
    }),
    batch: mockBatch,
    _mocks: { mockRun, mockFirst, mockAll, mockBind, mockBatch },
  } as unknown as D1Database & {
    _mocks: typeof import("vitest");
    batch: typeof mockBatch;
  };
}

describe("Event Repertoire - Works", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("addWorkToEvent", () => {
    it("adds a work with auto-incremented display order", async () => {
      // Mock: get max display_order returns 2
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        max: 2,
      });

      const result = await addWorkToEvent(db, "event-1", "work-1", "member-1");

      expect(result.event_id).toBe("event-1");
      expect(result.work_id).toBe("work-1");
      expect(result.display_order).toBe(3); // max + 1
      expect(result.added_by).toBe("member-1");
      expect(result.id).toBeDefined();
    });

    it("starts at 0 when no works exist", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        max: null,
      });

      const result = await addWorkToEvent(db, "event-1", "work-1");

      expect(result.display_order).toBe(0);
    });

    it("includes notes when provided", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        max: 0,
      });

      const result = await addWorkToEvent(
        db,
        "event-1",
        "work-1",
        null,
        "Special arrangement",
      );

      expect(result.notes).toBe("Special arrangement");
    });

    it("throws error on duplicate work in event", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        max: 0,
      });
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error(
          "UNIQUE constraint failed: event_works.event_id, event_works.work_id",
        ),
      );

      await expect(addWorkToEvent(db, "event-1", "work-1")).rejects.toThrow(
        "Work is already in this event's repertoire",
      );
    });
  });

  describe("removeWorkFromEvent", () => {
    it("returns true when work removed", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const result = await removeWorkFromEvent(db, "ew-1");

      expect(result).toBe(true);
    });

    it("returns false when work not found", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 0 },
      });

      const result = await removeWorkFromEvent(db, "nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("reorderEventWorks", () => {
    it("updates display_order for all works", async () => {
      const eventWorkIds = ["ew-3", "ew-1", "ew-2"];

      await reorderEventWorks(db, "event-1", eventWorkIds);

      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(db.prepare).toHaveBeenCalledWith(
        "UPDATE event_works SET display_order = ? WHERE id = ? AND event_id = ?",
      );
    });
  });

  describe("updateEventWorkNotes", () => {
    it("updates notes and returns true", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const result = await updateEventWorkNotes(
        db,
        "ew-1",
        "Performance notes",
      );

      expect(result).toBe(true);
    });

    it("returns false when work not found", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 0 },
      });

      const result = await updateEventWorkNotes(db, "nonexistent", "Notes");

      expect(result).toBe(false);
    });
  });

  describe("getEventWork", () => {
    it("returns event work when found", async () => {
      const mockRow = {
        id: "ew-1",
        event_id: "event-1",
        work_id: "work-1",
        display_order: 0,
        notes: null,
        added_at: "2026-01-30T12:00:00Z",
        added_by: "member-1",
      };
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockRow,
      );

      const result = await getEventWork(db, "ew-1");

      expect(result).toEqual(mockRow);
    });

    it("returns null when not found", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const result = await getEventWork(db, "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("isWorkInEvent", () => {
    it("returns true when work exists in event", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        1: 1,
      });

      const result = await isWorkInEvent(db, "event-1", "work-1");

      expect(result).toBe(true);
    });

    it("returns false when work not in event", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const result = await isWorkInEvent(db, "event-1", "work-1");

      expect(result).toBe(false);
    });
  });
});

describe("Event Repertoire - Editions", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("addEditionToEventWork", () => {
    it("adds edition and makes it primary if first", async () => {
      // Mock: count returns 0 (first edition)
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 0,
      });

      const result = await addEditionToEventWork(db, {
        eventWorkId: "ew-1",
        editionId: "edition-1",
        addedBy: "member-1",
      });

      expect(result.event_work_id).toBe("ew-1");
      expect(result.edition_id).toBe("edition-1");
      expect(result.is_primary).toBe(true); // First edition is primary
      expect(result.id).toBeDefined();
    });

    it("adds non-primary edition when others exist", async () => {
      // Mock: count returns 2 (existing editions)
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 2,
      });

      const result = await addEditionToEventWork(db, {
        eventWorkId: "ew-1",
        editionId: "edition-2",
        isPrimary: false,
      });

      expect(result.is_primary).toBe(false);
    });

    it("clears existing primaries when adding as primary", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });

      await addEditionToEventWork(db, {
        eventWorkId: "ew-1",
        editionId: "edition-2",
        isPrimary: true,
      });

      // Should have called UPDATE to clear primaries
      expect(db.prepare).toHaveBeenCalledWith(
        "UPDATE event_work_editions SET is_primary = 0 WHERE event_work_id = ?",
      );
    });

    it("includes notes when provided", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 0,
      });

      const result = await addEditionToEventWork(db, {
        eventWorkId: "ew-1",
        editionId: "edition-1",
        notes: "Use this version for the concert",
      });

      expect(result.notes).toBe("Use this version for the concert");
    });

    it("throws error on duplicate edition", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("UNIQUE constraint failed"),
      );

      await expect(
        addEditionToEventWork(db, {
          eventWorkId: "ew-1",
          editionId: "edition-1",
        }),
      ).rejects.toThrow("Edition is already selected for this work");
    });
  });

  describe("removeEditionFromEventWork", () => {
    it("returns true when edition removed", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const result = await removeEditionFromEventWork(db, "ewe-1");

      expect(result).toBe(true);
    });

    it("returns false when edition not found", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 0 },
      });

      const result = await removeEditionFromEventWork(db, "nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("setPrimaryEdition", () => {
    it("clears other primaries and sets new primary", async () => {
      await setPrimaryEdition(db, "ew-1", "ewe-2");

      // Should call UPDATE twice: clear all, then set one
      expect(db.prepare).toHaveBeenCalledWith(
        "UPDATE event_work_editions SET is_primary = 0 WHERE event_work_id = ?",
      );
      expect(db.prepare).toHaveBeenCalledWith(
        "UPDATE event_work_editions SET is_primary = 1 WHERE id = ?",
      );
    });
  });

  describe("updateEventWorkEditionNotes", () => {
    it("updates notes and returns true", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const result = await updateEventWorkEditionNotes(
        db,
        "ewe-1",
        "Updated notes",
      );

      expect(result).toBe(true);
    });

    it("clears notes when set to null", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const result = await updateEventWorkEditionNotes(db, "ewe-1", null);

      expect(result).toBe(true);
    });
  });
});

describe("Event Repertoire - Queries", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("getEventRepertoire", () => {
    it("returns empty works array when no works", async () => {
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: [],
      });

      const result = await getEventRepertoire(db, "event-1");

      expect(result.eventId).toBe("event-1");
      expect(result.works).toEqual([]);
    });

    it("returns works with their editions", async () => {
      // Mock event works query
      const mockWorks = [
        {
          id: "ew-1",
          event_id: "event-1",
          work_id: "work-1",
          display_order: 0,
          notes: null,
          added_at: "2026-01-30T12:00:00Z",
          added_by: null,
          w_id: "work-1",
          w_title: "Messiah",
          w_composer: "Handel",
          w_lyricist: null,
          w_created_at: "2026-01-30T12:00:00Z",
        },
      ];
      (db.prepare("").all as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ results: mockWorks })
        // Mock editions query
        .mockResolvedValueOnce({
          results: [
            {
              id: "ewe-1",
              event_work_id: "ew-1",
              edition_id: "ed-1",
              is_primary: 1,
              notes: null,
              e_id: "ed-1",
              e_work_id: "work-1",
              e_name: "Novello Vocal Score",
              e_arranger: null,
              e_publisher: "Novello",
              e_voicing: "SATB",
              e_edition_type: "vocal_score",
              e_license_type: "public_domain",
              e_notes: null,
              e_external_url: null,
              e_file_key: null,
              e_file_name: null,
              e_file_size: null,
              e_created_at: "2026-01-30T12:00:00Z",
            },
          ],
        });

      const result = await getEventRepertoire(db, "event-1");

      expect(result.works).toHaveLength(1);
      expect(result.works[0].work.title).toBe("Messiah");
      expect(result.works[0].eventWorkId).toBe("ew-1");
      expect(result.works[0].editions).toHaveLength(1);
      expect(result.works[0].editions[0].edition.name).toBe(
        "Novello Vocal Score",
      );
      expect(result.works[0].editions[0].isPrimary).toBe(true);
      expect(result.works[0].editions[0].workEditionId).toBe("ewe-1");
    });

    it("groups editions correctly by event work", async () => {
      // Mock: Two works, each with editions
      const mockWorks = [
        {
          id: "ew-1",
          event_id: "event-1",
          work_id: "work-1",
          display_order: 0,
          notes: null,
          added_at: "2026-01-30T12:00:00Z",
          added_by: null,
          w_id: "work-1",
          w_title: "Messiah",
          w_composer: "Handel",
          w_lyricist: null,
          w_created_at: "2026-01-30T12:00:00Z",
        },
        {
          id: "ew-2",
          event_id: "event-1",
          work_id: "work-2",
          display_order: 1,
          notes: null,
          added_at: "2026-01-30T12:00:00Z",
          added_by: null,
          w_id: "work-2",
          w_title: "Elijah",
          w_composer: "Mendelssohn",
          w_lyricist: null,
          w_created_at: "2026-01-30T12:00:00Z",
        },
      ];
      const mockEditions = [
        {
          id: "ewe-1",
          event_work_id: "ew-1",
          edition_id: "ed-1",
          is_primary: 1,
          notes: null,
          e_id: "ed-1",
          e_work_id: "work-1",
          e_name: "Ed1",
          e_arranger: null,
          e_publisher: null,
          e_voicing: null,
          e_edition_type: "vocal_score",
          e_license_type: "public_domain",
          e_notes: null,
          e_external_url: null,
          e_file_key: null,
          e_file_name: null,
          e_file_size: null,
          e_created_at: "2026-01-30T12:00:00Z",
        },
        {
          id: "ewe-2",
          event_work_id: "ew-2",
          edition_id: "ed-2",
          is_primary: 1,
          notes: null,
          e_id: "ed-2",
          e_work_id: "work-2",
          e_name: "Ed2",
          e_arranger: null,
          e_publisher: null,
          e_voicing: null,
          e_edition_type: "vocal_score",
          e_license_type: "public_domain",
          e_notes: null,
          e_external_url: null,
          e_file_key: null,
          e_file_name: null,
          e_file_size: null,
          e_created_at: "2026-01-30T12:00:00Z",
        },
      ];
      (db.prepare("").all as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ results: mockWorks })
        .mockResolvedValueOnce({ results: mockEditions });

      const result = await getEventRepertoire(db, "event-1");

      expect(result.works).toHaveLength(2);
      expect(result.works[0].editions).toHaveLength(1);
      expect(result.works[0].editions[0].edition.name).toBe("Ed1");
      expect(result.works[1].editions).toHaveLength(1);
      expect(result.works[1].editions[0].edition.name).toBe("Ed2");
    });

    it("handles works without editions", async () => {
      const mockWorks = [
        {
          id: "ew-1",
          event_id: "event-1",
          work_id: "work-1",
          display_order: 0,
          notes: null,
          added_at: "2026-01-30T12:00:00Z",
          added_by: null,
          w_id: "work-1",
          w_title: "Messiah",
          w_composer: "Handel",
          w_lyricist: null,
          w_created_at: "2026-01-30T12:00:00Z",
        },
      ];
      (db.prepare("").all as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ results: mockWorks })
        .mockResolvedValueOnce({ results: [] }); // No editions

      const result = await getEventRepertoire(db, "event-1");

      expect(result.works).toHaveLength(1);
      expect(result.works[0].editions).toEqual([]);
    });
  });
});
