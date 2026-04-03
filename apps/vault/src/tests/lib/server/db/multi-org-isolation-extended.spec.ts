/**
 * Extended integration tests for multi-org data isolation (#232)
 * Covers editions, physical copies, and settings.
 *
 * RED PHASE: Documents isolation contracts for functions that currently have no
 * org scoping. These tests will fail until #233 lands the required changes.
 *
 * TypeScript note: Calls with orgId arguments that don't exist in current
 * signatures produce TS2554 errors intentionally — they document the exact
 * signature changes dag needs to make. Vitest runs without TS enforcement so
 * the isolation failures are visible at runtime.
 *
 * === Editions ===
 * Currently failing: getEditionById, getEditionsByWorkId, updateEdition,
 *                    deleteEdition, updateEditionFile, removeEditionFile
 * Already correct:   getAllEditions (JOINs works WHERE w.org_id = ?)
 *
 * === Physical Copies ===
 * Currently failing: getPhysicalCopyById, getPhysicalCopiesByEdition,
 *                    updatePhysicalCopy, deletePhysicalCopy,
 *                    getEditionInventorySummaries (no org filter at all)
 *
 * === Settings ===
 * Currently failing: getSetting, setSetting, getAllSettings
 * Root cause: vault_settings has no org_id column — needs schema migration
 * in addition to #233 code changes.
 */

/// <reference types="@cloudflare/workers-types" />
import { describe, it, expect, beforeEach } from "vitest";
import { createOrgId, type OrgId } from "@polyphony/shared";
import {
  createEdition,
  getEditionById,
  getEditionsByWorkId,
  getAllEditions,
  updateEdition,
  deleteEdition,
  updateEditionFile,
  removeEditionFile,
} from "../../../../lib/server/db/editions.js";
import {
  createPhysicalCopy,
  getPhysicalCopyById,
  getPhysicalCopiesByEdition,
  updatePhysicalCopy,
  deletePhysicalCopy,
  getEditionInventorySummaries,
} from "../../../../lib/server/db/physical-copies.js";
import {
  getSetting,
  setSetting,
  getAllSettings,
} from "../../../../lib/server/db/settings.js";

const ORG_A = createOrgId("org_aaaaaaaaa");
const ORG_B = createOrgId("org_bbbbbbbbb");

// ─── Mock D1 ─────────────────────────────────────────────────────────────────

