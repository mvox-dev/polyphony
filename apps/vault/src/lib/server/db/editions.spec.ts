// Tests for editions database layer
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  createEdition,
  getEditionById,
  getEditionsByWorkId,
  getAllEditions,
  updateEdition,
  deleteEdition,
} from "./editions";
import type { CreateEditionInput, UpdateEditionInput } from "$lib/types";

const TEST_ORG_ID = createOrgId("org_test_001");

// Mock D1Database
function createMockDb() {
  const mockResults: Record<string, unknown>[] = [];

  const mockStatement = {
    bind: vi.fn().mockReturnThis(),
    first: vi.fn().mockResolvedValue(null),
    all: vi.fn().mockResolvedValue({ results: mockResults }),
    run: vi.fn().mockResolvedValue({ meta: { changes: 1 } }),
  };

  const mockDb = {
    prepare: vi.fn().mockReturnValue(mockStatement),
    batch: vi.fn().mockResolvedValue([]),
    _mockStatement: mockStatement,
    _setFirstResult: (result: unknown) => {
      mockStatement.first.mockResolvedValue(result);
    },
    _setAllResults: (results: unknown[]) => {
      mockStatement.all.mockResolvedValue({ results });
    },
    _setChanges: (changes: number) => {
      mockStatement.run.mockResolvedValue({ meta: { changes } });
    },
  };

  return mockDb as unknown as D1Database & {
    _mockStatement: typeof mockStatement;
    _setFirstResult: (result: unknown) => void;
    _setAllResults: (results: unknown[]) => void;
    _setChanges: (changes: number) => void;
  };
}

// Fixture factory for edition rows
function makeEditionRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "ed-123",
    work_id: "work-123",
    name: "Test Edition",
    arranger: null,
    publisher: null,
    voicing: null,
    edition_type: "vocal_score",
    license_type: "owned",
    notes: null,
    external_url: null,
    file_key: null,
    file_name: null,
    file_size: null,
    file_uploaded_at: null,
    file_uploaded_by: null,
    created_at: "2026-01-29T12:00:00Z",
    ...overrides,
  };
}

