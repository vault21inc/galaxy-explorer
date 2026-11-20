import type { ViewInsets } from '@/state/view-insets.ts';

/** How far the picture is moved from the canvas's center, in CSS pixels: left and up. */
export interface ViewShift {
  xPx: number;
  yPx: number;
}

/**
 * How far to slide the picture so its center is the middle of what the panels leave uncovered
 * (rendering.md §12, "The view shift").
 *
 * The uncovered band runs from `topPx` below the canvas's top to `bottomPx` above its bottom.
 * Its middle is `(bottomPx - topPx) / 2` above the canvas's middle, so that's how far up the
 * picture goes. It never goes down: with only the top bar in the way, nothing shifts. Sideways
 * the same, for a panel on the right: left by half its width.
 */
export function shiftFor(insets: ViewInsets): ViewShift {
  return {
    xPx: Math.max(0, insets.rightPx / 2),
    yPx: Math.max(0, (insets.bottomPx - insets.topPx) / 2),
  };
}

/**
 * How much larger to treat a sphere when framing it, so it fits the uncovered band and not
 * only the whole canvas. A sphere fills the view's smaller side, so the factor is the canvas's
 * smaller side over the band's. Never under 1, and 1 when the band has no room at all.
 */
export function fitScale(size: { width: number; height: number }, insets: ViewInsets): number {
  const band = Math.min(size.width - insets.rightPx, size.height - insets.topPx - insets.bottomPx);
  if (band <= 0) return 1;
  return Math.max(1, Math.min(size.width, size.height) / band);
}
