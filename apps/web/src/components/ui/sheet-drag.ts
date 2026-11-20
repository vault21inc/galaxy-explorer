/** How far a sheet's handle must be pulled down past its lowest height to close it, in CSS pixels. */
export const CLOSE_PULL_PX = 80;

/** A release faster than this, in CSS pixels per millisecond, is a flick: one stop on, that way. */
export const FLICK_PX_PER_MS = 0.5;

/** A press that moves less than this, in CSS pixels, is a tap, not a drag. */
export const DRAG_SLOP_PX = 6;

/** How long a sheet takes to move from one stop to the next, in milliseconds. */
export const SHEET_MOVE_MS = 200;

/**
 * Where a dragged sheet comes to rest (docs/plan/later/phone-usability.md, "The details
 * sheet's three stops").
 *
 * `heightsPx` are the stops' heights, smallest first. `heightPx` is the sheet's height when the
 * finger lifts, and `speedPxPerMs` how fast it was moving then, positive upward (growing).
 * `from` is the index of the stop the drag began at.
 *
 * - A flick goes one stop from where the drag began, in its direction; down from the lowest
 *   stop, it closes.
 * - Otherwise the nearest stop wins, and a pull of `CLOSE_PULL_PX` below the lowest closes.
 *
 * Returns the stop's index, or 'close'.
 */
export function snapStop(
  heightsPx: readonly number[],
  from: number,
  heightPx: number,
  speedPxPerMs: number,
): number | 'close' {
  const last = heightsPx.length - 1;
  const lowestPx = heightsPx[0] ?? 0;
  if (Math.abs(speedPxPerMs) >= FLICK_PX_PER_MS) {
    if (speedPxPerMs > 0) return Math.min(last, from + 1);
    return from === 0 ? 'close' : from - 1;
  }
  if (heightPx <= lowestPx - CLOSE_PULL_PX) return 'close';
  let nearest = 0;
  for (let index = 1; index <= last; index += 1) {
    const here = Math.abs((heightsPx[index] ?? 0) - heightPx);
    const best = Math.abs((heightsPx[nearest] ?? 0) - heightPx);
    if (here < best) nearest = index;
  }
  return nearest;
}
