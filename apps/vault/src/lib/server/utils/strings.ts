/**
 * Shared string utility functions
 */

/**
 * Trim a string value, return null if empty
 * Used for partial updates where empty = unset
 */
export function trimOrNull(value: unknown): string | null {
  // Explicitly handle null and undefined
  if (value == null) return null;
  return typeof value === "string" ? value.trim() || null : null;
}

/**
 * Trim a string value, return undefined if empty
 * Used for optional fields that should not be set if empty
 */
export function trimOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() || undefined : undefined;
}
