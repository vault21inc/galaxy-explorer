import { DOUBLE_TAP_MS, DOUBLE_TAP_SLOP_PX } from '@/render/tuning.ts';

/** A tap: when and where it landed, and on what (null for empty space). */
export interface Tap {
  timeMs: number;
  x: number;
  y: number;
  id: string | null;
}

/**
 * Whether `tap` makes a double-tap with the one before it (ux.md §3): on the same object,
 * within DOUBLE_TAP_MS and DOUBLE_TAP_SLOP_PX. Pure, so it's unit-tested; the pointer handler
 * (use-pointer-selection.ts) keeps the last tap. The first tap has already selected, as a click
 * does: nothing waits to see whether a second comes.
 */
export function isDoubleTap(
  previous: Tap | null,
  tap: Tap,
  limits = { ms: DOUBLE_TAP_MS, slopPx: DOUBLE_TAP_SLOP_PX },
): boolean {
  if (!previous || tap.id === null || previous.id !== tap.id) return false;
  const elapsed = tap.timeMs - previous.timeMs;
  if (elapsed < 0 || elapsed > limits.ms) return false;
  return Math.hypot(tap.x - previous.x, tap.y - previous.y) <= limits.slopPx;
}