function createMockDb() {
  const works = new Map<
    string,
    { id: string; org_id: string; title: string; composer: string | null }
  >();
  const editions = new Map<
    string,
    {
      id: string;
      work_id: string;
      name: string;
      arranger: string | null;
      publisher: string | null;
      voicing: string | null;
      edition_type: string;
      license_type: string;
      notes: string | null;
      external_url: string | null;
      file_key: string | null;
      file_name: string | null;
      file_size: number | null;
      file_uploaded_at: string | null;
      file_uploaded_by: string | null;
      created_at: string;
    }
  >();
  const editionSections = new Map<string, string[]>(); // edition_id → section_id[]
  const copies = new Map<
    string,
    {
      id: string;
      edition_id: string;
      copy_number: string;
      condition: string;
      acquired_at: string | null;
      notes: string | null;
      created_at: string;
    }
  >();
  const copyAssignments = new Map<
    string,
    { copy_id: string; returned_at: string | null }
  >();
  const settings = new Map<
    string,
    { value: string; updated_by: string | null; updated_at: string }
  >();

  return {
    _works: works,
    _editions: editions,
    _copies: copies,
    _settings: settings,

    prepare: (sql: string) => {
      // Shared query logic extracted so both .all() (no bind) and .bind().all() work
      const runAll = async (params: unknown[]) => {
        // SELECT FROM editions JOIN works JOIN physical_copies WHERE w.org_id = ? (getEditionInventorySummaries with orgId)
        // MUST come before the generic editions+works handler below
        if (
          sql.includes("FROM editions e") &&
          sql.includes("JOIN physical_copies")
        ) {
          const orgId = params[0] as string | undefined;
          const results = Array.from(editions.values())
            .filter((e) => {
              const work = works.get(e.work_id);
              if (!work) return false;
              if (orgId && work.org_id !== orgId) return false;
              return Array.from(copies.values()).some(
                (c) => c.edition_id === e.id,
              );
            })
            .map((e) => {
              const work = works.get(e.work_id);
              const editionCopies = Array.from(copies.values()).filter(
                (c) => c.edition_id === e.id,
              );
              return {
                edition_id: e.id,
                edition_name: e.name,
                work_title: work?.title ?? "",
                composer: work?.composer ?? null,
                total: editionCopies.length,
                lost: editionCopies.filter((c) => c.condition === "lost")
                  .length,
                assigned: 0,
              };
            });
          return { results };
        }
        // SELECT FROM editions JOIN works WHERE w.org_id = ? (getAllEditions)
        if (
          sql.includes("FROM editions e") &&
          sql.includes("JOIN works w") &&
          sql.includes("WHERE w.org_id")
        ) {
          const org_id = params[0] as string;
          const results = Array.from(editions.values())
            .filter((e) => {
              const work = works.get(e.work_id);
              return work?.org_id === org_id;
            })
            .map((e) => {
              const work = works.get(e.work_id)!;
              return {
                ...e,
                work_title: work.title,
                work_composer: work.composer,
              };
            });
          return { results };
        }
        // SELECT key, value FROM vault_settings WHERE org_id = ? (getAllSettings)
        if (
          sql.includes("FROM vault_settings") &&
          sql.includes("WHERE org_id")
        ) {
          const org_id = params[0] as string;
          const results = Array.from(settings.entries())
            .filter(([k]) => k.startsWith(`${org_id}:`))
            .map(([k, row]) => ({
              key: k.split(":").slice(1).join(":"),
              value: row.value,
            }));
          return { results };
        }
        return { results: [] };
      };

      return {
        // .all() with no bind (no-param queries like getAllSettings, getEditionInventorySummaries)
        all: () => runAll([]),
        bind: (...params: unknown[]) => ({
          run: async () => {
            // INSERT INTO works
            if (sql.includes("INSERT INTO works")) {
              const [id, org_id, title, composer] = params as [
                string,
                string,
                string,
                string | null,
              ];
              works.set(id, { id, org_id, title, composer: composer ?? null });
              return { success: true, meta: { changes: 1 } };
            }
            // INSERT INTO editions
            if (sql.includes("INSERT INTO editions")) {
              const [
                id,
                work_id,
                name,
                arranger,
                publisher,
                voicing,
                edition_type,
                license_type,
                notes,
                external_url,
                created_at,
              ] = params as [
                string,
                string,
                string,
                string | null,
                string | null,
                string | null,
                string,
                string,
                string | null,
                string | null,
                string,
              ];
              editions.set(id, {
                id,
                work_id,
                name,
                arranger,
                publisher,
                voicing,
                edition_type,
                license_type,
                notes,
                external_url,
                file_key: null,
                file_name: null,
                file_size: null,
                file_uploaded_at: null,
                file_uploaded_by: null,
                created_at,
              });
              return { success: true, meta: { changes: 1 } };
            }
            // INSERT INTO edition_sections
            if (sql.includes("INSERT INTO edition_sections")) {
              const [edition_id, section_id] = params as [string, string];
              const list = editionSections.get(edition_id) ?? [];
              list.push(section_id);
              editionSections.set(edition_id, list);
              return { success: true, meta: { changes: 1 } };
            }
            // DELETE FROM edition_sections
            if (sql.includes("DELETE FROM edition_sections")) {
              const edition_id = params[0] as string;
              editionSections.delete(edition_id);
              return { success: true, meta: { changes: 1 } };
            }
            // UPDATE editions SET (general field update)
            if (
              sql.startsWith("UPDATE editions SET") &&
              !sql.includes("file_key")
            ) {
              const id = params[params.length - 1] as string;
              const edition = editions.get(id);
              if (!edition) return { success: false, meta: { changes: 0 } };
              // Parse SET clause and apply updates
              const setClause = sql.match(/SET (.+) WHERE/)?.[1] ?? "";
              const fields = setClause
                .split(",")
                .map((f) => f.trim().split(" = ")[0]);
              const updated = { ...edition };
              fields.forEach((field, i) => {
                if (field in updated) (updated as any)[field] = params[i];
              });
              editions.set(id, updated);
              return { success: true, meta: { changes: 1 } };
            }
            // UPDATE editions SET file_key (updateEditionFile)
            if (sql.includes("UPDATE editions SET file_key")) {
              const [
                file_key,
                file_name,
                file_size,
                file_uploaded_at,
                file_uploaded_by,
                id,
              ] = params as [string, string, number, string, string, string];
              const edition = editions.get(id);
              if (!edition) return { success: false, meta: { changes: 0 } };
              editions.set(id, {
                ...edition,
                file_key,
                file_name,
                file_size,
                file_uploaded_at,
                file_uploaded_by,
              });
              return { success: true, meta: { changes: 1 } };
            }
            // UPDATE editions SET file_key = NULL (removeEditionFile)
            if (sql.includes("file_key = NULL")) {
              const id = params[0] as string;
              const edition = editions.get(id);
              if (!edition) return { success: false, meta: { changes: 0 } };
              editions.set(id, {
                ...edition,
                file_key: null,
                file_name: null,
                file_size: null,
                file_uploaded_at: null,
                file_uploaded_by: null,
              });
              return { success: true, meta: { changes: 1 } };
            }
            // DELETE FROM editions
            if (sql.includes("DELETE FROM editions")) {
              const id = params[0] as string;
              const existed = editions.has(id);
              editions.delete(id);
              editionSections.delete(id);
              return { success: true, meta: { changes: existed ? 1 : 0 } };
            }
            // INSERT INTO physical_copies
            if (sql.includes("INSERT INTO physical_copies")) {
              const [
                id,
                edition_id,
                copy_number,
                condition,
                acquired_at,
                notes,
              ] = params as [
                string,
                string,
                string,
                string,
                string | null,
                string | null,
              ];
              const created_at = new Date().toISOString();
              copies.set(id, {
                id,
                edition_id,
                copy_number,
                condition: condition ?? "good",
                acquired_at: acquired_at ?? null,
                notes: notes ?? null,
                created_at,
              });
              return { success: true, meta: { changes: 1 } };
            }
            // UPDATE physical_copies
            if (sql.startsWith("UPDATE physical_copies SET")) {
              const id = params[params.length - 1] as string;
              const copy = copies.get(id);
              if (!copy) return { success: false, meta: { changes: 0 } };
              // Parse SET clause and apply updates
              const setClause = sql.match(/SET (.+) WHERE/)?.[1] ?? "";
              const fields = setClause
                .split(",")
                .map((f) => f.trim().split(" = ")[0]);
              const updated = { ...copy };
              fields.forEach((field, i) => {
                if (field in updated) (updated as any)[field] = params[i];
              });
              copies.set(id, updated);
              return { success: true, meta: { changes: 1 } };
            }
            // DELETE FROM physical_copies
            if (sql.includes("DELETE FROM physical_copies")) {
              const id = params[0] as string;
              const existed = copies.has(id);
              copies.delete(id);
              return { success: true, meta: { changes: existed ? 1 : 0 } };
            }
            // INSERT INTO vault_settings (upsert, org-scoped)
            if (sql.includes("INSERT INTO vault_settings")) {
              const [org_id, key, value, updated_by] = params as [
                string,
                string,
                string,
                string | null,
              ];
              settings.set(`${org_id}:${key}`, {
                value,
                updated_by,
                updated_at: new Date().toISOString(),
              });
              return { success: true, meta: { changes: 1 } };
            }
            return { success: true, meta: { changes: 0 } };
          },

          first: async () => {
            // SELECT FROM editions e JOIN works w WHERE e.id = ? AND w.org_id = ? (getEditionById with orgId)
            if (
              sql.includes("FROM editions e") &&
              sql.includes("JOIN works w") &&
              sql.includes("e.id = ?") &&
              sql.includes("w.org_id = ?")
            ) {
              const [id, orgId] = params as [string, string];
              const edition = editions.get(id);
              if (!edition) return null;
              const work = works.get(edition.work_id);
              if (!work || work.org_id !== orgId) return null;
              return edition;
            }
            // SELECT FROM editions WHERE id = ? (legacy, no orgId)
            if (sql.includes("FROM editions") && sql.includes("WHERE id =")) {
              const id = params[0] as string;
              return editions.get(id) ?? null;
            }
            // SELECT FROM physical_copies pc JOIN editions e JOIN works w WHERE pc.id = ? AND w.org_id = ? (getPhysicalCopyById with orgId)
            if (
              sql.includes("FROM physical_copies pc") &&
              sql.includes("JOIN editions e") &&
              sql.includes("JOIN works w") &&
              sql.includes("pc.id = ?") &&
              sql.includes("w.org_id = ?")
            ) {
              const [id, orgId] = params as [string, string];
              const copy = copies.get(id);
              if (!copy) return null;
              const edition = editions.get(copy.edition_id);
              if (!edition) return null;
              const work = works.get(edition.work_id);
              if (!work || work.org_id !== orgId) return null;
              return copy;
            }
            // SELECT FROM physical_copies WHERE id = ? (legacy, no orgId)
            if (
              sql.includes("FROM physical_copies") &&
              sql.includes("WHERE id =")
            ) {
              const id = params[0] as string;
              return copies.get(id) ?? null;
            }
            // SELECT FROM physical_copies WHERE edition_id = ? AND copy_number = ? (copyNumberExists)
            if (
              sql.includes("FROM physical_copies") &&
              sql.includes("copy_number =")
            ) {
              const [edition_id, copy_number] = params as [string, string];
              const exists = Array.from(copies.values()).some(
                (c) =>
                  c.edition_id === edition_id && c.copy_number === copy_number,
              );
              return exists ? { 1: 1 } : null;
            }
            // SELECT value FROM vault_settings WHERE org_id = ? AND key = ?
            if (
              sql.includes("FROM vault_settings") &&
              sql.includes("WHERE org_id")
            ) {
              const [org_id, key] = params as [string, string];
              const row = settings.get(`${org_id}:${key}`);
              return row ? { value: row.value } : null;
            }
            return null;
          },

          all: async () => {
            // SELECT FROM editions e JOIN works w WHERE e.work_id = ? AND w.org_id = ? (getEditionsByWorkId with orgId)
            if (
              sql.includes("FROM editions e") &&
              sql.includes("JOIN works w") &&
              sql.includes("e.work_id = ?") &&
              sql.includes("w.org_id = ?")
            ) {
              const [work_id, orgId] = params as [string, string];
              const work = works.get(work_id);
              if (!work || work.org_id !== orgId) return { results: [] };
              const results = Array.from(editions.values()).filter(
                (e) => e.work_id === work_id,
              );
              return { results };
            }
            // SELECT FROM editions WHERE work_id = ? (legacy, no orgId)
            if (
              sql.includes("FROM editions") &&
              sql.includes("WHERE work_id =")
            ) {
              const work_id = params[0] as string;
              const results = Array.from(editions.values()).filter(
                (e) => e.work_id === work_id,
              );
              return { results };
            }
            // SELECT section_id FROM edition_sections WHERE edition_id = ?
            if (
              sql.includes("FROM edition_sections") &&
              sql.includes("WHERE edition_id =")
            ) {
              const edition_id = params[0] as string;
              const results = (editionSections.get(edition_id) ?? []).map(
                (s) => ({ section_id: s }),
              );
              return { results };
            }
            // SELECT copy_number FROM physical_copies WHERE edition_id = ? (getNextAvailableCopyNumber)
            if (
              sql.includes("SELECT copy_number FROM physical_copies") &&
              sql.includes("WHERE edition_id =")
            ) {
              const edition_id = params[0] as string;
              const results = Array.from(copies.values())
                .filter((c) => c.edition_id === edition_id)
                .map((c) => ({ copy_number: c.copy_number }));
              return { results };
            }
            // SELECT FROM physical_copies pc JOIN editions e JOIN works w WHERE pc.edition_id = ? AND w.org_id = ? (getPhysicalCopiesByEdition with orgId)
            if (
              sql.includes("FROM physical_copies pc") &&
              sql.includes("JOIN editions e") &&
              sql.includes("JOIN works w") &&
              sql.includes("pc.edition_id = ?") &&
              sql.includes("w.org_id = ?")
            ) {
              const [edition_id, orgId] = params as [string, string];
              const edition = editions.get(edition_id);
              if (!edition) return { results: [] };
              const work = works.get(edition.work_id);
              if (!work || work.org_id !== orgId) return { results: [] };
              const results = Array.from(copies.values()).filter(
                (c) => c.edition_id === edition_id,
              );
              return { results };
            }
            // SELECT * FROM physical_copies WHERE edition_id = ? (legacy, getPhysicalCopiesByEdition)
            if (
              sql.includes("FROM physical_copies") &&
              sql.includes("WHERE edition_id =")
            ) {
              const edition_id = params[0] as string;
              const results = Array.from(copies.values()).filter(
                (c) => c.edition_id === edition_id,
              );
              return { results };
            }
            // Delegate complex JOIN queries to runAll (with params)
            return runAll(params);
          },
        }),
      }; // end return { all, bind }
    }, // end prepare
    batch: async (statements: any[]) => {
      for (const stmt of statements) await stmt.run();
      return [];
    },
  } as unknown as D1Database;
}

