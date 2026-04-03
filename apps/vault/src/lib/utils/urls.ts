/**
 * Edition URL utilities - single source of truth for all edition-related URLs
 *
 * This prevents URL mismatches across components and makes it easy to update
 * URL patterns in one place.
 */

/**
 * Get the URL to view an edition's PDF in the browser
 */
export function getEditionViewUrl(editionId: string): string {
  return `/editions/${editionId}/view`;
}

/**
 * Get the URL to download an edition's PDF file
 */
export function getEditionDownloadUrl(editionId: string): string {
  return `/api/editions/${editionId}/file?download=1`;
}

/**
 * Get the URL to stream/embed an edition's PDF (no download header)
 */
export function getEditionFileUrl(editionId: string): string {
  return `/api/editions/${editionId}/file`;
}

/**
 * Get the URL to the edition detail page
 */
export function getEditionPageUrl(editionId: string): string {
  return `/editions/${editionId}`;
}

/**
 * Get the URL to the work that contains this edition
 */
export function getWorkPageUrl(workId: string): string {
  return `/works/${workId}`;
}
