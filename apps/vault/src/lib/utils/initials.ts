/**
 * Extract initials from a name (Issue #242)
 * "John Smith" → "JS", "Madonna" → "M", caps at 3 initials
 */
export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 3);
}
