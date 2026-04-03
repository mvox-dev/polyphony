/**
 * i18n message consistency tests
 * Issue #196 - Ensures all locales have consistent keys and no empty values
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const MESSAGES_DIR = join(__dirname, "../../../messages");

interface MessageObject {
  [key: string]: string | MessageObject;
}

/**
 * Flatten nested message object to dot-notation keys
 * e.g., { nav: { home: "Home" } } → { "nav.home": "Home" }
 */
function flattenMessages(
  obj: MessageObject,
  prefix = "",
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip JSON schema reference
    if (key === "$schema") continue;

    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "string") {
      result[fullKey] = value;
    } else if (typeof value === "object" && value !== null) {
      Object.assign(result, flattenMessages(value, fullKey));
    }
  }

  return result;
}

/**
 * Load and parse a message file
 */
function loadMessages(locale: string): MessageObject {
  const filePath = join(MESSAGES_DIR, `${locale}.json`);
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Get all available locales from message files
 */
function getAvailableLocales(): string[] {
  const files = readdirSync(MESSAGES_DIR);
  return files
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(".json", ""));
}

describe("i18n message consistency", () => {
  const locales = getAvailableLocales();
  const BASE_LOCALE = "en";

  it("should have at least 2 locales", () => {
    expect(locales.length).toBeGreaterThanOrEqual(2);
    expect(locales).toContain(BASE_LOCALE);
  });

  describe("all locales have same keys as base (en.json)", () => {
    const baseMessages = loadMessages(BASE_LOCALE);
    const baseKeys = Object.keys(flattenMessages(baseMessages)).sort();

    for (const locale of locales) {
      if (locale === BASE_LOCALE) continue;

      it(`${locale}.json has all keys from en.json`, () => {
        const localeMessages = loadMessages(locale);
        const localeKeys = Object.keys(flattenMessages(localeMessages)).sort();

        const missingKeys = baseKeys.filter((k) => !localeKeys.includes(k));
        const extraKeys = localeKeys.filter((k) => !baseKeys.includes(k));

        if (missingKeys.length > 0) {
          throw new Error(
            `${locale}.json is missing keys:\n  - ${missingKeys.join("\n  - ")}`,
          );
        }

        if (extraKeys.length > 0) {
          throw new Error(
            `${locale}.json has extra keys not in en.json:\n  - ${extraKeys.join("\n  - ")}`,
          );
        }

        expect(localeKeys).toEqual(baseKeys);
      });
    }
  });

  describe("no empty values in any locale", () => {
    for (const locale of locales) {
      it(`${locale}.json has no empty translation values`, () => {
        const messages = loadMessages(locale);
        const flattened = flattenMessages(messages);
        const emptyKeys: string[] = [];

        for (const [key, value] of Object.entries(flattened)) {
          if (!value || value.trim() === "") {
            emptyKeys.push(key);
          }
        }

        if (emptyKeys.length > 0) {
          throw new Error(
            `${locale}.json has empty values for:\n  - ${emptyKeys.join("\n  - ")}`,
          );
        }

        expect(emptyKeys).toHaveLength(0);
      });
    }
  });

  describe("no placeholder text remaining", () => {
    const PLACEHOLDER_PATTERNS = [
      /TODO/i,
      /FIXME/i,
      /XXX/i,
      /^\[.*\]$/, // [placeholder]
      /^<.*>$/, // <placeholder>
      /lorem ipsum/i,
    ];

    for (const locale of locales) {
      it(`${locale}.json has no placeholder text`, () => {
        const messages = loadMessages(locale);
        const flattened = flattenMessages(messages);
        const placeholders: string[] = [];

        for (const [key, value] of Object.entries(flattened)) {
          for (const pattern of PLACEHOLDER_PATTERNS) {
            if (pattern.test(value)) {
              placeholders.push(`${key}: "${value}"`);
              break;
            }
          }
        }

        if (placeholders.length > 0) {
          throw new Error(
            `${locale}.json contains placeholder text:\n  - ${placeholders.join("\n  - ")}`,
          );
        }

        expect(placeholders).toHaveLength(0);
      });
    }
  });

  describe("key naming conventions", () => {
    it("all keys use snake_case (lowercase with underscores)", () => {
      const messages = loadMessages(BASE_LOCALE);
      const keys = Object.keys(flattenMessages(messages));
      // snake_case: lowercase letters, numbers, underscores only (dots for nesting)
      const invalidKeys = keys.filter((k) => !/^[a-z0-9_.]+$/.test(k));

      if (invalidKeys.length > 0) {
        throw new Error(
          `Keys must be snake_case (lowercase). Invalid keys:\n  - ${invalidKeys.join("\n  - ")}`,
        );
      }

      expect(invalidKeys).toHaveLength(0);
    });

    it("all keys use underscore-separated flat format", () => {
      const messages = loadMessages(BASE_LOCALE);
      const keys = Object.keys(flattenMessages(messages));
      // Keys should be flat (no nesting) with underscores: e.g., nav_guides, roles_owner
      const invalidKeys = keys.filter((k) => k.includes("."));

      if (invalidKeys.length > 0) {
        throw new Error(
          `Keys should be flat (underscore-separated), not nested with dots:\n  - ${invalidKeys.join("\n  - ")}`,
        );
      }

      expect(invalidKeys).toHaveLength(0);
    });
  });
});
