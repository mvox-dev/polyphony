// Season repertoire database layer tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addWorkToSeason,
  removeWorkFromSeason,
  reorderSeasonWorks,
  updateSeasonWorkNotes,
  addEditionToSeasonWork,
  removeEditionFromSeasonWork,
  setPrimaryEdition,
  getSeasonRepertoire,
  getSeasonWork,
  isWorkInSeason,
} from "./season-repertoire";

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

describe("Season Repertoire - Works", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("addWorkToSeason", () => {
    it("adds a work with auto-incremented display order", async () => {
      // Mock: get max display_order returns 2
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        max: 2,
      });

      const result = await addWorkToSeason(
        db,
        "season-1",
        "work-1",
        "member-1",
      );

      expect(result.season_id).toBe("season-1");
      expect(result.work_id).toBe("work-1");
      expect(result.display_order).toBe(3); // max + 1
      expect(result.added_by).toBe("member-1");
      expect(result.id).toBeDefined();
    });

    it("starts at 0 when no works exist", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        max: null,
      });

      const result = await addWorkToSeason(db, "season-1", "work-1");

      expect(result.display_order).toBe(0);
    });

    it("throws error on duplicate work in season", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        max: 0,
      });
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error(
          "UNIQUE constraint failed: season_works.season_id, season_works.work_id",
        ),
      );

      await expect(addWorkToSeason(db, "season-1", "work-1")).rejects.toThrow(
        "Work is already in this season's repertoire",
      );
    });
  });

  describe("removeWorkFromSeason", () => {
    it("returns true when work removed", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const result = await removeWorkFromSeason(db, "sw-1");

      expect(result).toBe(true);
    });

    it("returns false when work not found", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 0 },
      });

      const result = await removeWorkFromSeason(db, "nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("reorderSeasonWorks", () => {
    it("updates display_order for all works", async () => {
      const seasonWorkIds = ["sw-3", "sw-1", "sw-2"];

      await reorderSeasonWorks(db, "season-1", seasonWorkIds);

      expect(db.batch).toHaveBeenCalledTimes(1);
      expect(db.prepare).toHaveBeenCalledWith(
        "UPDATE season_works SET display_order = ? WHERE id = ? AND season_id = ?",
      );
    });
  });

  describe("updateSeasonWorkNotes", () => {
    it("updates notes and returns true", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const result = await updateSeasonWorkNotes(
        db,
        "sw-1",
        "Performance notes",
      );

      expect(result).toBe(true);
    });
  });

  describe("getSeasonWork", () => {
    it("returns season work when found", async () => {
      const mockRow = {
        id: "sw-1",
        season_id: "season-1",
        work_id: "work-1",
        display_order: 0,
        notes: null,
        added_at: "2026-01-30T12:00:00Z",
        added_by: "member-1",
      };
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockRow,
      );

      const result = await getSeasonWork(db, "sw-1");

      expect(result).toEqual(mockRow);
    });

    it("returns null when not found", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const result = await getSeasonWork(db, "nonexistent");

      expect(result).toBeNull();
    });
  });

  describe("isWorkInSeason", () => {
    it("returns true when work exists in season", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        1: 1,
      });

      const result = await isWorkInSeason(db, "season-1", "work-1");

      expect(result).toBe(true);
    });

    it("returns false when work not in season", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const result = await isWorkInSeason(db, "season-1", "work-1");

      expect(result).toBe(false);
    });
  });
});

describe("Season Repertoire - Editions", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("addEditionToSeasonWork", () => {
    it("adds edition and makes it primary if first", async () => {
      // Mock: count returns 0 (first edition)
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 0,
      });

      const result = await addEditionToSeasonWork(db, {
        seasonWorkId: "sw-1",
        editionId: "edition-1",
        addedBy: "member-1",
      });

      expect(result.season_work_id).toBe("sw-1");
      expect(result.edition_id).toBe("edition-1");
      expect(result.is_primary).toBe(true); // First edition is primary
      expect(result.id).toBeDefined();
    });

    it("adds non-primary edition when others exist", async () => {
      // Mock: count returns 2 (existing editions)
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 2,
      });

      const result = await addEditionToSeasonWork(db, {
        seasonWorkId: "sw-1",
        editionId: "edition-2",
        isPrimary: false,
      });

      expect(result.is_primary).toBe(false);
    });

    it("clears existing primaries when adding as primary", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });

      await addEditionToSeasonWork(db, {
        seasonWorkId: "sw-1",
        editionId: "edition-2",
        isPrimary: true,
      });

      // Should have called UPDATE to clear primaries
      expect(db.prepare).toHaveBeenCalledWith(
        "UPDATE season_work_editions SET is_primary = 0 WHERE season_work_id = ?",
      );
    });

    it("throws error on duplicate edition", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        count: 1,
      });
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("UNIQUE constraint failed"),
      );

      await expect(
        addEditionToSeasonWork(db, {
          seasonWorkId: "sw-1",
          editionId: "edition-1",
        }),
      ).rejects.toThrow("Edition is already selected for this work");
    });
  });

  describe("removeEditionFromSeasonWork", () => {
    it("returns true when edition removed", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const result = await removeEditionFromSeasonWork(db, "swe-1");

      expect(result).toBe(true);
    });

    it("returns false when edition not found", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 0 },
      });

      const result = await removeEditionFromSeasonWork(db, "nonexistent");

      expect(result).toBe(false);
    });
  });

  describe("setPrimaryEdition", () => {
    it("clears other primaries and sets new primary", async () => {
      await setPrimaryEdition(db, "sw-1", "swe-2");

      // Should call UPDATE twice: clear all, then set one
      expect(db.prepare).toHaveBeenCalledWith(
        "UPDATE season_work_editions SET is_primary = 0 WHERE season_work_id = ?",
      );
      expect(db.prepare).toHaveBeenCalledWith(
        "UPDATE season_work_editions SET is_primary = 1 WHERE id = ?",
      );
    });
  });
});

describe("Season Repertoire - Queries", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("getSeasonRepertoire", () => {
    it("returns empty works array when no works", async () => {
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: [],
      });

      const result = await getSeasonRepertoire(db, "season-1");

      expect(result.seasonId).toBe("season-1");
      expect(result.works).toEqual([]);
    });

    it("returns works with their editions", async () => {
      // Mock season works query
      const mockWorks = [
        {
          id: "sw-1",
          season_id: "season-1",
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
              id: "swe-1",
              season_work_id: "sw-1",
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

      const result = await getSeasonRepertoire(db, "season-1");

      expect(result.works).toHaveLength(1);
      expect(result.works[0].work.title).toBe("Messiah");
      expect(result.works[0].seasonWorkId).toBe("sw-1");
      expect(result.works[0].editions).toHaveLength(1);
      expect(result.works[0].editions[0].edition.name).toBe(
        "Novello Vocal Score",
      );
      expect(result.works[0].editions[0].isPrimary).toBe(true);
      expect(result.works[0].editions[0].workEditionId).toBe("swe-1");
    });
  });
});