describe("Editions database layer", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.clearAllMocks();
  });

  describe("createEdition", () => {
    it("creates an edition with minimal fields", async () => {
      const input: CreateEditionInput = {
        workId: "work-123",
        name: "Novello Vocal Score",
      };

      const edition = await createEdition(mockDb, input);

      expect(edition.id).toBeDefined();
      expect(edition.workId).toBe("work-123");
      expect(edition.name).toBe("Novello Vocal Score");
      expect(edition.editionType).toBe("vocal_score");
      expect(edition.licenseType).toBe("owned");
      expect(edition.arranger).toBeNull();
    });

    it("creates an edition with all fields", async () => {
      const input: CreateEditionInput = {
        workId: "work-123",
        name: "CPDL Transcription",
        arranger: "John Smith",
        publisher: "CPDL",
        voicing: "SATB div.",
        editionType: "full_score",
        licenseType: "public_domain",
        notes: "High quality scan",
        externalUrl: "https://imslp.org/example",
      };

      const edition = await createEdition(mockDb, input);

      expect(edition.name).toBe("CPDL Transcription");
      expect(edition.arranger).toBe("John Smith");
      expect(edition.publisher).toBe("CPDL");
      expect(edition.voicing).toBe("SATB div.");
      expect(edition.editionType).toBe("full_score");
      expect(edition.licenseType).toBe("public_domain");
      expect(edition.notes).toBe("High quality scan");
      expect(edition.externalUrl).toBe("https://imslp.org/example");
    });

    it("creates edition with section assignments", async () => {
      const input: CreateEditionInput = {
        workId: "work-123",
        name: "Soprano Part",
        editionType: "part",
        sectionIds: ["section-s1", "section-s2"],
      };

      const edition = await createEdition(mockDb, input);

      expect(edition.name).toBe("Soprano Part");
      // Verify batch was called for section inserts
      expect(mockDb.batch).toHaveBeenCalled();
    });
  });

  describe("getEditionById", () => {
    it("returns edition when found", async () => {
      const editionRow = makeEditionRow({
        publisher: "Test Publisher",
        voicing: "SATB",
      });
      mockDb._setFirstResult(editionRow);
      mockDb._setAllResults([]);

      const edition = await getEditionById(mockDb, "ed-123", TEST_ORG_ID);

      expect(edition).not.toBeNull();
      expect(edition?.id).toBe("ed-123");
      expect(edition?.workId).toBe("work-123");
      expect(edition?.publisher).toBe("Test Publisher");
      expect(edition?.sectionIds).toEqual([]);
    });

    it("returns null when not found", async () => {
      mockDb._setFirstResult(null);
      const edition = await getEditionById(mockDb, "nonexistent", TEST_ORG_ID);
      expect(edition).toBeNull();
    });

    it("includes section IDs when present", async () => {
      mockDb._setFirstResult(makeEditionRow({ edition_type: "part" }));
      mockDb._setAllResults([
        { section_id: "sec-s1" },
        { section_id: "sec-s2" },
      ]);

      const edition = await getEditionById(mockDb, "ed-123", TEST_ORG_ID);
      expect(edition?.sectionIds).toEqual(["sec-s1", "sec-s2"]);
    });
  });

  describe("getEditionsByWorkId", () => {
    it("returns all editions for a work", async () => {
      const editions = [
        makeEditionRow({
          id: "ed-1",
          name: "Full Score",
          edition_type: "full_score",
          voicing: "SATB",
        }),
        makeEditionRow({
          id: "ed-2",
          name: "Vocal Score",
          arranger: "Smith",
          publisher: "Publisher",
          license_type: "public_domain",
          created_at: "2026-01-29T13:00:00Z",
        }),
      ];
      mockDb._setAllResults(editions);

      const result = await getEditionsByWorkId(mockDb, "work-123", TEST_ORG_ID);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Full Score");
      expect(result[1].name).toBe("Vocal Score");
    });

    it("returns empty array when no editions", async () => {
      mockDb._setAllResults([]);
      const result = await getEditionsByWorkId(
        mockDb,
        "work-no-editions",
        TEST_ORG_ID,
      );
      expect(result).toEqual([]);
    });
  });

  describe("getAllEditions", () => {
    it("returns all editions with work info", async () => {
      const editionsWithWork = [
        {
          ...makeEditionRow({ id: "ed-1", name: "Full Score" }),
          work_title: "Messiah",
          work_composer: "Handel",
        },
        {
          ...makeEditionRow({ id: "ed-2", name: "Vocal Score" }),
          work_title: "Requiem",
          work_composer: "Mozart",
        },
      ];
      mockDb._setAllResults(editionsWithWork);

      const result = await getAllEditions(mockDb, TEST_ORG_ID);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("Full Score");
      expect(result[0].workTitle).toBe("Messiah");
      expect(result[0].workComposer).toBe("Handel");
      expect(result[1].workTitle).toBe("Requiem");
      expect(result[1].workComposer).toBe("Mozart");
    });

    it("returns empty array when no editions", async () => {
      mockDb._setAllResults([]);
      const result = await getAllEditions(mockDb, TEST_ORG_ID);
      expect(result).toEqual([]);
    });

    it("handles works without composer", async () => {
      const editionsWithWork = [
        {
          ...makeEditionRow({ id: "ed-1", name: "Traditional" }),
          work_title: "Anonymous Hymn",
          work_composer: null,
        },
      ];
      mockDb._setAllResults(editionsWithWork);

      const result = await getAllEditions(mockDb, TEST_ORG_ID);

      expect(result[0].workTitle).toBe("Anonymous Hymn");
      expect(result[0].workComposer).toBeNull();
    });
  });

  describe("updateEdition", () => {
    it("updates edition fields", async () => {
      mockDb._setFirstResult(
        makeEditionRow({ name: "New Name", publisher: "New Publisher" }),
      );
      mockDb._setAllResults([]);

      const edition = await updateEdition(
        mockDb,
        "ed-123",
        { name: "New Name", publisher: "New Publisher" },
        TEST_ORG_ID,
      );

      expect(edition?.name).toBe("New Name");
      expect(edition?.publisher).toBe("New Publisher");
    });

    it("returns null when edition not found", async () => {
      mockDb._setChanges(0);
      const edition = await updateEdition(
        mockDb,
        "nonexistent",
        { name: "Test" },
        TEST_ORG_ID,
      );
      expect(edition).toBeNull();
    });

    it("clears optional fields when set to null", async () => {
      mockDb._setFirstResult(
        makeEditionRow({ publisher: "Old Publisher", voicing: "SATB" }),
      );
      mockDb._setAllResults([]);

      const edition = await updateEdition(
        mockDb,
        "ed-123",
        { arranger: null, notes: null },
        TEST_ORG_ID,
      );

      expect(edition?.arranger).toBeNull();
      expect(edition?.notes).toBeNull();
    });
  });

  describe("deleteEdition", () => {
    it("deletes existing edition", async () => {
      mockDb._setFirstResult(makeEditionRow());
      mockDb._setAllResults([]);
      mockDb._setChanges(1);

      const result = await deleteEdition(mockDb, "ed-123", TEST_ORG_ID);

      expect(result).toBe(true);
    });

    it("returns false when edition not found", async () => {
      mockDb._setChanges(0);

      const result = await deleteEdition(mockDb, "nonexistent", TEST_ORG_ID);

      expect(result).toBe(false);
    });
  });
});
