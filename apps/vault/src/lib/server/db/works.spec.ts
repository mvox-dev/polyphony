// Works database layer tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  createWork,
  getWorkById,
  getAllWorks,
  updateWork,
  deleteWork,
  searchWorks,
} from "./works";
import type { Work } from "$lib/types";

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

describe("Works database layer", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("createWork", () => {
    it("creates a work with title only", async () => {
      const work = await createWork(db, {
        orgId: TEST_ORG_ID,
        title: "Messiah",
      });

      expect(work.title).toBe("Messiah");
      expect(work.orgId).toBe(TEST_ORG_ID);
      expect(work.composer).toBeNull();
      expect(work.lyricist).toBeNull();
      expect(work.id).toBeDefined();
      expect(work.createdAt).toBeDefined();
    });

    it("creates a work with all fields", async () => {
      const work = await createWork(db, {
        orgId: TEST_ORG_ID,
        title: "Messiah",
        composer: "Handel",
        lyricist: "Jennens",
      });

      expect(work.title).toBe("Messiah");
      expect(work.composer).toBe("Handel");
      expect(work.lyricist).toBe("Jennens");
    });

    it("generates unique IDs", async () => {
      const work1 = await createWork(db, {
        orgId: TEST_ORG_ID,
        title: "Work 1",
      });
      const work2 = await createWork(db, {
        orgId: TEST_ORG_ID,
        title: "Work 2",
      });

      expect(work1.id).not.toBe(work2.id);
    });
  });

  describe("getWorkById", () => {
    it("returns work when found", async () => {
      const mockRow = {
        id: "work-123",
        org_id: TEST_ORG_ID,
        title: "Messiah",
        composer: "Handel",
        lyricist: null,
        created_at: "2026-01-29T12:00:00Z",
      };
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockRow,
      );

      const work = await getWorkById(db, "work-123", TEST_ORG_ID);

      expect(work).not.toBeNull();
      expect(work?.title).toBe("Messiah");
      expect(work?.composer).toBe("Handel");
      expect(work?.lyricist).toBeNull();
      expect(work?.orgId).toBe(TEST_ORG_ID);
    });

    it("returns null when not found", async () => {
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        null,
      );

      const work = await getWorkById(db, "nonexistent", TEST_ORG_ID);

      expect(work).toBeNull();
    });
  });

  describe("getAllWorks", () => {
    it("returns empty array when no works", async () => {
      const works = await getAllWorks(db, TEST_ORG_ID);

      expect(works).toEqual([]);
    });

    it("returns all works ordered by title", async () => {
      const mockRows = [
        {
          id: "1",
          org_id: TEST_ORG_ID,
          title: "Ave Maria",
          composer: "Schubert",
          lyricist: null,
          created_at: "2026-01-29",
        },
        {
          id: "2",
          org_id: TEST_ORG_ID,
          title: "Messiah",
          composer: "Handel",
          lyricist: "Jennens",
          created_at: "2026-01-29",
        },
      ];
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: mockRows,
      });

      const works = await getAllWorks(db, TEST_ORG_ID);

      expect(works).toHaveLength(2);
      expect(works[0].title).toBe("Ave Maria");
      expect(works[1].title).toBe("Messiah");
    });
  });

  describe("updateWork", () => {
    it("updates work title", async () => {
      const mockRow = {
        id: "work-123",
        org_id: TEST_ORG_ID,
        title: "Updated Title",
        composer: "Handel",
        lyricist: null,
        created_at: "2026-01-29T12:00:00Z",
      };
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockRow,
      );

      const work = await updateWork(
        db,
        "work-123",
        { title: "Updated Title" },
        TEST_ORG_ID,
      );

      expect(work?.title).toBe("Updated Title");
    });

    it("clears optional fields when set to null", async () => {
      const mockRow = {
        id: "work-123",
        org_id: TEST_ORG_ID,
        title: "Messiah",
        composer: null,
        lyricist: null,
        created_at: "2026-01-29T12:00:00Z",
      };
      (db.prepare("").first as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        mockRow,
      );

      const work = await updateWork(
        db,
        "work-123",
        { composer: null },
        TEST_ORG_ID,
      );

      expect(work?.composer).toBeNull();
    });

    it("returns null when work not found", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 0 },
      });

      const work = await updateWork(
        db,
        "nonexistent",
        { title: "New Title" },
        TEST_ORG_ID,
      );

      expect(work).toBeNull();
    });
  });

  describe("deleteWork", () => {
    it("deletes existing work", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 1 },
      });

      const deleted = await deleteWork(db, "work-123", TEST_ORG_ID);

      expect(deleted).toBe(true);
    });

    it("returns false when work not found", async () => {
      (db.prepare("").run as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        meta: { changes: 0 },
      });

      const deleted = await deleteWork(db, "nonexistent", TEST_ORG_ID);

      expect(deleted).toBe(false);
    });
  });

  describe("searchWorks", () => {
    it("searches by title", async () => {
      const mockRows = [
        {
          id: "1",
          org_id: TEST_ORG_ID,
          title: "Messiah",
          composer: "Handel",
          lyricist: null,
          created_at: "2026-01-29",
        },
      ];
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: mockRows,
      });

      const works = await searchWorks(db, TEST_ORG_ID, "mess");

      expect(works).toHaveLength(1);
      expect(works[0].title).toBe("Messiah");
    });

    it("searches by composer", async () => {
      const mockRows = [
        {
          id: "1",
          org_id: TEST_ORG_ID,
          title: "Messiah",
          composer: "Handel",
          lyricist: null,
          created_at: "2026-01-29",
        },
      ];
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: mockRows,
      });

      const works = await searchWorks(db, TEST_ORG_ID, "handel");

      expect(works).toHaveLength(1);
    });

    it("returns empty array for no matches", async () => {
      (db.prepare("").all as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        results: [],
      });

      const works = await searchWorks(db, TEST_ORG_ID, "xyz");

      expect(works).toEqual([]);
    });
  });
});
