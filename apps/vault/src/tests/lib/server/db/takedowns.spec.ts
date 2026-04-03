// TDD: Copyright takedown tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createTakedownRequest,
  getTakedownById,
  listTakedownRequests,
  processTakedown,
  type TakedownRequest,
  type TakedownStatus,
} from "$lib/server/db/takedowns";

// Mock D1 database
function createMockDb() {
  const takedowns: Map<string, Record<string, unknown>> = new Map();
  const editions: Map<string, Record<string, unknown>> = new Map();

  // Add a test edition
  editions.set("edition-123", {
    id: "edition-123",
    name: "Test Edition",
    deleted_at: null,
  });

  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: async () => {
          // Handle INSERT INTO takedowns
          if (sql.includes("INSERT INTO takedowns")) {
            const [
              id,
              edition_id,
              org_id,
              claimant_name,
              claimant_email,
              reason,
              attestation,
            ] = params as string[];
            takedowns.set(id, {
              id,
              edition_id,
              org_id,
              claimant_name,
              claimant_email,
              reason,
              attestation: attestation === "1" || attestation === "true",
              status: "pending",
              created_at: new Date().toISOString(),
              processed_at: null,
              processed_by: null,
              resolution_notes: null,
            });
          }
          // Handle UPDATE takedowns (process)
          if (sql.includes("UPDATE takedowns SET status")) {
            const id = params[params.length - 1] as string;
            const takedown = takedowns.get(id);
            if (takedown) {
              if (sql.includes("status = 'approved'")) {
                takedown.status = "approved";
              } else if (sql.includes("status = 'rejected'")) {
                takedown.status = "rejected";
              }
              takedown.processed_at = params[0] as string;
              takedown.processed_by = params[1] as string;
              takedown.resolution_notes = params[2] as string;
            }
            return { meta: { changes: takedown ? 1 : 0 } };
          }
          // Handle UPDATE editions (soft delete)
          if (sql.includes("UPDATE editions SET deleted_at")) {
            const editionId = params[1] as string;
            const edition = editions.get(editionId);
            if (edition) {
              edition.deleted_at = params[0] as string;
            }
            return { meta: { changes: edition ? 1 : 0 } };
          }
          return { meta: { changes: 1 } };
        },
        first: async <T>(): Promise<T | null> => {
          if (sql.includes("FROM takedowns WHERE id")) {
            const id = params[0] as string;
            return (takedowns.get(id) as T) ?? null;
          }
          if (sql.includes("FROM editions WHERE id")) {
            const id = params[0] as string;
            return (editions.get(id) as T) ?? null;
          }
          return null;
        },
        all: async <T>(): Promise<{ results: T[] }> => {
          if (sql.includes("FROM takedowns")) {
            // listTakedownRequests now always binds orgId first
            // With status: params = [orgId, status]
            // Without status: params = [orgId]
            const allTakedowns = Array.from(takedowns.values());
            // Filter by org_id (first param is always orgId now)
            const orgId = params[0] as string;
            let filtered = allTakedowns.filter((t) => t.org_id === orgId);
            // If there's a status param (AND status = ?)
            if (sql.includes("AND status = ?") && params.length > 1) {
              const status = params[1] as string;
              filtered = filtered.filter((t) => t.status === status);
            }
            return { results: filtered as T[] };
          }
          return { results: [] };
        },
      }),
      // Direct .all() without bind (no longer used — listTakedownRequests always binds orgId)
      all: async <T>(): Promise<{ results: T[] }> => {
        if (sql.includes("FROM takedowns")) {
          return { results: Array.from(takedowns.values()) as T[] };
        }
        return { results: [] };
      },
    }),
    _takedowns: takedowns,
    _editions: editions,
  };
}

const TEST_ORG_ID = "org_crede_001";

