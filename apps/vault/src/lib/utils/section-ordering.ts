/**
 * Utilities for sorting and grouping items by section display order.
 * Ensures consistent section ordering across the UI matching org settings.
 */

interface SectionInfo {
  name: string;
  displayOrder?: number;
}

/**
 * Groups items by section name and returns entries sorted by displayOrder.
 * Items without a section are grouped under "No section" at the end.
 */
export function groupBySection<T>(
  items: T[],
  getSection: (item: T) => SectionInfo | null | undefined,
): [string, T[]][] {
  const grouped: Record<string, T[]> = {};
  const sectionOrder = new Map<string, number>();

  for (const item of items) {
    const section = getSection(item);
    const sectionName = section?.name || "No section";
    if (!grouped[sectionName]) {
      grouped[sectionName] = [];
    }
    grouped[sectionName].push(item);
    if (section) {
      sectionOrder.set(sectionName, section.displayOrder ?? 999);
    }
  }

  return Object.entries(grouped).sort(([a], [b]) => {
    return (sectionOrder.get(a) ?? 999) - (sectionOrder.get(b) ?? 999);
  });
}

/**
 * Sorts items by section displayOrder, then by name within each section.
 */
export function sortBySection<T>(
  items: T[],
  getSection: (item: T) => SectionInfo | null | undefined,
  getName: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const orderA = getSection(a)?.displayOrder ?? 999;
    const orderB = getSection(b)?.displayOrder ?? 999;
    if (orderA !== orderB) return orderA - orderB;
    return getName(a).localeCompare(getName(b));
  });
}
