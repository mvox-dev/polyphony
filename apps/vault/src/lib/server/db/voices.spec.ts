// voices.ts TDD test suite
import { describe, it, expect, beforeEach } from "vitest";
import {
  getActiveVoices,
  getAllVoices,
  getVoiceById,
  createVoice,
  toggleVoiceActive,
} from "./voices";
import type { CreateVoiceInput, Voice } from "$lib/types";

const TEST_ORG_ID = "org_test_001";

// Mock D1Database for testing (org-scoped)
function createMockDB(): D1Database {
  const voices = new Map<string, any>();

  // Seed default voices (matching migration, scoped to TEST_ORG_ID)
  voices.set("soprano", {
    id: "soprano",
    org_id: TEST_ORG_ID,
    name: "Soprano",
    abbreviation: "S",
    category: "vocal",
    range_group: "soprano",
    display_order: 10,
    is_active: 1,
  });
  voices.set("alto", {
    id: "alto",
    org_id: TEST_ORG_ID,
    name: "Alto",
    abbreviation: "A",
    category: "vocal",
    range_group: "alto",
    display_order: 20,
    is_active: 1,
  });
  voices.set("tenor", {
    id: "tenor",
    org_id: TEST_ORG_ID,
    name: "Tenor",
    abbreviation: "T",
    category: "vocal",
    range_group: "tenor",
    display_order: 30,
    is_active: 1,
  });
  voices.set("soprano-1", {
    id: "soprano-1",
    org_id: TEST_ORG_ID,
    name: "Soprano I",
    abbreviation: "S1",
    category: "vocal",
    range_group: "soprano",
    display_order: 11,
    is_active: 0,
  });

  return {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => ({
          first: async () => {
            if (sql.includes("WHERE id = ? AND org_id = ?")) {
              const voice = voices.get(params[0]);
              if (voice && voice.org_id === params[1]) return voice;
              return null;
            }
            if (sql.includes("WHERE id = ?")) {
              return voices.get(params[0]) || null;
            }
            return null;
          },
          all: async () => {
            const allVoices = Array.from(voices.values());
            // Filter by org_id (first bind param)
            const orgId = params[0];
            let filtered = allVoices.filter((v) => v.org_id === orgId);
            if (sql.includes("AND is_active = 1")) {
              filtered = filtered.filter((v) => v.is_active === 1);
            }
            return { results: filtered };
          },
          run: async () => {
            if (sql.includes("INSERT INTO voices")) {
              const [
                id,
                orgId,
                name,
                abbr,
                category,
                rangeGroup,
                displayOrder,
                isActive,
              ] = params;
              voices.set(id, {
                id,
                org_id: orgId,
                name,
                abbreviation: abbr,
                category,
                range_group: rangeGroup,
                display_order: displayOrder,
                is_active: isActive ?? 1,
              });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE voices SET is_active")) {
              const [isActive, id, orgId] = params;
              const voice = voices.get(id);
              if (voice && voice.org_id === orgId) {
                voice.is_active = isActive;
                return { success: true, meta: { changes: 1 } };
              }
              return { success: false, meta: { changes: 0 } };
            }
            return { success: false, meta: { changes: 0 } };
          },
        }),
        all: async () => {
          const results = Array.from(voices.values());
          if (sql.includes("WHERE is_active = 1")) {
            return { results: results.filter((v) => v.is_active === 1) };
          }
          return { results };
        },
        first: async () => {
          return null;
        },
        run: async () => ({ success: false, meta: { changes: 0 } }),
      };
    },
    dump: () => new ArrayBuffer(0),
    batch: () => Promise.resolve([]),
    exec: () => Promise.resolve({ count: 0, duration: 0 }),
  } as unknown as D1Database;
}

