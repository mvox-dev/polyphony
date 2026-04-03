// Centralized date/time formatting and comparison utilities
// Issue #142 - DRY: Extract shared utilities

/**
 * Default event duration in minutes (2 hours)
 * Used as fallback when ends_at is null
 */
export const DEFAULT_EVENT_DURATION_MINUTES = 120;

/**
 * Get the locale to use for date formatting
 * Returns undefined for 'system' to use browser default
 */
export function getLocale(
  setting: string | undefined | null,
): string | undefined {
  if (!setting || setting === "system") {
    return undefined; // Browser default
  }
  return setting;
}

// ============================================================================
// DATE FORMATTING
// ============================================================================

/**
 * Format a date string for display (short format)
 * Example: "Jan 30" or "30 Jan" depending on locale
 */
export function formatDateShort(
  dateStr: string,
  locale?: string | undefined,
): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(getLocale(locale), {
    month: "short",
    day: "numeric",
  });
}

/**
 * Format a date string for display (medium format with weekday)
 * Example: "Thu, Jan 30, 2026"
 */
export function formatDateMedium(
  dateStr: string,
  locale?: string | undefined,
): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(getLocale(locale), {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Format a date string for display (long format)
 * Example: "January 30, 2026"
 */
export function formatDateLong(
  dateStr: string,
  locale?: string | undefined,
): string {
  // Handle date-only strings (YYYY-MM-DD) by appending time to avoid timezone issues
  const normalizedDate = dateStr.includes("T")
    ? dateStr
    : `${dateStr}T00:00:00`;
  const date = new Date(normalizedDate);
  return date.toLocaleDateString(getLocale(locale), {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a date string for display (full format)
 * Example: "Thursday, January 30, 2026"
 */
export function formatDateFull(
  dateStr: string,
  locale?: string | undefined,
): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(getLocale(locale), {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// ============================================================================
// TIME FORMATTING
// ============================================================================

/**
 * Format a time from an ISO string
 * Example: "7:00 PM" or "19:00"
 */
export function formatTime(
  dateStr: string,
  locale?: string | undefined,
): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(getLocale(locale), {
    hour: "numeric",
    minute: "2-digit",
  });
}

// ============================================================================
// DATETIME FORMATTING
// ============================================================================

/**
 * Format a datetime string (medium format with time)
 * Example: "Thu, Jan 30, 2026, 7:00 PM"
 */
export function formatDateTimeMedium(
  dateStr: string,
  locale?: string | undefined,
): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(getLocale(locale), {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Format a datetime string (full format)
 * Example: "Thursday, January 30, 2026 at 7:00 PM"
 */
export function formatDateTimeFull(
  dateStr: string,
  locale?: string | undefined,
): string {
  const date = new Date(dateStr);
  return date.toLocaleString(getLocale(locale), {
    dateStyle: "full",
    timeStyle: "short",
  });
}

/**
 * Format a datetime as separate date and time strings
 * Useful for displaying date and time in different elements
 */
export function formatDateTimeComponents(
  dateStr: string,
  locale?: string | undefined,
): { date: string; time: string } {
  const date = formatDateMedium(dateStr, locale);
  const time = formatTime(dateStr, locale);
  return { date, time };
}

// ============================================================================
// DATE COMPARISONS
// ============================================================================

/**
 * Check if a date is in the past (before today)
 */
export function isPast(dateStr: string): boolean {
  return new Date(dateStr) < new Date();
}

/**
 * Check if a date is expired (same as isPast, semantic alias)
 */
export function isExpired(dateStr: string): boolean {
  return isPast(dateStr);
}

/**
 * Check if a date is today
 */
export function isToday(dateStr: string): boolean {
  const date = new Date(dateStr);
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

/**
 * Check if a date is in the future (after now)
 */
export function isFuture(dateStr: string): boolean {
  return new Date(dateStr) > new Date();
}

/**
 * Get start of day for a date (midnight)
 */
export function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

/**
 * Compare two dates at day precision (ignoring time)
 * Returns: -1 if a < b, 0 if same day, 1 if a > b
 */
export function compareDays(a: string | Date, b: string | Date): number {
  const dateA = startOfDay(new Date(a));
  const dateB = startOfDay(new Date(b));
  if (dateA < dateB) return -1;
  if (dateA > dateB) return 1;
  return 0;
}

// ============================================================================
// DURATION FORMATTING
// ============================================================================

/**
 * Calculate duration in minutes between two ISO datetime strings
 */
export function calculateDurationMinutes(
  startIso: string,
  endIso: string,
): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return Math.floor((end.getTime() - start.getTime()) / (1000 * 60));
}

/**
 * Format a duration in minutes to human-readable format
 * Example: 90 -> "1h 30m", 1500 -> "1d 1h"
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";

  const days = Math.floor(minutes / (24 * 60));
  const remainingAfterDays = minutes % (24 * 60);
  const hours = Math.floor(remainingAfterDays / 60);
  const mins = remainingAfterDays % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);

  return parts.join(" ") || "0m";
}

/**
 * Format duration between two dates
 */
export function formatDurationBetween(
  startIso: string,
  endIso: string,
): string {
  const minutes = calculateDurationMinutes(startIso, endIso);
  return formatDuration(minutes);
}
