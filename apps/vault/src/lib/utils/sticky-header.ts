/**
 * Determines whether a sticky header should remain pinned.
 *
 * Returns true while the grid body extends below the header position (top of
 * viewport). Returns false once the last data row scrolls up to meet the
 * header — at that point the header should scroll away with its table.
 *
 * @param gridBottom - Bottom edge of the grid container relative to the viewport
 *                     (from getBoundingClientRect().bottom)
 * @param threshold - Minimum distance from viewport top before unsticking.
 *                    Should approximate the header's own height (default 100).
 */
export function shouldHeaderStick(
	gridBottom: number,
	threshold: number
): boolean {
	return gridBottom > threshold;
}