describe("Takedown System", () => {
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    mockDb = createMockDb();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2025-01-25T12:00:00Z"));
  });

  describe("createTakedownRequest", () => {
    it("creates takedown with valid data", async () => {
      const takedown = await createTakedownRequest(
        mockDb as unknown as D1Database,
        {
          edition_id: "edition-123",
          org_id: TEST_ORG_ID,
          claimant_name: "John Doe",
          claimant_email: "john@example.com",
          reason: "This is my copyrighted work",
          attestation: true,
        },
      );

      expect(takedown).toBeDefined();
      expect(takedown.edition_id).toBe("edition-123");
      expect(takedown.org_id).toBe(TEST_ORG_ID);
      expect(takedown.claimant_name).toBe("John Doe");
      expect(takedown.claimant_email).toBe("john@example.com");
      expect(takedown.status).toBe("pending");
    });

    it("requires attestation to be true", async () => {
      await expect(
        createTakedownRequest(mockDb as unknown as D1Database, {
          edition_id: "edition-123",
          org_id: TEST_ORG_ID,
          claimant_name: "John Doe",
          claimant_email: "john@example.com",
          reason: "This is my copyrighted work",
          attestation: false,
        }),
      ).rejects.toThrow("Attestation must be acknowledged");
    });

    it("validates email format", async () => {
      await expect(
        createTakedownRequest(mockDb as unknown as D1Database, {
          edition_id: "edition-123",
          org_id: TEST_ORG_ID,
          claimant_name: "John Doe",
          claimant_email: "not-an-email",
          reason: "This is my copyrighted work",
          attestation: true,
        }),
      ).rejects.toThrow("Invalid email format");
    });

    it("requires all fields", async () => {
      await expect(
        createTakedownRequest(mockDb as unknown as D1Database, {
          edition_id: "edition-123",
          org_id: TEST_ORG_ID,
          claimant_name: "",
          claimant_email: "john@example.com",
          reason: "Test",
          attestation: true,
        }),
      ).rejects.toThrow("Claimant name is required");
    });
  });

  describe("getTakedownById", () => {
    it("returns takedown when found", async () => {
      const created = await createTakedownRequest(
        mockDb as unknown as D1Database,
        {
          edition_id: "edition-123",
          org_id: TEST_ORG_ID,
          claimant_name: "John Doe",
          claimant_email: "john@example.com",
          reason: "Copyright claim",
          attestation: true,
        },
      );

      const found = await getTakedownById(
        mockDb as unknown as D1Database,
        created.id,
      );

      expect(found).toBeDefined();
      expect(found?.claimant_name).toBe("John Doe");
    });

    it("returns null when not found", async () => {
      const found = await getTakedownById(
        mockDb as unknown as D1Database,
        "nonexistent",
      );

      expect(found).toBeNull();
    });
  });

  describe("listTakedownRequests", () => {
    it("returns takedowns scoped to org", async () => {
      await createTakedownRequest(mockDb as unknown as D1Database, {
        edition_id: "edition-123",
        org_id: TEST_ORG_ID,
        claimant_name: "John Doe",
        claimant_email: "john@example.com",
        reason: "Claim 1",
        attestation: true,
      });

      await createTakedownRequest(mockDb as unknown as D1Database, {
        edition_id: "edition-123",
        org_id: TEST_ORG_ID,
        claimant_name: "Jane Doe",
        claimant_email: "jane@example.com",
        reason: "Claim 2",
        attestation: true,
      });

      const list = await listTakedownRequests(
        mockDb as unknown as D1Database,
        TEST_ORG_ID,
      );

      expect(list).toHaveLength(2);
    });
  });

  describe("processTakedown", () => {
    it("approves takedown and soft-deletes edition", async () => {
      const takedown = await createTakedownRequest(
        mockDb as unknown as D1Database,
        {
          edition_id: "edition-123",
          org_id: TEST_ORG_ID,
          claimant_name: "John Doe",
          claimant_email: "john@example.com",
          reason: "Copyright claim",
          attestation: true,
        },
      );

      const result = await processTakedown(mockDb as unknown as D1Database, {
        takedownId: takedown.id,
        orgId: TEST_ORG_ID,
        status: "approved",
        processedBy: "admin-456",
        notes: "Verified copyright ownership",
      });

      expect(result.success).toBe(true);
      expect(mockDb._editions.get("edition-123")?.deleted_at).toBeDefined();
    });

    it("rejects takedown without affecting edition", async () => {
      const takedown = await createTakedownRequest(
        mockDb as unknown as D1Database,
        {
          edition_id: "edition-123",
          org_id: TEST_ORG_ID,
          claimant_name: "John Doe",
          claimant_email: "john@example.com",
          reason: "False claim",
          attestation: true,
        },
      );

      const result = await processTakedown(mockDb as unknown as D1Database, {
        takedownId: takedown.id,
        orgId: TEST_ORG_ID,
        status: "rejected",
        processedBy: "admin-456",
        notes: "Could not verify ownership",
      });

      expect(result.success).toBe(true);
      expect(mockDb._editions.get("edition-123")?.deleted_at).toBeNull();
    });

    it("returns error for invalid takedown id", async () => {
      const result = await processTakedown(mockDb as unknown as D1Database, {
        takedownId: "nonexistent",
        orgId: TEST_ORG_ID,
        status: "approved",
        processedBy: "admin-456",
        notes: "Test",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Takedown request not found");
    });
  });
});
