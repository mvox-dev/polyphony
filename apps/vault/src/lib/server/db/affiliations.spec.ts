// Affiliations database layer tests
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  createAffiliation,
  endAffiliation,
  getAffiliationById,
  getActiveAffiliations,
  getAffiliationHistory,
  getUmbrellaMembers,
  getCollectiveUmbrellas,
} from "./affiliations";
import type { Affiliation } from "$lib/types";

// Test IDs
const COLLECTIVE_ID = createOrgId("org_crede_001");
const UMBRELLA_ID = createOrgId("org_umbrella_001");
const OTHER_COLLECTIVE_ID = createOrgId("org_other_002");

// Mock D1Database
function createMockDb() {
  const affiliations: Map<string, Record<string, unknown>> = new Map();
  const affiliationsByToken: Map<string, string> = new Map();

  return {
    prepare: (sql: string) => ({
      bind: (...params: unknown[]) => ({
        run: async () => {
          const lowerSql = sql.toLowerCase();

          // Handle INSERT INTO affiliations
          if (lowerSql.includes("insert into affiliations")) {
            const [id, collective_id, umbrella_id, joined_at] =
              params as string[];

            // Check for active affiliation (simulate partial unique index)
            for (const aff of affiliations.values()) {
              if (
                aff.collective_id === collective_id &&
                aff.umbrella_id === umbrella_id &&
                aff.left_at === null
              ) {
                throw new Error("UNIQUE constraint failed");
              }
            }

            affiliations.set(id, {
              id,
              collective_id,
              umbrella_id,
              joined_at,
              left_at: null,
            });
            return { meta: { changes: 1 } };
          }

          // Handle UPDATE affiliations (end affiliation)
          if (
            lowerSql.includes("update affiliations") &&
            lowerSql.includes("left_at")
          ) {
            const [left_at, collective_id, umbrella_id] = params as string[];
            let changes = 0;

            for (const [id, aff] of affiliations.entries()) {
              if (
                aff.collective_id === collective_id &&
                aff.umbrella_id === umbrella_id &&
                aff.left_at === null
              ) {
                aff.left_at = left_at;
                affiliations.set(id, aff);
                changes++;
              }
            }

            return { meta: { changes } };
          }

          return { meta: { changes: 0 } };
        },
        first: async () => {
          const lowerSql = sql.toLowerCase();

          // Handle SELECT by id
          if (lowerSql.includes("where id = ?")) {
            const [id] = params as string[];
            return affiliations.get(id) ?? null;
          }

          return null;
        },
        all: async () => {
          const lowerSql = sql.toLowerCase();

          // Handle SELECT umbrella members - must check BEFORE active affiliations
          // SQL: WHERE umbrella_id = ? AND left_at IS NULL (no collective_id in WHERE)
          if (
            lowerSql.includes("where umbrella_id = ?") &&
            lowerSql.includes("left_at is null") &&
            !lowerSql.includes("collective_id =")
          ) {
            const [umbrellaId] = params as string[];
            const results = Array.from(affiliations.values()).filter(
              (a) => a.umbrella_id === umbrellaId && a.left_at === null,
            );
            return { results };
          }

          // Handle SELECT collective umbrellas
          // SQL: WHERE collective_id = ? AND left_at IS NULL (no umbrella_id in WHERE condition)
          if (
            lowerSql.includes("where collective_id = ?") &&
            lowerSql.includes("left_at is null") &&
            !lowerSql.includes("umbrella_id =")
          ) {
            const [collectiveId] = params as string[];
            const results = Array.from(affiliations.values()).filter(
              (a) => a.collective_id === collectiveId && a.left_at === null,
            );
            return { results };
          }

          // Handle SELECT active affiliations for org
          // SQL: WHERE (collective_id = ? OR umbrella_id = ?) AND left_at IS NULL
          if (
            lowerSql.includes("collective_id = ? or umbrella_id = ?") &&
            lowerSql.includes("left_at is null")
          ) {
            const [orgId] = params as string[];
            const results = Array.from(affiliations.values()).filter(
              (a) =>
                (a.collective_id === orgId || a.umbrella_id === orgId) &&
                a.left_at === null,
            );
            return { results };
          }

          // Handle SELECT history for collective-umbrella pair
          // SQL: WHERE collective_id = ? AND umbrella_id = ? (no left_at IS NULL filter)
          if (
            lowerSql.includes("collective_id = ? and umbrella_id = ?") &&
            !lowerSql.includes("left_at is null")
          ) {
            const [collectiveId, umbrellaId] = params as string[];
            const results = Array.from(affiliations.values())
              .filter(
                (a) =>
                  a.collective_id === collectiveId &&
                  a.umbrella_id === umbrellaId,
              )
              .sort((a, b) =>
                (b.joined_at as string).localeCompare(a.joined_at as string),
              );
            return { results };
          }

          return { results: [] };
        },
      }),
    }),
  } as unknown as D1Database;
}

