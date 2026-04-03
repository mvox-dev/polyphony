// Tests for vault settings database operations
import { describe, it, expect, beforeEach } from "vitest";
import { createOrgId } from "@polyphony/shared";
import {
  getSetting,
  setSetting,
  getAllSettings,
} from "$lib/server/db/settings";

const ORG_A = createOrgId("org_aaaaaaaaa");

// Mock D1 database — stores settings keyed by "org_id:key"
function createMockDb() {
  const store = new Map<
    string,
    { value: string; updated_by: string | null; updated_at: string }
  >();

  return {
    prepare: (query: string) => {
      const statement = {
        bind: (...params: unknown[]) => {
          statement._params = params;
          return statement;
        },
        first: async () => {
          if (query.includes("SELECT")) {
            const orgId = statement._params?.[0] as string;
            const key = statement._params?.[1] as string;
            const row = store.get(`${orgId}:${key}`);
            return row ? { key, ...row } : null;
          }
          return null;
        },
        all: async () => {
          if (query.includes("SELECT") && query.includes("WHERE org_id")) {
            const orgId = statement._params?.[0] as string;
            const results = Array.from(store.entries())
              .filter(([k]) => k.startsWith(`${orgId}:`))
              .map(([k, data]) => ({
                key: k.split(":").slice(1).join(":"),
                ...data,
              }));
            return { results };
          }
          return { results: [] };
        },
        run: async () => {
          if (query.includes("INSERT") || query.includes("ON CONFLICT")) {
            const [orgId, key, value, updated_by] = statement._params as [
              string,
              string,
              string,
              string | undefined,
            ];
            store.set(`${orgId}:${key}`, {
              value,
              updated_by: updated_by ?? null,
              updated_at: new Date().toISOString(),
            });
          }
          return { success: true };
        },
        _params: [] as unknown[],
      };
      return statement;
    },
  } as unknown as D1Database;
}

describe("Vault Settings DB", () => {
  let db: D1Database;

  beforeEach(() => {
    db = createMockDb();
  });

  describe("getSetting", () => {
    it("returns value for existing key", async () => {
      await setSetting(db, "test_key", "test_value", undefined, ORG_A);

      const result = await getSetting(db, "test_key", ORG_A);
      expect(result).toBe("test_value");
    });

    it("returns null for non-existent key", async () => {
      const result = await getSetting(db, "nonexistent", ORG_A);
      expect(result).toBeNull();
    });
  });

  describe("setSetting", () => {
    it("creates new setting", async () => {
      await setSetting(db, "new_key", "new_value", "user123", ORG_A);

      const result = await getSetting(db, "new_key", ORG_A);
      expect(result).toBe("new_value");
    });

    it("updates existing setting", async () => {
      await setSetting(db, "key", "original", "user1", ORG_A);
      await setSetting(db, "key", "updated", "user2", ORG_A);

      const result = await getSetting(db, "key", ORG_A);
      expect(result).toBe("updated");
    });

    it("works without updated_by parameter", async () => {
      await setSetting(db, "key", "value", undefined, ORG_A);

      const result = await getSetting(db, "key", ORG_A);
      expect(result).toBe("value");
    });
  });

  describe("getAllSettings", () => {
    it("returns all settings as object", async () => {
      await setSetting(db, "key1", "value1", undefined, ORG_A);
      await setSetting(db, "key2", "value2", undefined, ORG_A);
      await setSetting(db, "key3", "value3", undefined, ORG_A);

      const result = await getAllSettings(db, ORG_A);
      expect(result).toEqual({
        key1: "value1",
        key2: "value2",
        key3: "value3",
      });
    });

    it("returns empty object when no settings exist", async () => {
      const result = await getAllSettings(db, ORG_A);
      expect(result).toEqual({});
    });
  });
});
