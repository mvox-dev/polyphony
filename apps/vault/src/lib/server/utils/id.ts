/**
 * Shared ID generation utility
 * Consistent implementation across all database modules
 */

/**
 * Generate a unique ID for database records
 * @param prefix Optional prefix for namespaced IDs (e.g., 'org_', 'invite_')
 * @returns A 21-character alphanumeric ID (or prefix + remaining chars to total 21)
 */
export function generateId(prefix?: string): string {
  const base = crypto.randomUUID().replace(/-/g, "");
  if (!prefix) {
    return base.slice(0, 21);
  }
  // With prefix: total length is 21 chars (prefix + remaining)
  return `${prefix}${base.slice(0, 21 - prefix.length)}`;
}
