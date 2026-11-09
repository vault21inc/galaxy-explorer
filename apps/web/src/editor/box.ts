import type { ScreenRect } from '@/render/picking/screen-picker.ts';

/** The rectangle between two points, whichever way the drag went. */
export function rectBetween(a: { x: number; y: number }, b: { x: number; y: number }): ScreenRect {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    right: Math.max(a.x, b.x),
    bottom: Math.max(a.y, b.y),
  };
}

/**
 * The ids a box selection ends with (ux.md §5): the boxed objects, or with Shift those added
 * to the current selection.
 */
export function boxSelection(
  current: readonly string[],
  boxed: readonly string[],
  add: boolean,
): string[] {
  if (!add) return [...boxed];
  return [...current, ...boxed.filter((id) => !current.includes(id))];
}
