// Unit tests for copy-assignments database layer
// Issue #116 - Copy Assignment/Return workflow

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  assignCopy,
  returnCopy,
  getActiveAssignments,
  getAssignmentHistory,
  getMemberAssignments,
  isAssigned,
  getCopyAssignmentHistory,
  getEditionAssignmentHistory,
  getCurrentHolders,
} from "./copy-assignments";

// Mock D1 database
function createMockDb() {
  return {
    prepare: vi.fn().mockReturnThis(),
    bind: vi.fn().mockReturnThis(),
    first: vi.fn(),
    all: vi.fn(),
    run: vi.fn(),
  };
}

describe("Copy assignments database layer", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("assignCopy", () => {
    it("assigns copy to member", async () => {
      // First call: check if copy is assigned (returns null = not assigned)
      db.first.mockResolvedValueOnce(null);
      // Second call: insert assignment
      db.run.mockResolvedValueOnce({ meta: { changes: 1 } });
      // Third call: fetch created assignment
      db.first.mockResolvedValueOnce({
        id: "assign-123",
        copy_id: "copy-1",
        member_id: "member-1",
        assigned_at: "2026-01-29T12:00:00.000Z",
        assigned_by: "admin-1",
        returned_at: null,
        notes: "Concert set",
      });

      const result = await assignCopy(db as unknown as D1Database, {
        copyId: "copy-1",
        memberId: "member-1",
        assignedBy: "admin-1",
        notes: "Concert set",
      });

      expect(result).toEqual({
        id: "assign-123",
        copyId: "copy-1",
        memberId: "member-1",
        assignedAt: "2026-01-29T12:00:00.000Z",
        assignedBy: "admin-1",
        returnedAt: null,
        notes: "Concert set",
      });
    });

    it("throws error if copy already assigned", async () => {
      // Copy is already assigned
      db.first.mockResolvedValueOnce({ id: "existing-assignment" });

      await expect(
        assignCopy(db as unknown as D1Database, {
          copyId: "copy-1",
          memberId: "member-1",
          assignedBy: "admin-1",
        }),
      ).rejects.toThrow("Copy is already assigned");
    });

    it("assigns without notes", async () => {
      db.first.mockResolvedValueOnce(null);
      db.run.mockResolvedValueOnce({ meta: { changes: 1 } });
      db.first.mockResolvedValueOnce({
        id: "assign-456",
        copy_id: "copy-2",
        member_id: "member-2",
        assigned_at: "2026-01-29T12:00:00.000Z",
        assigned_by: "admin-1",
        returned_at: null,
        notes: null,
      });

      const result = await assignCopy(db as unknown as D1Database, {
        copyId: "copy-2",
        memberId: "member-2",
        assignedBy: "admin-1",
      });

      expect(result.notes).toBeNull();
    });
  });

  describe("returnCopy", () => {
    it("marks assignment as returned", async () => {
      db.run.mockResolvedValueOnce({ meta: { changes: 1 } });
      db.first.mockResolvedValueOnce({
        id: "assign-123",
        copy_id: "copy-1",
        member_id: "member-1",
        assigned_at: "2026-01-29T12:00:00.000Z",
        assigned_by: "admin-1",
        returned_at: "2026-01-30T12:00:00.000Z",
        notes: null,
      });

      const result = await returnCopy(
        db as unknown as D1Database,
        "assign-123",
      );

      expect(result).not.toBeNull();
      expect(result?.returnedAt).toBe("2026-01-30T12:00:00.000Z");
    });

    it("returns null for non-existent assignment", async () => {
      db.run.mockResolvedValueOnce({ meta: { changes: 0 } });

      const result = await returnCopy(
        db as unknown as D1Database,
        "nonexistent",
      );

      expect(result).toBeNull();
    });
  });

  describe("getActiveAssignments", () => {
    it("returns only non-returned assignments for a copy", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            id: "assign-1",
            copy_id: "copy-1",
            member_id: "member-1",
            assigned_at: "2026-01-29T12:00:00.000Z",
            assigned_by: "admin-1",
            returned_at: null,
            notes: null,
          },
        ],
      });

      const result = await getActiveAssignments(
        db as unknown as D1Database,
        "copy-1",
      );

      expect(result).toHaveLength(1);
      expect(result[0].returnedAt).toBeNull();
    });

    it("returns empty array when no active assignments", async () => {
      db.all.mockResolvedValueOnce({ results: [] });

      const result = await getActiveAssignments(
        db as unknown as D1Database,
        "copy-1",
      );

      expect(result).toEqual([]);
    });
  });

  describe("getAssignmentHistory", () => {
    it("returns full history including returned assignments", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            id: "assign-2",
            copy_id: "copy-1",
            member_id: "member-2",
            assigned_at: "2026-01-29T12:00:00.000Z",
            assigned_by: "admin-1",
            returned_at: null,
            notes: null,
          },
          {
            id: "assign-1",
            copy_id: "copy-1",
            member_id: "member-1",
            assigned_at: "2026-01-20T12:00:00.000Z",
            assigned_by: "admin-1",
            returned_at: "2026-01-25T12:00:00.000Z",
            notes: "Returned early",
          },
        ],
      });

      const result = await getAssignmentHistory(
        db as unknown as D1Database,
        "copy-1",
      );

      expect(result).toHaveLength(2);
      expect(result[1].returnedAt).not.toBeNull();
    });
  });

  describe("getMemberAssignments", () => {
    it("returns all active assignments for a member", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            id: "assign-1",
            copy_id: "copy-1",
            member_id: "member-1",
            assigned_at: "2026-01-29T12:00:00.000Z",
            assigned_by: "admin-1",
            returned_at: null,
            notes: null,
          },
          {
            id: "assign-2",
            copy_id: "copy-2",
            member_id: "member-1",
            assigned_at: "2026-01-28T12:00:00.000Z",
            assigned_by: "admin-1",
            returned_at: null,
            notes: null,
          },
        ],
      });

      const result = await getMemberAssignments(
        db as unknown as D1Database,
        "member-1",
      );

      expect(result).toHaveLength(2);
      expect(
        result.every((a: { memberId: string }) => a.memberId === "member-1"),
      ).toBe(true);
    });

    it("can include returned assignments", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            id: "assign-1",
            copy_id: "copy-1",
            member_id: "member-1",
            assigned_at: "2026-01-29T12:00:00.000Z",
            assigned_by: "admin-1",
            returned_at: null,
            notes: null,
          },
          {
            id: "assign-2",
            copy_id: "copy-2",
            member_id: "member-1",
            assigned_at: "2026-01-20T12:00:00.000Z",
            assigned_by: "admin-1",
            returned_at: "2026-01-25T12:00:00.000Z",
            notes: null,
          },
        ],
      });

      const result = await getMemberAssignments(
        db as unknown as D1Database,
        "member-1",
        {
          includeReturned: true,
        },
      );

      expect(result).toHaveLength(2);
    });
  });

  describe("isAssigned", () => {
    it("returns true if copy has active assignment", async () => {
      db.first.mockResolvedValueOnce({ id: "assign-1" });

      const result = await isAssigned(db as unknown as D1Database, "copy-1");

      expect(result).toBe(true);
    });

    it("returns false if copy has no active assignment", async () => {
      db.first.mockResolvedValueOnce(null);

      const result = await isAssigned(db as unknown as D1Database, "copy-1");

      expect(result).toBe(false);
    });
  });

  // ============================================================================
  // ASSIGNMENT HISTORY (Issue #124)
  // ============================================================================

  describe("getCopyAssignmentHistory", () => {
    it("returns full history for a copy with member names", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            id: "assign-2",
            copy_id: "copy-1",
            copy_number: "01",
            member_id: "member-2",
            member_name: "Bob Tenor",
            assigned_at: "2026-01-20T12:00:00.000Z",
            assigned_by_id: "admin-1",
            assigned_by_name: "Admin User",
            returned_at: null,
            notes: "Current holder",
          },
          {
            id: "assign-1",
            copy_id: "copy-1",
            copy_number: "01",
            member_id: "member-1",
            member_name: "Alice Soprano",
            assigned_at: "2026-01-01T12:00:00.000Z",
            assigned_by_id: "admin-1",
            assigned_by_name: "Admin User",
            returned_at: "2026-01-15T12:00:00.000Z",
            notes: "Returned after concert",
          },
        ],
      });

      const history = await getCopyAssignmentHistory(
        db as unknown as D1Database,
        "copy-1",
      );

      expect(history).toHaveLength(2);
      expect(history[0].memberName).toBe("Bob Tenor");
      expect(history[0].returnedAt).toBeNull();
      expect(history[1].memberName).toBe("Alice Soprano");
      expect(history[1].returnedAt).toBe("2026-01-15T12:00:00.000Z");
    });

    it("returns empty array for copy with no history", async () => {
      db.all.mockResolvedValueOnce({ results: [] });

      const history = await getCopyAssignmentHistory(
        db as unknown as D1Database,
        "copy-new",
      );

      expect(history).toEqual([]);
    });

    it("includes assignedBy info when available", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            id: "assign-1",
            copy_id: "copy-1",
            copy_number: "01",
            member_id: "member-1",
            member_name: "Alice Soprano",
            assigned_at: "2026-01-01T12:00:00.000Z",
            assigned_by_id: "librarian-1",
            assigned_by_name: "Jane Librarian",
            returned_at: null,
            notes: null,
          },
        ],
      });

      const history = await getCopyAssignmentHistory(
        db as unknown as D1Database,
        "copy-1",
      );

      expect(history[0].assignedById).toBe("librarian-1");
      expect(history[0].assignedByName).toBe("Jane Librarian");
    });
  });

  describe("getEditionAssignmentHistory", () => {
    it("returns history for all copies of an edition", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            id: "assign-3",
            copy_id: "copy-2",
            copy_number: "02",
            member_id: "member-3",
            member_name: "Carol Alto",
            assigned_at: "2026-01-25T12:00:00.000Z",
            assigned_by_id: "admin-1",
            assigned_by_name: "Admin User",
            returned_at: null,
            notes: null,
          },
          {
            id: "assign-2",
            copy_id: "copy-1",
            copy_number: "01",
            member_id: "member-2",
            member_name: "Bob Tenor",
            assigned_at: "2026-01-20T12:00:00.000Z",
            assigned_by_id: "admin-1",
            assigned_by_name: "Admin User",
            returned_at: null,
            notes: null,
          },
          {
            id: "assign-1",
            copy_id: "copy-1",
            copy_number: "01",
            member_id: "member-1",
            member_name: "Alice Soprano",
            assigned_at: "2026-01-01T12:00:00.000Z",
            assigned_by_id: "admin-1",
            assigned_by_name: "Admin User",
            returned_at: "2026-01-15T12:00:00.000Z",
            notes: "Previous holder",
          },
        ],
      });

      const history = await getEditionAssignmentHistory(
        db as unknown as D1Database,
        "edition-1",
      );

      expect(history).toHaveLength(3);
      // Verify order: newest first
      expect(history[0].copyNumber).toBe("02");
      expect(history[1].copyNumber).toBe("01");
      expect(history[2].copyNumber).toBe("01");
    });

    it("returns empty array for edition with no assignments", async () => {
      db.all.mockResolvedValueOnce({ results: [] });

      const history = await getEditionAssignmentHistory(
        db as unknown as D1Database,
        "edition-new",
      );

      expect(history).toEqual([]);
    });

    it("includes copy number for identification", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            id: "assign-1",
            copy_id: "copy-1",
            copy_number: "M-05",
            member_id: "member-1",
            member_name: "Alice Soprano",
            assigned_at: "2026-01-01T12:00:00.000Z",
            assigned_by_id: null,
            assigned_by_name: null,
            returned_at: null,
            notes: null,
          },
        ],
      });

      const history = await getEditionAssignmentHistory(
        db as unknown as D1Database,
        "edition-1",
      );

      expect(history[0].copyNumber).toBe("M-05");
    });
  });

  // ============================================================================
  // getCurrentHolders (Issue #125 - Who Has Edition X)
  // ============================================================================

  describe("getCurrentHolders", () => {
    it("returns members with active assignments", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            member_id: "member-1",
            member_name: "Alice Soprano",
            copy_id: "copy-1",
            copy_number: "01",
            condition: "good",
            assigned_at: "2026-01-15T12:00:00.000Z",
            assigned_by: "admin-1",
          },
          {
            member_id: "member-2",
            member_name: "Bob Tenor",
            copy_id: "copy-2",
            copy_number: "02",
            condition: "fair",
            assigned_at: "2026-01-10T12:00:00.000Z",
            assigned_by: "admin-1",
          },
        ],
      });

      const holders = await getCurrentHolders(
        db as unknown as D1Database,
        "edition-1",
      );

      expect(holders).toHaveLength(2);
      expect(holders[0]).toEqual({
        memberId: "member-1",
        memberName: "Alice Soprano",
        copyId: "copy-1",
        copyNumber: "01",
        condition: "good",
        assignedAt: "2026-01-15T12:00:00.000Z",
        assignedBy: "admin-1",
      });
    });

    it("returns empty array when no copies assigned", async () => {
      db.all.mockResolvedValueOnce({ results: [] });

      const holders = await getCurrentHolders(
        db as unknown as D1Database,
        "edition-1",
      );

      expect(holders).toEqual([]);
    });

    it("excludes returned assignments", async () => {
      // Query already filters by returned_at IS NULL
      // Just verify the function returns what the DB returns (only active)
      db.all.mockResolvedValueOnce({
        results: [
          {
            member_id: "member-1",
            member_name: "Alice Soprano",
            copy_id: "copy-1",
            copy_number: "01",
            condition: "good",
            assigned_at: "2026-01-15T12:00:00.000Z",
            assigned_by: null,
          },
        ],
      });

      const holders = await getCurrentHolders(
        db as unknown as D1Database,
        "edition-1",
      );

      // Only 1 holder (returned assignment filtered by SQL)
      expect(holders).toHaveLength(1);
      expect(holders[0].memberName).toBe("Alice Soprano");
    });

    it("orders by copy number", async () => {
      db.all.mockResolvedValueOnce({
        results: [
          {
            member_id: "member-1",
            member_name: "Alice",
            copy_id: "copy-1",
            copy_number: "01",
            condition: "good",
            assigned_at: "2026-01-15T12:00:00.000Z",
            assigned_by: null,
          },
          {
            member_id: "member-2",
            member_name: "Bob",
            copy_id: "copy-2",
            copy_number: "02",
            condition: "good",
            assigned_at: "2026-01-10T12:00:00.000Z",
            assigned_by: null,
          },
          {
            member_id: "member-3",
            member_name: "Carol",
            copy_id: "copy-3",
            copy_number: "03",
            condition: "good",
            assigned_at: "2026-01-20T12:00:00.000Z",
            assigned_by: null,
          },
        ],
      });

      const holders = await getCurrentHolders(
        db as unknown as D1Database,
        "edition-1",
      );

      expect(holders[0].copyNumber).toBe("01");
      expect(holders[1].copyNumber).toBe("02");
      expect(holders[2].copyNumber).toBe("03");
    });
  });
});
