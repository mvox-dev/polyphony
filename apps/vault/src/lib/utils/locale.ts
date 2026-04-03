// Locale utility for date/time formatting

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

/**
 * Format a date string with the given locale
 */
export function formatDate(
  dateStr: string,
  locale: string | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString(getLocale(locale), options);
}

/**
 * Format a time string with the given locale
 */
export function formatTime(
  dateStr: string,
  locale: string | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString(getLocale(locale), options);
}

/**
 * Format a datetime string with the given locale
 */
export function formatDateTime(
  dateStr: string,
  locale: string | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(dateStr);
  return date.toLocaleString(getLocale(locale), options);
}
