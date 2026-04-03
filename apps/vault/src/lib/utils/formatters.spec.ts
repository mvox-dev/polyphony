// Tests for formatters utility functions
// Issue #142 - DRY: Extract shared utilities

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getLocale,
  formatDateShort,
  formatDateMedium,
  formatDateLong,
  formatDateFull,
  formatTime,
  formatDateTimeMedium,
  formatDateTimeFull,
  formatDateTimeComponents,
  isPast,
  isExpired,
  isToday,
  isFuture,
  startOfDay,
  compareDays,
  calculateDurationMinutes,
  formatDuration,
  formatDurationBetween,
} from "./formatters";

describe("getLocale", () => {
  it("returns undefined for system setting", () => {
    expect(getLocale("system")).toBeUndefined();
  });

  it("returns undefined for null", () => {
    expect(getLocale(null)).toBeUndefined();
  });

  it("returns undefined for undefined", () => {
    expect(getLocale(undefined)).toBeUndefined();
  });

  it("returns the locale string for other values", () => {
    expect(getLocale("en-US")).toBe("en-US");
    expect(getLocale("de-DE")).toBe("de-DE");
  });
});

describe("Date formatting", () => {
  // Use a fixed date for consistent tests
  const testDate = "2026-01-30T19:00:00Z";
  const testDateOnly = "2026-01-30";

  describe("formatDateShort", () => {
    it("formats date in short format", () => {
      const result = formatDateShort(testDate, "en-US");
      expect(result).toMatch(/Jan/);
      expect(result).toMatch(/30/);
    });
  });

  describe("formatDateMedium", () => {
    it("includes weekday, month, day, year", () => {
      const result = formatDateMedium(testDate, "en-US");
      expect(result).toMatch(/Fri|Jan|30|2026/);
    });
  });

  describe("formatDateLong", () => {
    it("formats date-only strings correctly", () => {
      const result = formatDateLong(testDateOnly, "en-US");
      expect(result).toMatch(/January/);
      expect(result).toMatch(/30/);
      expect(result).toMatch(/2026/);
    });

    it("formats full datetime strings", () => {
      const result = formatDateLong(testDate, "en-US");
      expect(result).toMatch(/2026/);
    });
  });

  describe("formatDateFull", () => {
    it("includes full weekday name", () => {
      const result = formatDateFull(testDate, "en-US");
      expect(result).toMatch(/Friday|January|30|2026/);
    });
  });
});

describe("Time formatting", () => {
  it("formats time correctly", () => {
    const testDate = "2026-01-30T19:30:00";
    const result = formatTime(testDate, "en-US");
    // Should include hour and minute
    expect(result).toMatch(/7|19/); // 7 PM or 19:30
    expect(result).toMatch(/30/);
  });
});

describe("DateTime formatting", () => {
  const testDateTime = "2026-01-30T19:00:00";

  describe("formatDateTimeMedium", () => {
    it("includes date and time", () => {
      const result = formatDateTimeMedium(testDateTime, "en-US");
      expect(result).toMatch(/Jan|30/);
      expect(result).toMatch(/7|19/); // hour
    });
  });

  describe("formatDateTimeFull", () => {
    it("includes full date and time", () => {
      const result = formatDateTimeFull(testDateTime, "en-US");
      expect(result).toMatch(/January|Friday/);
      expect(result).toMatch(/30/);
      expect(result).toMatch(/7|19/); // hour
    });
  });

  describe("formatDateTimeComponents", () => {
    it("returns separate date and time strings", () => {
      const result = formatDateTimeComponents(testDateTime, "en-US");
      expect(result).toHaveProperty("date");
      expect(result).toHaveProperty("time");
      expect(result.date).toMatch(/Jan|30/);
      expect(result.time).toMatch(/7|19/);
    });
  });
});

