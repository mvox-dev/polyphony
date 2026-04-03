// Unit tests for event materials query
// Issue #122 - "What to Bring" section

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getEventMaterialsForMember,
  type EventMaterials,
} from "./event-materials";

// Mock D1Database
function createMockDb(results: any[] = []) {
  return {
    prepare: vi.fn().mockReturnValue({
      bind: vi.fn().mockReturnValue({
        all: vi.fn().mockResolvedValue({ results }),
      }),
    }),
  } as unknown as D1Database;
}

describe("Event Materials Query", () => {
  describe("getEventMaterialsForMember", () => {
    it("returns empty materials for event with no repertoire", async () => {
      const db = createMockDb([]);

      const result = await getEventMaterialsForMember(
        db,
        "event-1",
        "member-1",
      );

      expect(result).toEqual({
        eventId: "event-1",
        memberId: "member-1",
        materials: [],
        summary: {
          totalWorks: 0,
          totalEditions: 0,
          copiesAssigned: 0,
          digitalAvailable: 0,
          warningCount: 0,
        },
      });
    });

    it("returns materials with assigned copy", async () => {
      const db = createMockDb([
        {
          work_id: "work-1",
          work_title: "Messiah",
          work_composer: "Handel",
          edition_id: "edition-1",
          edition_name: "Novello Vocal Score",
          is_primary: 1,
          copy_id: "copy-1",
          copy_number: "M-01",
          copy_condition: "good",
          assigned_at: "2025-01-15",
          has_file: 0,
          has_physical_copies: 5,
        },
      ]);

      const result = await getEventMaterialsForMember(
        db,
        "event-1",
        "member-1",
      );

      expect(result.materials).toHaveLength(1);
      expect(result.materials[0]).toEqual({
        work: {
          id: "work-1",
          title: "Messiah",
          composer: "Handel",
        },
        edition: {
          id: "edition-1",
          name: "Novello Vocal Score",
          isPrimary: true,
        },
        assignedCopy: {
          id: "copy-1",
          copyNumber: "M-01",
          condition: "good",
          assignedAt: "2025-01-15",
        },
        hasDigitalFile: false,
        needsCopy: false,
      });
      expect(result.summary.copiesAssigned).toBe(1);
      expect(result.summary.warningCount).toBe(0);
    });

    it("warns when physical copies exist but member has none", async () => {
      const db = createMockDb([
        {
          work_id: "work-1",
          work_title: "Messiah",
          work_composer: "Handel",
          edition_id: "edition-1",
          edition_name: "Novello Vocal Score",
          is_primary: 1,
          copy_id: null,
          copy_number: null,
          copy_condition: null,
          assigned_at: null,
          has_file: 0,
          has_physical_copies: 5, // Physical copies exist
        },
      ]);

      const result = await getEventMaterialsForMember(
        db,
        "event-1",
        "member-1",
      );

      expect(result.materials[0].needsCopy).toBe(true);
      expect(result.materials[0].assignedCopy).toBeNull();
      expect(result.summary.warningCount).toBe(1);
    });

    it("shows digital availability", async () => {
      const db = createMockDb([
        {
          work_id: "work-1",
          work_title: "Ave Maria",
          work_composer: "Bruckner",
          edition_id: "edition-1",
          edition_name: "CPDL Edition",
          is_primary: 1,
          copy_id: null,
          copy_number: null,
          copy_condition: null,
          assigned_at: null,
          has_file: 1, // Digital file exists
          has_physical_copies: 0,
        },
      ]);

      const result = await getEventMaterialsForMember(
        db,
        "event-1",
        "member-1",
      );

      expect(result.materials[0].hasDigitalFile).toBe(true);
      expect(result.materials[0].needsCopy).toBe(false); // No physical copies exist
      expect(result.summary.digitalAvailable).toBe(1);
    });

    it("no warning for digital-only edition", async () => {
      const db = createMockDb([
        {
          work_id: "work-1",
          work_title: "Ave Maria",
          work_composer: "Bruckner",
          edition_id: "edition-1",
          edition_name: "CPDL Edition",
          is_primary: 1,
          copy_id: null,
          copy_number: null,
          copy_condition: null,
          assigned_at: null,
          has_file: 1,
          has_physical_copies: 0, // No physical copies
        },
      ]);

      const result = await getEventMaterialsForMember(
        db,
        "event-1",
        "member-1",
      );

      expect(result.materials[0].needsCopy).toBe(false);
      expect(result.summary.warningCount).toBe(0);
    });

    it("handles multiple works and editions", async () => {
      const db = createMockDb([
        {
          work_id: "work-1",
          work_title: "Messiah",
          work_composer: "Handel",
          edition_id: "edition-1",
          edition_name: "Novello",
          is_primary: 1,
          copy_id: "copy-1",
          copy_number: "M-01",
          copy_condition: "good",
          assigned_at: "2025-01-15",
          has_file: 0,
          has_physical_copies: 10,
        },
        {
          work_id: "work-1",
          work_title: "Messiah",
          work_composer: "Handel",
          edition_id: "edition-2",
          edition_name: "Peters",
          is_primary: 0,
          copy_id: null,
          copy_number: null,
          copy_condition: null,
          assigned_at: null,
          has_file: 1,
          has_physical_copies: 0,
        },
        {
          work_id: "work-2",
          work_title: "Elijah",
          work_composer: "Mendelssohn",
          edition_id: "edition-3",
          edition_name: "Bärenreiter",
          is_primary: 1,
          copy_id: null,
          copy_number: null,
          copy_condition: null,
          assigned_at: null,
          has_file: 0,
          has_physical_copies: 8,
        },
      ]);

      const result = await getEventMaterialsForMember(
        db,
        "event-1",
        "member-1",
      );

      expect(result.summary.totalWorks).toBe(2); // Messiah and Elijah
      expect(result.summary.totalEditions).toBe(3); // Novello, Peters, Bärenreiter
      expect(result.summary.copiesAssigned).toBe(1); // Only Novello
      expect(result.summary.digitalAvailable).toBe(1); // Only Peters
      expect(result.summary.warningCount).toBe(1); // Bärenreiter (physical but no copy)
    });

    it("deduplicates editions when multiple copies exist", async () => {
      // If the query returns multiple rows for same edition (due to multiple physical copies)
      // we should only show one edition entry
      const db = createMockDb([
        {
          work_id: "work-1",
          work_title: "Messiah",
          work_composer: "Handel",
          edition_id: "edition-1",
          edition_name: "Novello",
          is_primary: 1,
          copy_id: null, // First row: unassigned copy
          copy_number: null,
          copy_condition: null,
          assigned_at: null,
          has_file: 0,
          has_physical_copies: 3,
        },
        {
          work_id: "work-1",
          work_title: "Messiah",
          work_composer: "Handel",
          edition_id: "edition-1",
          edition_name: "Novello",
          is_primary: 1,
          copy_id: "copy-2", // Second row: member's assigned copy
          copy_number: "M-02",
          copy_condition: "good",
          assigned_at: "2025-01-20",
          has_file: 0,
          has_physical_copies: 3,
        },
      ]);

      const result = await getEventMaterialsForMember(
        db,
        "event-1",
        "member-1",
      );

      // Should deduplicate to single edition
      expect(result.materials).toHaveLength(1);
      // Should pick up the assigned copy
      expect(result.materials[0].assignedCopy).not.toBeNull();
      expect(result.materials[0].assignedCopy?.copyNumber).toBe("M-02");
      expect(result.materials[0].needsCopy).toBe(false);
    });

    it("correctly identifies primary editions", async () => {
      const db = createMockDb([
        {
          work_id: "work-1",
          work_title: "Messiah",
          work_composer: "Handel",
          edition_id: "edition-1",
          edition_name: "Primary Edition",
          is_primary: 1,
          copy_id: null,
          copy_number: null,
          copy_condition: null,
          assigned_at: null,
          has_file: 1,
          has_physical_copies: 0,
        },
        {
          work_id: "work-1",
          work_title: "Messiah",
          work_composer: "Handel",
          edition_id: "edition-2",
          edition_name: "Secondary Edition",
          is_primary: 0,
          copy_id: null,
          copy_number: null,
          copy_condition: null,
          assigned_at: null,
          has_file: 1,
          has_physical_copies: 0,
        },
      ]);

      const result = await getEventMaterialsForMember(
        db,
        "event-1",
        "member-1",
      );

      const primary = result.materials.find(
        (m) => m.edition.name === "Primary Edition",
      );
      const secondary = result.materials.find(
        (m) => m.edition.name === "Secondary Edition",
      );

      expect(primary?.edition.isPrimary).toBe(true);
      expect(secondary?.edition.isPrimary).toBe(false);
    });
  });
});
