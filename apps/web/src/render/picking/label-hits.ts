import type { PlacedLabel } from '../labels/solve-labels.ts';
import { LABEL_GAP_PX, LABEL_HIT_PADDING_PX } from '../tuning.ts';

/**
 * Object labels as pick targets (rendering.md §10): pointing at a label means pointing at its
 * object, for hover, click, double-click and dragging alike. The label driver publishes where
 * it placed the labels after each frame. A dot under the pointer still wins over a label drawn
 * across it, but a label wins over wide targets such as an asteroid belt's band (picking.ts).
 *
 * The labels themselves let pointer events through to the canvas (label-pool.ts), so dragging
 * the camera across a label still works and every gesture goes through one input path. Group
 * labels are left out: they take their own clicks and select the group (M4-T4).
 */
let placed: readonly PlacedLabel[] = [];

export function publishLabelHits(labels: readonly PlacedLabel[]): void {
  placed = labels;
}

/**
 * The id of the object whose label is at this canvas point (CSS pixels), or null. A label's
 * hit area reaches back across the gap to its body: a pointer moving from the body to its
 * label never crosses empty space, where the hover would end and the label vanish (labels
 * show on hover by default). Padded labels may overlap, so the first placed (the higher
 * ranked) wins.
 */
export function labelHitAt(
  xPx: number,
  yPx: number,
  /** How far beyond the text a label is hit: wider for a finger (LABEL_HIT_PADDING_TOUCH_PX). */
  paddingPx = LABEL_HIT_PADDING_PX,
): string | null {
  // Later labels were placed after earlier ones and don't overlap them, so any hit is the hit.
  for (const label of placed) {
    if (label.kind !== 'object') continue;
    if (
      xPx >= label.left - LABEL_GAP_PX - paddingPx &&
      xPx <= label.left + label.width + paddingPx &&
      yPx >= label.top - paddingPx &&
      yPx <= label.top + label.height + paddingPx
    ) {
      return label.id;
    }
  }
  return null;
}