// Helper: create a work directly in the mock store
async function seedWork(db: any, id: string, orgId: OrgId, title: string) {
  await db
    .prepare(
      "INSERT INTO works (id, org_id, title, composer, lyricist, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(id, orgId, title, null, null, new Date().toISOString())
    .run();
}

// ─── Editions isolation ───────────────────────────────────────────────────────

describe("Multi-org data isolation: Editions", () => {
  let db: any;
  let editionAId: string;
  const WORK_A_ID = "work-org-a-001";
  const WORK_B_ID = "work-org-b-001";

  beforeEach(async () => {
    db = createMockDb();
    await seedWork(db, WORK_A_ID, ORG_A, "Ave Maria");
    await seedWork(db, WORK_B_ID, ORG_B, "Gloria");

    const editionA = await createEdition(db, {
      workId: WORK_A_ID,
      name: "SATB Vocal Score",
      licenseType: "owned",
    });
    editionAId = editionA.id;
  });

  it("getAllEditions returns only editions for the requesting org", async () => {
    await createEdition(db, {
      workId: WORK_B_ID,
      name: "SSA Score",
      licenseType: "owned",
    });

    const orgAEditions = await getAllEditions(db, ORG_A);
    const orgBEditions = await getAllEditions(db, ORG_B);

    expect(orgAEditions).toHaveLength(1);
    expect(orgAEditions[0].name).toBe("SATB Vocal Score");
    expect(orgBEditions).toHaveLength(1);
    expect(orgBEditions[0].name).toBe("SSA Score");
  });

  it("getEditionById scoped to org — returns null for another org's edition", async () => {
    // FAILS until #233 adds orgId param to getEditionById (via work JOIN)
    const edition = await getEditionById(db, editionAId, ORG_B);
    expect(edition).toBeNull();
  });

  it("getEditionById scoped to org — returns edition for the owning org", async () => {
    // FAILS until #233 adds orgId param to getEditionById
    const edition = await getEditionById(db, editionAId, ORG_A);
    expect(edition).not.toBeNull();
    expect(edition?.name).toBe("SATB Vocal Score");
  });

  it("getEditionsByWorkId scoped to org — returns null results for cross-org work ID", async () => {
    // FAILS until #233: currently returns editions for any work_id regardless of caller's org
    const crossOrgEditions = await getEditionsByWorkId(db, WORK_A_ID, ORG_B);
    expect(crossOrgEditions).toHaveLength(0);
  });

  it("updateEdition scoped to org — cannot update another org's edition", async () => {
    // FAILS until #233 adds orgId param to updateEdition
    const result = await updateEdition(
      db,
      editionAId,
      { name: "Hacked Score" },
      ORG_B,
    );
    expect(result).toBeNull();

    const original = await getEditionById(db, editionAId, ORG_A);
    expect(original?.name).toBe("SATB Vocal Score");
  });

  it("updateEdition scoped to org — allows update by owning org", async () => {
    // FAILS until #233 adds orgId param to updateEdition
    const result = await updateEdition(
      db,
      editionAId,
      { name: "SATB Revised" },
      ORG_A,
    );
    expect(result).not.toBeNull();
    expect(result?.name).toBe("SATB Revised");
  });

  it("deleteEdition scoped to org — cannot delete another org's edition", async () => {
    // FAILS until #233 adds orgId param to deleteEdition
    const deleted = await deleteEdition(db, editionAId, ORG_B);
    expect(deleted).toBe(false);

    const edition = await getEditionById(db, editionAId, ORG_A);
    expect(edition).not.toBeNull();
  });

  it("deleteEdition scoped to org — allows deletion by owning org", async () => {
    // FAILS until #233 adds orgId param to deleteEdition
    const deleted = await deleteEdition(db, editionAId, ORG_A);
    expect(deleted).toBe(true);
  });

  it("updateEditionFile scoped to org — cannot attach file to another org's edition", async () => {
    // FAILS until #233 adds orgId param to updateEditionFile
    const result = await updateEditionFile(
      db,
      editionAId,
      {
        fileKey: "stolen-key",
        fileName: "hacked.pdf",
        fileSize: 1024,
        uploadedBy: "attacker",
      },
      ORG_B,
    );
    expect(result).toBeNull();

    const edition = await getEditionById(db, editionAId, ORG_A);
    expect(edition?.fileKey).toBeNull();
  });

  it("removeEditionFile scoped to org — cannot remove file from another org's edition", async () => {
    // First attach a file as the owning org
    await updateEditionFile(
      db,
      editionAId,
      {
        fileKey: "real-key",
        fileName: "score.pdf",
        fileSize: 2048,
        uploadedBy: "owner",
      },
      ORG_A,
    );

    // Org B tries to remove it
    // FAILS until #233 adds orgId param to removeEditionFile
    const result = await removeEditionFile(db, editionAId, ORG_B);
    expect(result).toBeNull();

    const edition = await getEditionById(db, editionAId, ORG_A);
    expect(edition?.fileKey).toBe("real-key");
  });
});

// ─── Physical copies isolation ────────────────────────────────────────────────

describe("Multi-org data isolation: Physical Copies", () => {
  let db: any;
  let copyAId: string;
  const WORK_A_ID = "work-org-a-001";
  const WORK_B_ID = "work-org-b-001";
  const EDITION_A_ID = "edition-org-a-001";
  const EDITION_B_ID = "edition-org-b-001";

  beforeEach(async () => {
    db = createMockDb();
    await seedWork(db, WORK_A_ID, ORG_A, "Ave Maria");
    await seedWork(db, WORK_B_ID, ORG_B, "Gloria");

    // Seed editions directly
    await db
      .prepare(
        "INSERT INTO editions (id, work_id, name, arranger, publisher, voicing, edition_type, license_type, notes, external_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        EDITION_A_ID,
        WORK_A_ID,
        "Org A Edition",
        null,
        null,
        null,
        "vocal_score",
        "owned",
        null,
        null,
        new Date().toISOString(),
      )
      .run();
    await db
      .prepare(
        "INSERT INTO editions (id, work_id, name, arranger, publisher, voicing, edition_type, license_type, notes, external_url, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        EDITION_B_ID,
        WORK_B_ID,
        "Org B Edition",
        null,
        null,
        null,
        "vocal_score",
        "owned",
        null,
        null,
        new Date().toISOString(),
      )
      .run();

    const copyA = await createPhysicalCopy(db, {
      editionId: EDITION_A_ID,
      copyNumber: "001",
      condition: "good",
    });
    copyAId = copyA.id;
  });

  it("getPhysicalCopyById scoped to org — returns null for another org's copy", async () => {
    // FAILS until #233 adds orgId param (copy → edition → work → org_id join)
    const copy = await getPhysicalCopyById(db, copyAId, ORG_B);
    expect(copy).toBeNull();
  });

  it("getPhysicalCopyById scoped to org — returns copy for the owning org", async () => {
    // FAILS until #233 adds orgId param
    const copy = await getPhysicalCopyById(db, copyAId, ORG_A);
    expect(copy).not.toBeNull();
    expect(copy?.copyNumber).toBe("001");
  });

  it("getPhysicalCopiesByEdition scoped to org — returns empty for cross-org edition ID", async () => {
    // FAILS until #233 adds orgId param to getPhysicalCopiesByEdition
    const copies = await getPhysicalCopiesByEdition(db, EDITION_A_ID, ORG_B);
    expect(copies).toHaveLength(0);
  });

  it("getPhysicalCopiesByEdition scoped to org — returns copies for the owning org", async () => {
    // FAILS until #233 adds orgId param
    const copies = await getPhysicalCopiesByEdition(db, EDITION_A_ID, ORG_A);
    expect(copies).toHaveLength(1);
    expect(copies[0].copyNumber).toBe("001");
  });

  it("updatePhysicalCopy scoped to org — cannot update another org's copy", async () => {
    // FAILS until #233 adds orgId param to updatePhysicalCopy
    const result = await updatePhysicalCopy(
      db,
      copyAId,
      { condition: "lost" },
      ORG_B,
    );
    expect(result).toBeNull();

    const original = await getPhysicalCopyById(db, copyAId, ORG_A);
    expect(original?.condition).toBe("good");
  });

  it("updatePhysicalCopy scoped to org — allows update by owning org", async () => {
    // FAILS until #233 adds orgId param
    const result = await updatePhysicalCopy(
      db,
      copyAId,
      { condition: "fair" },
      ORG_A,
    );
    expect(result).not.toBeNull();
  });

  it("deletePhysicalCopy scoped to org — cannot delete another org's copy", async () => {
    // FAILS until #233 adds orgId param to deletePhysicalCopy
    const deleted = await deletePhysicalCopy(db, copyAId, ORG_B);
    expect(deleted).toBe(false);

    const copy = await getPhysicalCopyById(db, copyAId, ORG_A);
    expect(copy).not.toBeNull();
  });

  it("deletePhysicalCopy scoped to org — allows deletion by owning org", async () => {
    // FAILS until #233 adds orgId param
    const deleted = await deletePhysicalCopy(db, copyAId, ORG_A);
    expect(deleted).toBe(true);
  });

  it("getEditionInventorySummaries must be scoped to requesting org", async () => {
    // Add a copy for Org B
    await createPhysicalCopy(db, {
      editionId: EDITION_B_ID,
      copyNumber: "B-001",
      condition: "good",
    });

    // FAILS until #233 adds orgId param — currently returns all orgs' inventory
    const orgASummaries = await getEditionInventorySummaries(db, ORG_A);
    const orgBSummaries = await getEditionInventorySummaries(db, ORG_B);

    // Each org should only see their own editions
    expect(orgASummaries.every((s) => s.editionId === EDITION_A_ID)).toBe(true);
    expect(orgBSummaries.every((s) => s.editionId === EDITION_B_ID)).toBe(true);
    expect(orgASummaries).toHaveLength(1);
    expect(orgBSummaries).toHaveLength(1);
  });
});

// ─── Settings isolation ───────────────────────────────────────────────────────

describe("Multi-org data isolation: Settings", () => {
  /**
   * vault_settings currently has NO org_id column.
   * All tests here fail because:
   *   1. The schema needs a migration to add org_id
   *   2. getSetting/setSetting/getAllSettings need orgId params
   *
   * These tests document the required contract.
   */

  it("setSetting for org A does not affect org B's settings", async () => {
    const db = createMockDb();

    // FAILS until #233 adds orgId param to setSetting and schema migration adds org_id
    await setSetting(db, "default_event_duration", "90", "admin-a", ORG_A);
    await setSetting(db, "default_event_duration", "120", "admin-b", ORG_B);

    const orgASetting = await getSetting(db, "default_event_duration", ORG_A);
    const orgBSetting = await getSetting(db, "default_event_duration", ORG_B);

    expect(orgASetting).toBe("90");
    expect(orgBSetting).toBe("120");
  });

  it("getSetting for org B cannot read org A's settings", async () => {
    const db = createMockDb();

    // FAILS until #233 adds orgId param to getSetting
    await setSetting(db, "secret_setting", "org-a-secret", "admin-a", ORG_A);

    const orgBValue = await getSetting(db, "secret_setting", ORG_B);
    expect(orgBValue).toBeNull();
  });

  it("getAllSettings for org A returns only org A settings", async () => {
    const db = createMockDb();

    // FAILS until #233 adds orgId param to getAllSettings
    await setSetting(db, "default_event_duration", "60", "admin-a", ORG_A);
    await setSetting(db, "default_event_duration", "90", "admin-b", ORG_B);
    await setSetting(db, "org_name", "Choir A", "admin-a", ORG_A);

    const orgASettings = await getAllSettings(db, ORG_A);
    const orgBSettings = await getAllSettings(db, ORG_B);

    expect(orgASettings).toHaveProperty("default_event_duration", "60");
    expect(orgASettings).toHaveProperty("org_name", "Choir A");
    expect(orgBSettings).toHaveProperty("default_event_duration", "90");
    // Org B should NOT see org A's org_name
    expect(orgBSettings).not.toHaveProperty("org_name");
  });

  it("settings schema requires org_id column — documents migration need", async () => {
    /**
     * This test documents that vault_settings needs a schema migration
     * in addition to code changes. The migration must:
     *
     *   ALTER TABLE vault_settings ADD COLUMN org_id TEXT NOT NULL REFERENCES organizations(id);
     *   DROP INDEX IF EXISTS vault_settings_key_idx; -- key is no longer globally unique
     *   CREATE UNIQUE INDEX vault_settings_org_key ON vault_settings(org_id, key);
     *
     * Until that migration lands, all org-scoped settings tests will fail.
     */
    const db = createMockDb();

    // Two orgs set the same key — without org_id they collide
    await setSetting(db, "default_event_duration", "60", "admin-a", ORG_A);
    await setSetting(db, "default_event_duration", "90", "admin-b", ORG_B);

    // Without org_id: second write overwrites first (key is PRIMARY KEY)
    // With org_id: both coexist (PRIMARY KEY becomes (org_id, key))
    const orgAValue = await getSetting(db, "default_event_duration", ORG_A);
    const orgBValue = await getSetting(db, "default_event_duration", ORG_B);

    // FAILS until schema migration + code changes land
    expect(orgAValue).toBe("60");
    expect(orgBValue).toBe("90");
  });
});