describe("voices.ts", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDB();
  });

  describe("getActiveVoices", () => {
    it("should return only active voices", async () => {
      const voices = await getActiveVoices(db, TEST_ORG_ID);
      expect(voices.length).toBe(3); // soprano, alto, tenor
      expect(voices.every((v: Voice) => v.isActive)).toBe(true);
    });

    it("should return voices ordered by display_order", async () => {
      const voices = await getActiveVoices(db, TEST_ORG_ID);
      expect(voices[0].name).toBe("Soprano");
      expect(voices[1].name).toBe("Alto");
      expect(voices[2].name).toBe("Tenor");
    });
  });

  describe("getAllVoices", () => {
    it("should return all voices including inactive", async () => {
      const voices = await getAllVoices(db, TEST_ORG_ID);
      expect(voices.length).toBeGreaterThanOrEqual(4); // soprano, alto, tenor, soprano-1
    });

    it("should include inactive voices", async () => {
      const voices = await getAllVoices(db, TEST_ORG_ID);
      const soprano1 = voices.find((v: Voice) => v.id === "soprano-1");
      expect(soprano1).toBeDefined();
      expect(soprano1!.isActive).toBe(false);
    });
  });

  describe("getVoiceById", () => {
    it("should return voice by id", async () => {
      const voice = await getVoiceById(db, "soprano", TEST_ORG_ID);
      expect(voice).toBeDefined();
      expect(voice!.name).toBe("Soprano");
      expect(voice!.abbreviation).toBe("S");
    });

    it("should return null for non-existent id", async () => {
      const voice = await getVoiceById(db, "nonexistent", TEST_ORG_ID);
      expect(voice).toBeNull();
    });

    it("should convert snake_case to camelCase", async () => {
      const voice = await getVoiceById(db, "soprano", TEST_ORG_ID);
      expect(voice).toHaveProperty("rangeGroup");
      expect(voice).toHaveProperty("displayOrder");
      expect(voice).toHaveProperty("isActive");
    });
  });

  describe("createVoice", () => {
    it("should create a new voice", async () => {
      const input: CreateVoiceInput = {
        orgId: TEST_ORG_ID,
        name: "Mezzo-Soprano",
        abbreviation: "MS",
        category: "vocal",
        rangeGroup: "mezzo",
        displayOrder: 15,
      };

      const voice = await createVoice(db, input);
      expect(voice.name).toBe("Mezzo-Soprano");
      expect(voice.abbreviation).toBe("MS");
      expect(voice.isActive).toBe(true);
    });

    it("should generate id from org + name", async () => {
      const input: CreateVoiceInput = {
        orgId: TEST_ORG_ID,
        name: "Mezzo-Soprano",
        abbreviation: "MS",
        category: "vocal",
        displayOrder: 15,
      };

      const voice = await createVoice(db, input);
      expect(voice.id).toBe(`${TEST_ORG_ID}_mezzo-soprano`);
    });

    it("should allow creating inactive voices", async () => {
      const input: CreateVoiceInput = {
        orgId: TEST_ORG_ID,
        name: "Counter-Tenor",
        abbreviation: "CT",
        category: "vocal",
        displayOrder: 25,
        isActive: false,
      };

      const voice = await createVoice(db, input);
      expect(voice.isActive).toBe(false);
    });
  });

  describe("toggleVoiceActive", () => {
    it("should activate an inactive voice", async () => {
      const result = await toggleVoiceActive(
        db,
        "soprano-1",
        true,
        TEST_ORG_ID,
      );
      expect(result).toBe(true);

      const voice = await getVoiceById(db, "soprano-1", TEST_ORG_ID);
      expect(voice!.isActive).toBe(true);
    });

    it("should deactivate an active voice", async () => {
      const result = await toggleVoiceActive(db, "soprano", false, TEST_ORG_ID);
      expect(result).toBe(true);

      const voice = await getVoiceById(db, "soprano", TEST_ORG_ID);
      expect(voice!.isActive).toBe(false);
    });

    it("should return false for non-existent voice", async () => {
      const result = await toggleVoiceActive(
        db,
        "nonexistent",
        true,
        TEST_ORG_ID,
      );
      expect(result).toBe(false);
    });
  });
});
