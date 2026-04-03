// Inventory reports database layer tests
// Issue #123 - Missing Copies Report
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getMissingCopiesForEvent,
  getMissingCopiesForSeason,
  getOutstandingCopiesForSeason,
  bulkReturnCopies,
} from "./inventory-reports";

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
  } as unknown as D1Database & { _mocks: typeof import("vitest") };
}

describe("Inventory reports", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("getMissingCopiesForEvent", () => {
    it("returns members in edition sections without assignments", async () => {
      const mockResults = [
        {
          member_id: "member-1",
          member_name: "Alice Singer",
          section_id: "soprano",
          section_name: "Soprano",
          edition_id: "ed-1",
          edition_name: "Novello Vocal Score",
          work_id: "work-1",
          work_title: "Messiah",
          composer: "Handel",
        },
        {
          member_id: "member-2",
          member_name: "Bob Bass",
          section_id: "bass",
          section_name: "Bass",
          edition_id: "ed-1",
          edition_name: "Novello Vocal Score",
          work_id: "work-1",
          work_title: "Messiah",
          composer: "Handel",
        },
      ];
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: mockResults,
      });

      const report = await getMissingCopiesForEvent(db, "event-1");

      expect(report.entries).toHaveLength(2);
      expect(report.totalMissing).toBe(2);
      expect(report.editionCount).toBe(1);

      expect(report.entries[0].memberId).toBe("member-1");
      expect(report.entries[0].memberName).toBe("Alice Singer");
      expect(report.entries[0].sectionName).toBe("Soprano");
      expect(report.entries[0].editionName).toBe("Novello Vocal Score");
      expect(report.entries[0].workTitle).toBe("Messiah");
      expect(report.entries[0].composer).toBe("Handel");
    });

    it("returns empty report when all members have copies", async () => {
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [],
      });

      const report = await getMissingCopiesForEvent(db, "event-1");

      expect(report.entries).toEqual([]);
      expect(report.totalMissing).toBe(0);
      expect(report.editionCount).toBe(0);
    });

    it("counts unique editions correctly with multiple members", async () => {
      const mockResults = [
        {
          member_id: "member-1",
          member_name: "Alice",
          section_id: "soprano",
          section_name: "Soprano",
          edition_id: "ed-1",
          edition_name: "Edition A",
          work_id: "work-1",
          work_title: "Work 1",
          composer: null,
        },
        {
          member_id: "member-2",
          member_name: "Bob",
          section_id: "bass",
          section_name: "Bass",
          edition_id: "ed-1",
          edition_name: "Edition A",
          work_id: "work-1",
          work_title: "Work 1",
          composer: null,
        },
        {
          member_id: "member-3",
          member_name: "Carol",
          section_id: "alto",
          section_name: "Alto",
          edition_id: "ed-2",
          edition_name: "Edition B",
          work_id: "work-2",
          work_title: "Work 2",
          composer: "Bach",
        },
      ];
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: mockResults,
      });

      const report = await getMissingCopiesForEvent(db, "event-1");

      expect(report.totalMissing).toBe(3);
      expect(report.editionCount).toBe(2); // ed-1 and ed-2
    });

    it("handles null composer values", async () => {
      const mockResults = [
        {
          member_id: "member-1",
          member_name: "Alice",
          section_id: "soprano",
          section_name: "Soprano",
          edition_id: "ed-1",
          edition_name: "Traditional Carol",
          work_id: "work-1",
          work_title: "Anonymous Hymn",
          composer: null,
        },
      ];
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: mockResults,
      });

      const report = await getMissingCopiesForEvent(db, "event-1");

      expect(report.entries[0].composer).toBeNull();
    });

    it("includes section ID for grouping", async () => {
      const mockResults = [
        {
          member_id: "member-1",
          member_name: "Alice",
          section_id: "soprano-1",
          section_name: "Soprano I",
          edition_id: "ed-1",
          edition_name: "Edition A",
          work_id: "work-1",
          work_title: "Work 1",
          composer: null,
        },
      ];
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: mockResults,
      });

      const report = await getMissingCopiesForEvent(db, "event-1");

      expect(report.entries[0].sectionId).toBe("soprano-1");
    });

    it("passes event ID to the query", async () => {
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [],
      });

      await getMissingCopiesForEvent(db, "specific-event-id");

      expect(db.prepare("").bind).toHaveBeenCalledWith("specific-event-id");
    });
  });

  describe("getMissingCopiesForSeason", () => {
    it("returns members missing copies for season repertoire", async () => {
      const mockResults = [
        {
          member_id: "member-1",
          member_name: "Alice Singer",
          section_id: "soprano",
          section_name: "Soprano",
          edition_id: "ed-1",
          edition_name: "Season Edition",
          work_id: "work-1",
          work_title: "Season Work",
          composer: "Mozart",
        },
      ];
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: mockResults,
      });

      const report = await getMissingCopiesForSeason(db, "season-1");

      expect(report.entries).toHaveLength(1);
      expect(report.totalMissing).toBe(1);
      expect(report.editionCount).toBe(1);
      expect(report.entries[0].workTitle).toBe("Season Work");
    });

    it("returns empty report when all season members have copies", async () => {
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [],
      });

      const report = await getMissingCopiesForSeason(db, "season-1");

      expect(report.entries).toEqual([]);
      expect(report.totalMissing).toBe(0);
      expect(report.editionCount).toBe(0);
    });

    it("passes season ID to the query", async () => {
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [],
      });

      await getMissingCopiesForSeason(db, "specific-season-id");

      expect(db.prepare("").bind).toHaveBeenCalledWith("specific-season-id");
    });
  });

  // ============================================================================
  // COLLECTION REMINDERS (Issue #126)
  // ============================================================================

  describe("getOutstandingCopiesForSeason", () => {
    it("returns unreturned copies grouped by member", async () => {
      const mockResults = [
        {
          assignment_id: "assign-1",
          member_id: "member-1",
          member_name: "Alice Singer",
          edition_id: "ed-1",
          edition_name: "Novello Vocal Score",
          work_title: "Messiah",
          copy_id: "copy-1",
          copy_number: "01",
          assigned_at: "2026-01-15T12:00:00.000Z",
        },
        {
          assignment_id: "assign-2",
          member_id: "member-1",
          member_name: "Alice Singer",
          edition_id: "ed-1",
          edition_name: "Novello Vocal Score",
          work_title: "Messiah",
          copy_id: "copy-2",
          copy_number: "02",
          assigned_at: "2026-01-16T12:00:00.000Z",
        },
        {
          assignment_id: "assign-3",
          member_id: "member-2",
          member_name: "Bob Bass",
          edition_id: "ed-1",
          edition_name: "Novello Vocal Score",
          work_title: "Messiah",
          copy_id: "copy-3",
          copy_number: "03",
          assigned_at: "2026-01-17T12:00:00.000Z",
        },
      ];
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: mockResults,
      });

      const result = await getOutstandingCopiesForSeason(db, "season-1");

      expect(result).toHaveLength(2); // 2 members
      expect(result[0].memberId).toBe("member-1");
      expect(result[0].memberName).toBe("Alice Singer");
      expect(result[0].copies).toHaveLength(2); // Alice has 2 copies
      expect(result[1].memberId).toBe("member-2");
      expect(result[1].copies).toHaveLength(1); // Bob has 1 copy
    });

    it("returns empty array when all copies collected", async () => {
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [],
      });

      const result = await getOutstandingCopiesForSeason(db, "season-1");

      expect(result).toEqual([]);
    });

    it("includes all copy details", async () => {
      const mockResults = [
        {
          assignment_id: "assign-1",
          member_id: "member-1",
          member_name: "Alice",
          edition_id: "ed-1",
          edition_name: "Edition Name",
          work_title: "Work Title",
          copy_id: "copy-1",
          copy_number: "M-05",
          assigned_at: "2026-01-15T12:00:00.000Z",
        },
      ];
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: mockResults,
      });

      const result = await getOutstandingCopiesForSeason(db, "season-1");

      const copy = result[0].copies[0];
      expect(copy.assignmentId).toBe("assign-1");
      expect(copy.editionId).toBe("ed-1");
      expect(copy.editionName).toBe("Edition Name");
      expect(copy.workTitle).toBe("Work Title");
      expect(copy.copyId).toBe("copy-1");
      expect(copy.copyNumber).toBe("M-05");
      expect(copy.assignedAt).toBe("2026-01-15T12:00:00.000Z");
    });

    it("passes season ID to the query", async () => {
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValue({
        results: [],
      });

      await getOutstandingCopiesForSeason(db, "specific-season-id");

      expect(db.prepare("").bind).toHaveBeenCalledWith("specific-season-id");
    });
  });

  describe("bulkReturnCopies", () => {
    it("marks multiple assignments as returned", async () => {
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValue({
        meta: { changes: 2 },
      });

      const count = await bulkReturnCopies(db, ["assign-1", "assign-2"]);

      expect(count).toBe(2);
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE copy_assignments"),
      );
      expect(db.prepare("").bind).toHaveBeenCalledWith("assign-1", "assign-2");
    });

    it("returns count of affected rows", async () => {
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValue({
        meta: { changes: 3 },
      });

      const count = await bulkReturnCopies(db, ["a", "b", "c"]);

      expect(count).toBe(3);
    });

    it("returns 0 for empty array without database call", async () => {
      const count = await bulkReturnCopies(db, []);

      expect(count).toBe(0);
      expect(db.prepare).not.toHaveBeenCalled();
    });

    it("handles already-returned assignments gracefully", async () => {
      // Only 1 of 2 was actually updated (other was already returned)
      (db.prepare("").bind as ReturnType<typeof vi.fn>).mockReturnThis();
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValue({
        meta: { changes: 1 },
      });

      const count = await bulkReturnCopies(db, ["assign-1", "assign-2"]);

      expect(count).toBe(1);
    });
  });
});