describe("Affiliations database layer", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("createAffiliation", () => {
    it("creates affiliation between collective and umbrella", async () => {
      const affiliation = await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });

      expect(affiliation.collectiveId).toBe(COLLECTIVE_ID);
      expect(affiliation.umbrellaId).toBe(UMBRELLA_ID);
      expect(affiliation.leftAt).toBeNull();
      expect(affiliation.id).toBeDefined();
      expect(affiliation.joinedAt).toBeDefined();
    });

    it("rejects duplicate active affiliation", async () => {
      // Create first affiliation
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });

      // Try to create duplicate
      await expect(
        createAffiliation(db, {
          collectiveId: COLLECTIVE_ID,
          umbrellaId: UMBRELLA_ID,
        }),
      ).rejects.toThrow("UNIQUE constraint");
    });

    it("allows affiliation after previous one ended", async () => {
      // Create and end first affiliation
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });
      await endAffiliation(db, COLLECTIVE_ID, UMBRELLA_ID);

      // Create new affiliation (should succeed)
      const affiliation = await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });

      expect(affiliation.collectiveId).toBe(COLLECTIVE_ID);
      expect(affiliation.leftAt).toBeNull();
    });
  });

  describe("endAffiliation", () => {
    it("ends active affiliation", async () => {
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });

      const ended = await endAffiliation(db, COLLECTIVE_ID, UMBRELLA_ID);

      expect(ended).toBe(true);
    });

    it("returns false when no active affiliation exists", async () => {
      const ended = await endAffiliation(db, COLLECTIVE_ID, UMBRELLA_ID);

      expect(ended).toBe(false);
    });

    it("returns false when affiliation already ended", async () => {
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });
      await endAffiliation(db, COLLECTIVE_ID, UMBRELLA_ID);

      // Try to end again
      const ended = await endAffiliation(db, COLLECTIVE_ID, UMBRELLA_ID);

      expect(ended).toBe(false);
    });
  });

  describe("getAffiliationById", () => {
    it("returns affiliation by ID", async () => {
      const created = await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });

      const affiliation = await getAffiliationById(db, created.id);

      expect(affiliation).not.toBeNull();
      expect(affiliation?.id).toBe(created.id);
      expect(affiliation?.collectiveId).toBe(COLLECTIVE_ID);
    });

    it("returns null for non-existent ID", async () => {
      const affiliation = await getAffiliationById(db, "non-existent");

      expect(affiliation).toBeNull();
    });
  });

  describe("getActiveAffiliations", () => {
    it("returns empty array when no affiliations", async () => {
      const affiliations = await getActiveAffiliations(db, COLLECTIVE_ID);

      expect(affiliations).toEqual([]);
    });

    it("returns active affiliations for collective", async () => {
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });

      const affiliations = await getActiveAffiliations(db, COLLECTIVE_ID);

      expect(affiliations).toHaveLength(1);
      expect(affiliations[0].collectiveId).toBe(COLLECTIVE_ID);
    });

    it("returns active affiliations for umbrella", async () => {
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });

      const affiliations = await getActiveAffiliations(db, UMBRELLA_ID);

      expect(affiliations).toHaveLength(1);
      expect(affiliations[0].umbrellaId).toBe(UMBRELLA_ID);
    });

    it("excludes ended affiliations", async () => {
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });
      await endAffiliation(db, COLLECTIVE_ID, UMBRELLA_ID);

      const affiliations = await getActiveAffiliations(db, COLLECTIVE_ID);

      expect(affiliations).toHaveLength(0);
    });
  });

  describe("getAffiliationHistory", () => {
    it("returns empty array when no history", async () => {
      const history = await getAffiliationHistory(
        db,
        COLLECTIVE_ID,
        UMBRELLA_ID,
      );

      expect(history).toEqual([]);
    });

    it("returns full history including ended affiliations", async () => {
      // Create first affiliation
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });
      await endAffiliation(db, COLLECTIVE_ID, UMBRELLA_ID);

      // Create second affiliation
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });

      const history = await getAffiliationHistory(
        db,
        COLLECTIVE_ID,
        UMBRELLA_ID,
      );

      expect(history).toHaveLength(2);
      // Most recent first (by joined_at DESC)
      // Should have one active and one ended
      const activeCount = history.filter((a) => a.leftAt === null).length;
      const endedCount = history.filter((a) => a.leftAt !== null).length;
      expect(activeCount).toBe(1);
      expect(endedCount).toBe(1);
    });
  });

  describe("getUmbrellaMembers", () => {
    it("returns all active collectives under umbrella", async () => {
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });
      await createAffiliation(db, {
        collectiveId: OTHER_COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });

      const members = await getUmbrellaMembers(db, UMBRELLA_ID);

      expect(members).toHaveLength(2);
    });

    it("excludes ended affiliations", async () => {
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });
      await endAffiliation(db, COLLECTIVE_ID, UMBRELLA_ID);

      const members = await getUmbrellaMembers(db, UMBRELLA_ID);

      expect(members).toHaveLength(0);
    });
  });

  describe("getCollectiveUmbrellas", () => {
    it("returns all active umbrellas for collective", async () => {
      const UMBRELLA_2_ID = createOrgId("org_umbrella_002");

      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_2_ID,
      });

      const umbrellas = await getCollectiveUmbrellas(db, COLLECTIVE_ID);

      expect(umbrellas).toHaveLength(2);
    });

    it("excludes ended affiliations", async () => {
      await createAffiliation(db, {
        collectiveId: COLLECTIVE_ID,
        umbrellaId: UMBRELLA_ID,
      });
      await endAffiliation(db, COLLECTIVE_ID, UMBRELLA_ID);

      const umbrellas = await getCollectiveUmbrellas(db, COLLECTIVE_ID);

      expect(umbrellas).toHaveLength(0);
    });
  });
});