describe("Date comparisons", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-30T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("isPast", () => {
    it("returns true for past dates", () => {
      expect(isPast("2026-01-29T00:00:00Z")).toBe(true);
      expect(isPast("2020-01-01T00:00:00Z")).toBe(true);
    });

    it("returns false for future dates", () => {
      expect(isPast("2026-01-31T00:00:00Z")).toBe(false);
      expect(isPast("2030-01-01T00:00:00Z")).toBe(false);
    });

    it("returns true for past time today", () => {
      expect(isPast("2026-01-30T11:00:00Z")).toBe(true);
    });

    it("returns false for future time today", () => {
      expect(isPast("2026-01-30T13:00:00Z")).toBe(false);
    });
  });

  describe("isExpired", () => {
    it("is an alias for isPast", () => {
      expect(isExpired("2026-01-29T00:00:00Z")).toBe(true);
      expect(isExpired("2026-01-31T00:00:00Z")).toBe(false);
    });
  });

  describe("isToday", () => {
    it("returns true for today", () => {
      // Use local time (no Z suffix) to avoid timezone issues
      expect(isToday("2026-01-30T00:00:00")).toBe(true);
      expect(isToday("2026-01-30T23:59:59")).toBe(true);
    });

    it("returns false for other days", () => {
      expect(isToday("2026-01-29T12:00:00")).toBe(false);
      expect(isToday("2026-01-31T12:00:00")).toBe(false);
    });
  });

  describe("isFuture", () => {
    it("returns true for future dates", () => {
      expect(isFuture("2026-01-31T00:00:00Z")).toBe(true);
      expect(isFuture("2026-01-30T13:00:00Z")).toBe(true);
    });

    it("returns false for past dates", () => {
      expect(isFuture("2026-01-29T00:00:00Z")).toBe(false);
    });
  });

  describe("startOfDay", () => {
    it("returns midnight of the same day", () => {
      const date = new Date("2026-01-30T15:30:45.123Z");
      const result = startOfDay(date);
      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      expect(result.getMilliseconds()).toBe(0);
    });
  });

  describe("compareDays", () => {
    it("returns -1 when a is before b", () => {
      expect(compareDays("2026-01-29", "2026-01-30")).toBe(-1);
    });

    it("returns 1 when a is after b", () => {
      expect(compareDays("2026-01-31", "2026-01-30")).toBe(1);
    });

    it("returns 0 for same day regardless of time", () => {
      expect(compareDays("2026-01-30T00:00:00", "2026-01-30T23:59:59")).toBe(0);
    });
  });
});

describe("Duration calculations", () => {
  describe("calculateDurationMinutes", () => {
    it("calculates minutes between two times", () => {
      const start = "2026-01-30T10:00:00Z";
      const end = "2026-01-30T11:30:00Z";
      expect(calculateDurationMinutes(start, end)).toBe(90);
    });

    it("handles multi-day durations", () => {
      const start = "2026-01-30T10:00:00Z";
      const end = "2026-01-31T10:00:00Z";
      expect(calculateDurationMinutes(start, end)).toBe(24 * 60);
    });
  });

  describe("formatDuration", () => {
    it("formats minutes only", () => {
      expect(formatDuration(45)).toBe("45m");
    });

    it("formats hours and minutes", () => {
      expect(formatDuration(90)).toBe("1h 30m");
    });

    it("formats hours only when no remaining minutes", () => {
      expect(formatDuration(120)).toBe("2h");
    });

    it("formats days, hours, and minutes", () => {
      expect(formatDuration(1530)).toBe("1d 1h 30m");
    });

    it("returns 0m for zero or negative", () => {
      expect(formatDuration(0)).toBe("0m");
      expect(formatDuration(-10)).toBe("0m");
    });
  });

  describe("formatDurationBetween", () => {
    it("combines calculation and formatting", () => {
      const start = "2026-01-30T10:00:00Z";
      const end = "2026-01-30T11:30:00Z";
      expect(formatDurationBetween(start, end)).toBe("1h 30m");
    });
  });
});
