// Seasons database layer tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  createSeason,
  getSeason,
  getAllSeasons,
  getSeasonByDate,
  getSeasonEvents,
  updateSeason,
  deleteSeason,
} from "./seasons";

// Test org ID (matches DEFAULT_ORG_ID)
const TEST_ORG_ID = createOrgId("org_crede_001");

// Mock D1Database
function createMockDb() {
  const mockRun = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
  const mockFirst = vi.fn();
  const mockAll = vi.fn().mockResolvedValue({ results: [] });
  const mockBind = vi.fn().mockReturnThis();

  return {
    prepare: vi.fn().mockReturnValue({
      bind: mockBind,
      run: mockRun,
      first: mockFirst,
      all: mockAll,
    }),
    _mocks: { mockRun, mockFirst, mockAll, mockBind },
  } as unknown as D1Database & { _mocks: typeof import("vitest") };
}

describe("Seasons database layer", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("createSeason", () => {
    it("creates a season with name and start_date", async () => {
      const season = await createSeason(db, {
        orgId: TEST_ORG_ID,
        name: "Fall 2026",
        start_date: "2026-09-01",
      });

      expect(season.name).toBe("Fall 2026");
      expect(season.start_date).toBe("2026-09-01");
      expect(season.orgId).toBe(TEST_ORG_ID);
      expect(season.id).toBeDefined();
      expect(season.created_at).toBeDefined();
      expect(season.updated_at).toBeDefined();
    });

    it("generates unique IDs", async () => {
      const season1 = await createSeason(db, {
        orgId: TEST_ORG_ID,
        name: "Fall 2026",
        start_date: "2026-09-01",
      });
      const season2 = await createSeason(db, {
        orgId: TEST_ORG_ID,
        name: "Spring 2027",
        start_date: "2027-01-15",
      });

      expect(season1.id).not.toBe(season2.id);
    });

    it("throws error on duplicate start_date", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("UNIQUE constraint failed: seasons.start_date"),
      );

      await expect(
        createSeason(db, {
          orgId: TEST_ORG_ID,
          name: "Duplicate",
          start_date: "2026-09-01",
        }),
      ).rejects.toThrow("Season with start date 2026-09-01 already exists");
    });
  });

  describe("getSeason", () => {
    it("returns season when found", async () => {
      const mockRow = {
        id: "season-123",
        name: "Fall 2026",
        start_date: "2026-09-01",
        created_at: "2026-01-30T12:00:00Z",
        updated_at: "2026-01-30T12:00:00Z",
      };
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockRow,
      );

      const season = await getSeason(db, "season-123", TEST_ORG_ID);

      expect(season).toEqual(mockRow);
    });

    it("returns null when not found", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const season = await getSeason(db, "nonexistent", TEST_ORG_ID);

      expect(season).toBeNull();
    });
  });

  describe("getAllSeasons", () => {
    it("returns all seasons ordered by start_date DESC", async () => {
      const mockSeasons = [
        {
          id: "s2",
          org_id: TEST_ORG_ID,
          name: "Spring 2027",
          start_date: "2027-01-15",
          created_at: "",
          updated_at: "",
        },
        {
          id: "s1",
          org_id: TEST_ORG_ID,
          name: "Fall 2026",
          start_date: "2026-09-01",
          created_at: "",
          updated_at: "",
        },
      ];
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: mockSeasons,
      });

      const seasons = await getAllSeasons(db, TEST_ORG_ID);

      expect(seasons).toHaveLength(2);
      expect(seasons[0].name).toBe("Spring 2027");
      expect(seasons[1].name).toBe("Fall 2026");
    });

    it("returns empty array when no seasons", async () => {
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: [],
      });

      const seasons = await getAllSeasons(db, TEST_ORG_ID);

      expect(seasons).toEqual([]);
    });
  });

  describe("getSeasonByDate", () => {
    it("returns the season containing the date", async () => {
      const mockSeason = {
        id: "s1",
        org_id: TEST_ORG_ID,
        name: "Fall 2026",
        start_date: "2026-09-01",
        created_at: "",
        updated_at: "",
      };
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockSeason,
      );

      const season = await getSeasonByDate(db, TEST_ORG_ID, "2026-10-15");

      expect(season?.orgId).toBe(TEST_ORG_ID);
      expect(season?.name).toBe("Fall 2026");
      // Verify query uses ORDER BY start_date DESC LIMIT 1
      expect(db.prepare).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY start_date DESC LIMIT 1"),
      );
    });

    it("returns null when date is before all seasons", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const season = await getSeasonByDate(db, TEST_ORG_ID, "2020-01-01");

      expect(season).toBeNull();
    });
  });

  describe("getSeasonEvents", () => {
    it("returns empty array when season not found", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const events = await getSeasonEvents(db, "nonexistent", TEST_ORG_ID);

      expect(events).toEqual([]);
    });

    it("queries events in date range when next season exists", async () => {
      const mockSeason = {
        id: "s1",
        name: "Fall 2026",
        start_date: "2026-09-01",
        created_at: "",
        updated_at: "",
      };
      const mockNextSeason = { start_date: "2027-01-15" };
      const mockEvents = [
        { id: "e1", title: "Concert 1", starts_at: "2026-10-01T19:00:00Z" },
        { id: "e2", title: "Concert 2", starts_at: "2026-12-20T19:00:00Z" },
      ];

      // First call: getSeason
      (db.prepare("").first as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockSeason)
        // Second call: find next season
        .mockResolvedValueOnce(mockNextSeason);
      // Third call: get events
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: mockEvents,
      });

      const events = await getSeasonEvents(db, "s1", TEST_ORG_ID);

      expect(events).toHaveLength(2);
    });

    it("queries events without upper bound for most recent season", async () => {
      const mockSeason = {
        id: "s1",
        name: "Spring 2027",
        start_date: "2027-01-15",
        created_at: "",
        updated_at: "",
      };
      const mockEvents = [
        { id: "e1", title: "Concert", starts_at: "2027-03-01T19:00:00Z" },
      ];

      // First call: getSeason
      (db.prepare("").first as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(mockSeason)
        // Second call: no next season
        .mockResolvedValueOnce(null);
      // Third call: get events (unbounded)
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: mockEvents,
      });

      const events = await getSeasonEvents(db, "s1", TEST_ORG_ID);

      expect(events).toHaveLength(1);
    });
  });

  describe("updateSeason", () => {
    it("returns null when season not found", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const result = await updateSeason(
        db,
        "nonexistent",
        { name: "New Name" },
        TEST_ORG_ID,
      );

      expect(result).toBeNull();
    });

    it("updates name only", async () => {
      const existingSeason = {
        id: "s1",
        name: "Fall 2026",
        start_date: "2026-09-01",
        created_at: "2026-01-30T12:00:00Z",
        updated_at: "2026-01-30T12:00:00Z",
      };
      const updatedSeason = { ...existingSeason, name: "Autumn 2026" };

      (db.prepare("").first as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce(existingSeason)
        .mockResolvedValueOnce(updatedSeason);

      const result = await updateSeason(
        db,
        "s1",
        { name: "Autumn 2026" },
        TEST_ORG_ID,
      );

      expect(result?.name).toBe("Autumn 2026");
    });

    it("returns existing season when no updates provided", async () => {
      const existingSeason = {
        id: "s1",
        name: "Fall 2026",
        start_date: "2026-09-01",
        created_at: "",
        updated_at: "",
      };
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        existingSeason,
      );

      const result = await updateSeason(db, "s1", {}, TEST_ORG_ID);

      expect(result).toEqual(existingSeason);
      // run() should not be called since no updates
      expect(db.prepare("").run).not.toHaveBeenCalled();
    });

    it("throws error on duplicate start_date", async () => {
      const existingSeason = {
        id: "s1",
        name: "Fall 2026",
        start_date: "2026-09-01",
        created_at: "",
        updated_at: "",
      };
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        existingSeason,
      );
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("UNIQUE constraint failed: seasons.start_date"),
      );

      await expect(
        updateSeason(db, "s1", { start_date: "2027-01-15" }, TEST_ORG_ID),
      ).rejects.toThrow("Season with start date 2027-01-15 already exists");
    });
  });

  describe("deleteSeason", () => {
    it("returns true when season deleted", async () => {
      // getSeason (org verification) must find the season first
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        id: "s1",
        org_id: TEST_ORG_ID,
        name: "Fall 2026",
        start_date: "2026-09-01",
        created_at: "",
        updated_at: "",
      });
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const result = await deleteSeason(db, "s1", TEST_ORG_ID);

      expect(result).toBe(true);
    });

    it("returns false when season not found", async () => {
      // getSeason returns null — org verification fails
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const result = await deleteSeason(db, "nonexistent", TEST_ORG_ID);

      expect(result).toBe(false);
    });
  });
});
