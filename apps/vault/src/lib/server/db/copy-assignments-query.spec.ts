// Unit tests for getMemberAssignedCopies query
// Issue #117 - My Scores section on profile page

import { describe, it, expect, beforeEach, vi } from "vitest";
import { getMemberAssignedCopies } from "./copy-assignments";

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

describe("getMemberAssignedCopies", () => {
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    db = createMockDb();
  });

  it("returns assigned copies with work, edition, and org info", async () => {
    db.all.mockResolvedValueOnce({
      results: [
        {
          assignment_id: "assign-1",
          copy_id: "copy-1",
          copy_number: "01",
          condition: "good",
          assigned_at: "2026-01-29T12:00:00.000Z",
          notes: "Concert set",
          edition_id: "ed-1",
          edition_name: "Novello Vocal Score",
          edition_type: "vocal_score",
          file_key: "file-123",
          external_url: null,
          work_id: "work-1",
          work_title: "Messiah",
          composer: "Handel",
          org_id: "org-1",
          org_name: "Crede",
          org_subdomain: "crede",
        },
        {
          assignment_id: "assign-2",
          copy_id: "copy-2",
          copy_number: "05",
          condition: "fair",
          assigned_at: "2026-01-28T12:00:00.000Z",
          notes: null,
          edition_id: "ed-2",
          edition_name: "Peters Edition",
          edition_type: "full_score",
          file_key: null,
          external_url: "https://imslp.org/example",
          work_id: "work-2",
          work_title: "Requiem",
          composer: "Mozart",
          org_id: "org-2",
          org_name: "Kamari",
          org_subdomain: "kamari",
        },
      ],
    });

    const result = await getMemberAssignedCopies(
      db as unknown as D1Database,
      "member-1",
    );

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      assignmentId: "assign-1",
      copyId: "copy-1",
      copyNumber: "01",
      condition: "good",
      assignedAt: "2026-01-29T12:00:00.000Z",
      notes: "Concert set",
      edition: {
        id: "ed-1",
        name: "Novello Vocal Score",
        type: "vocal_score",
        fileKey: "file-123",
        externalUrl: null,
      },
      work: {
        id: "work-1",
        title: "Messiah",
        composer: "Handel",
      },
      org: {
        id: "org-1",
        name: "Crede",
        subdomain: "crede",
      },
    });
    expect(result[1].work.title).toBe("Requiem");
    expect(result[1].org.name).toBe("Kamari");
  });

  it("returns empty array when no assigned copies", async () => {
    db.all.mockResolvedValueOnce({ results: [] });

    const result = await getMemberAssignedCopies(
      db as unknown as D1Database,
      "member-1",
    );

    expect(result).toEqual([]);
  });

  it("handles null composer", async () => {
    db.all.mockResolvedValueOnce({
      results: [
        {
          assignment_id: "assign-1",
          copy_id: "copy-1",
          copy_number: "01",
          condition: "good",
          assigned_at: "2026-01-29T12:00:00.000Z",
          notes: null,
          edition_id: "ed-1",
          edition_name: "Choir Edition",
          edition_type: "vocal_score",
          file_key: null,
          external_url: null,
          work_id: "work-1",
          work_title: "Traditional Song",
          composer: null,
          org_id: "org-1",
          org_name: "Crede",
          org_subdomain: "crede",
        },
      ],
    });

    const result = await getMemberAssignedCopies(
      db as unknown as D1Database,
      "member-1",
    );

    expect(result[0].work.composer).toBeNull();
    expect(result[0].org.id).toBe("org-1");
  });
});
