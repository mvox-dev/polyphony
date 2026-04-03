// Tests for member preferences database operations (Epic #183 - i18n)
import { describe, it, expect, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import {
  getMemberPreferences,
  setMemberPreferences,
  deleteMemberPreferences,
} from "./member-preferences";

// Mock D1Database for testing
function createMockDB(): D1Database {
  const preferences = new Map<string, any>();

  return {
    prepare: (sql: string) => {
      return {
        bind: (...params: any[]) => ({
          first: async () => {
            if (sql.includes("SELECT * FROM member_preferences")) {
              const [memberId] = params;
              return preferences.get(memberId) || null;
            }
            return null;
          },
          run: async () => {
            if (sql.includes("INSERT INTO member_preferences")) {
              const [memberId, language, locale, timezone] = params;
              preferences.set(memberId, {
                member_id: memberId,
                language,
                locale,
                timezone,
                updated_at: new Date().toISOString(),
              });
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("UPDATE member_preferences SET")) {
              const memberId = params[params.length - 1];
              const existing = preferences.get(memberId);
              if (existing) {
                // Parse update fields from SQL
                let paramIndex = 0;
                if (sql.includes("language = ?")) {
                  existing.language = params[paramIndex++];
                }
                if (sql.includes("locale = ?")) {
                  existing.locale = params[paramIndex++];
                }
                if (sql.includes("timezone = ?")) {
                  existing.timezone = params[paramIndex++];
                }
                existing.updated_at = new Date().toISOString();
                return { success: true, meta: { changes: 1 } };
              }
              return { success: false, meta: { changes: 0 } };
            }
            if (sql.includes("DELETE FROM member_preferences")) {
              const [memberId] = params;
              const had = preferences.has(memberId);
              preferences.delete(memberId);
              return { success: had, meta: { changes: had ? 1 : 0 } };
            }
            return { success: false, meta: { changes: 0 } };
          },
        }),
      };
    },
  } as unknown as D1Database;
}

describe("Member Preferences", () => {
  let db: D1Database;
  const memberId = "test-member-id";

  beforeEach(() => {
    db = createMockDB();
  });

  describe("getMemberPreferences", () => {
    it("returns null for member without preferences", async () => {
      const result = await getMemberPreferences(db, memberId);
      expect(result).toBeNull();
    });

    it("returns null for non-existent member", async () => {
      const result = await getMemberPreferences(db, "non-existent");
      expect(result).toBeNull();
    });

    it("returns preferences if they exist", async () => {
      // Create preferences first
      await setMemberPreferences(db, memberId, {
        language: "et",
        locale: "et-EE",
        timezone: "Europe/Tallinn",
      });

      const result = await getMemberPreferences(db, memberId);

      expect(result).not.toBeNull();
      expect(result!.memberId).toBe(memberId);
      expect(result!.language).toBe("et");
      expect(result!.locale).toBe("et-EE");
      expect(result!.timezone).toBe("Europe/Tallinn");
      expect(result!.updatedAt).toBeDefined();
    });

    it("handles partial preferences (some null)", async () => {
      await setMemberPreferences(db, memberId, {
        language: "en",
        locale: null,
        timezone: null,
      });

      const result = await getMemberPreferences(db, memberId);

      expect(result).not.toBeNull();
      expect(result!.language).toBe("en");
      expect(result!.locale).toBeNull();
      expect(result!.timezone).toBeNull();
    });
  });

  describe("setMemberPreferences", () => {
    it("creates new preferences when none exist", async () => {
      const result = await setMemberPreferences(db, memberId, {
        language: "et",
        locale: "et-EE",
        timezone: "Europe/Tallinn",
      });

      expect(result.memberId).toBe(memberId);
      expect(result.language).toBe("et");
      expect(result.locale).toBe("et-EE");
      expect(result.timezone).toBe("Europe/Tallinn");
    });

    it("updates existing preferences", async () => {
      // Create initial preferences
      await setMemberPreferences(db, memberId, {
        language: "et",
        locale: "et-EE",
        timezone: "Europe/Tallinn",
      });

      // Update
      const result = await setMemberPreferences(db, memberId, {
        language: "en",
        locale: "en-US",
        timezone: "America/New_York",
      });

      expect(result.language).toBe("en");
      expect(result.locale).toBe("en-US");
      expect(result.timezone).toBe("America/New_York");
    });

    it("allows partial updates", async () => {
      // Create initial preferences
      await setMemberPreferences(db, memberId, {
        language: "et",
        locale: "et-EE",
        timezone: "Europe/Tallinn",
      });

      // Partial update - only timezone
      const result = await setMemberPreferences(db, memberId, {
        timezone: "America/New_York",
      });

      // Should preserve unchanged fields
      expect(result.language).toBe("et");
      expect(result.locale).toBe("et-EE");
      expect(result.timezone).toBe("America/New_York");
    });

    it("can set preferences to null", async () => {
      // Create initial preferences
      await setMemberPreferences(db, memberId, {
        language: "et",
        locale: "et-EE",
        timezone: "Europe/Tallinn",
      });

      // Clear locale
      const result = await setMemberPreferences(db, memberId, {
        locale: null,
      });

      expect(result.language).toBe("et");
      expect(result.locale).toBeNull();
      expect(result.timezone).toBe("Europe/Tallinn");
    });
  });

  describe("deleteMemberPreferences", () => {
    it("returns true when preferences deleted", async () => {
      // Create preferences first
      await setMemberPreferences(db, memberId, {
        language: "et",
      });

      const deleted = await deleteMemberPreferences(db, memberId);
      expect(deleted).toBe(true);

      // Verify deleted
      const result = await getMemberPreferences(db, memberId);
      expect(result).toBeNull();
    });

    it("returns false when no preferences to delete", async () => {
      const deleted = await deleteMemberPreferences(db, "non-existent");
      expect(deleted).toBe(false);
    });
  });
});
