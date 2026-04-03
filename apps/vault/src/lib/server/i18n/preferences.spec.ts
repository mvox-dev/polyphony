// Tests for i18n preference resolution service (Epic #183, Issue #187)
import { describe, it, expect, beforeEach } from "vitest";
import type { D1Database } from "@cloudflare/workers-types";
import { resolvePreferences, SYSTEM_DEFAULTS } from "./preferences";

// Mock D1Database for testing
function createMockDB(config: {
  memberPrefs?: {
    language?: string | null;
    locale?: string | null;
    timezone?: string | null;
  } | null;
  orgSettings?: {
    language?: string | null;
    locale?: string | null;
    timezone?: string | null;
  } | null;
}): D1Database {
  return {
    prepare: (sql: string) => {
      return {
        bind: (..._params: any[]) => ({
          first: async () => {
            if (sql.includes("FROM member_preferences")) {
              if (!config.memberPrefs) return null;
              return {
                member_id: "test-member",
                language: config.memberPrefs.language ?? null,
                locale: config.memberPrefs.locale ?? null,
                timezone: config.memberPrefs.timezone ?? null,
                updated_at: new Date().toISOString(),
              };
            }
            if (sql.includes("FROM organizations")) {
              if (!config.orgSettings) return null;
              return {
                id: "test-org",
                name: "Test Org",
                language: config.orgSettings.language ?? null,
                locale: config.orgSettings.locale ?? null,
                timezone: config.orgSettings.timezone ?? null,
              };
            }
            return null;
          },
        }),
      };
    },
  } as unknown as D1Database;
}

describe("I18n Preference Resolution", () => {
  describe("resolvePreferences", () => {
    describe("full cascade: member → org → system", () => {
      it("uses member preferences when all are set", async () => {
        const db = createMockDB({
          memberPrefs: {
            language: "et",
            locale: "et-EE",
            timezone: "Europe/Tallinn",
          },
          orgSettings: {
            language: "en",
            locale: "en-US",
            timezone: "America/New_York",
          },
        });

        const result = await resolvePreferences(db, "test-member", "test-org");

        expect(result.language).toBe("et");
        expect(result.locale).toBe("et-EE");
        expect(result.timezone).toBe("Europe/Tallinn");
        expect(result.source.language).toBe("member");
        expect(result.source.locale).toBe("member");
        expect(result.source.timezone).toBe("member");
      });

      it("falls back to org when member has no preferences", async () => {
        const db = createMockDB({
          memberPrefs: null,
          orgSettings: {
            language: "de",
            locale: "de-DE",
            timezone: "Europe/Berlin",
          },
        });

        const result = await resolvePreferences(db, "test-member", "test-org");

        expect(result.language).toBe("de");
        expect(result.locale).toBe("de-DE");
        expect(result.timezone).toBe("Europe/Berlin");
        expect(result.source.language).toBe("organization");
        expect(result.source.locale).toBe("organization");
        expect(result.source.timezone).toBe("organization");
      });

      it("falls back to system when both member and org are null", async () => {
        const db = createMockDB({
          memberPrefs: null,
          orgSettings: { language: null, locale: null, timezone: null },
        });

        const result = await resolvePreferences(db, "test-member", "test-org");

        expect(result.language).toBe(SYSTEM_DEFAULTS.language);
        expect(result.locale).toBe(SYSTEM_DEFAULTS.locale);
        expect(result.timezone).toBe(SYSTEM_DEFAULTS.timezone);
        expect(result.source.language).toBe("system");
        expect(result.source.locale).toBe("system");
        expect(result.source.timezone).toBe("system");
      });

      it("mixes sources when partially set", async () => {
        const db = createMockDB({
          memberPrefs: { language: "et", locale: null, timezone: null },
          orgSettings: { language: "en", locale: "en-GB", timezone: null },
        });

        const result = await resolvePreferences(db, "test-member", "test-org");

        expect(result.language).toBe("et");
        expect(result.source.language).toBe("member");

        expect(result.locale).toBe("en-GB");
        expect(result.source.locale).toBe("organization");

        expect(result.timezone).toBe(SYSTEM_DEFAULTS.timezone);
        expect(result.source.timezone).toBe("system");
      });
    });

    describe("anonymous users (no member)", () => {
      it("uses org settings when memberId is null", async () => {
        const db = createMockDB({
          memberPrefs: null,
          orgSettings: {
            language: "et",
            locale: "et-EE",
            timezone: "Europe/Tallinn",
          },
        });

        const result = await resolvePreferences(db, null, "test-org");

        expect(result.language).toBe("et");
        expect(result.locale).toBe("et-EE");
        expect(result.timezone).toBe("Europe/Tallinn");
        expect(result.source.language).toBe("organization");
        expect(result.source.locale).toBe("organization");
        expect(result.source.timezone).toBe("organization");
      });

      it("falls back to system defaults for anonymous with no org settings", async () => {
        const db = createMockDB({
          memberPrefs: null,
          orgSettings: { language: null, locale: null, timezone: null },
        });

        const result = await resolvePreferences(db, null, "test-org");

        expect(result.language).toBe(SYSTEM_DEFAULTS.language);
        expect(result.locale).toBe(SYSTEM_DEFAULTS.locale);
        expect(result.timezone).toBe(SYSTEM_DEFAULTS.timezone);
      });
    });

    describe("edge cases", () => {
      it("handles org not found gracefully", async () => {
        const db = createMockDB({
          memberPrefs: null,
          orgSettings: null,
        });

        const result = await resolvePreferences(
          db,
          "test-member",
          "non-existent",
        );

        // Should fall back to system defaults
        expect(result.language).toBe(SYSTEM_DEFAULTS.language);
        expect(result.locale).toBe(SYSTEM_DEFAULTS.locale);
        expect(result.timezone).toBe(SYSTEM_DEFAULTS.timezone);
      });

      it("member preferences override org even when member prefs are empty strings", async () => {
        // Empty string is different from null - it means "explicitly set to nothing"
        // But in our case, we treat empty strings as null (unset)
        const db = createMockDB({
          memberPrefs: { language: "", locale: "", timezone: "" },
          orgSettings: {
            language: "en",
            locale: "en-US",
            timezone: "America/New_York",
          },
        });

        const result = await resolvePreferences(db, "test-member", "test-org");

        // Empty strings should be treated as null, so fall back to org
        expect(result.language).toBe("en");
        expect(result.source.language).toBe("organization");
      });
    });
  });

  describe("SYSTEM_DEFAULTS", () => {
    it("has sensible defaults", () => {
      expect(SYSTEM_DEFAULTS.language).toBe("en");
      expect(SYSTEM_DEFAULTS.locale).toBe("en-US");
      expect(SYSTEM_DEFAULTS.timezone).toBe("UTC");
    });
  });
});
