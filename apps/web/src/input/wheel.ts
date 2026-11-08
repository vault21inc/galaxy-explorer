import { PINCH_TO_WHEEL_PX, WHEEL_LINE_PX, WHEEL_MAX_PX } from '@/render/tuning.ts';

/**
 * Wheel input in pixels, whatever sent it (rendering.md §12):
 * - `deltaMode` 1 (lines, Firefox with a mouse) and 2 (pages) become pixels;
 * - a trackpad pinch arrives as a wheel event with `ctrlKey` set and small deltas: it's scaled so
 *   pinching and scrolling zoom at the same rate;
 * - very large single deltas (fast mouse wheels) are capped so one flick can't jump the view.
 */
export function wheelDeltaPx(
  event: Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'ctrlKey'>,
  viewportHeightPx: number,
): number {
  let px = event.deltaY;
  if (event.deltaMode === 1) px *= WHEEL_LINE_PX;
  else if (event.deltaMode === 2) px *= viewportHeightPx;
  if (event.ctrlKey) px *= PINCH_TO_WHEEL_PX;
  return Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, px));
}

/**
 * Safari's pinch: `gesturechange` reports the total scale since the gesture began. The change
 * in log(scale) since the last event, times GESTURE_LOG_SCALE_TO_PX, is the equivalent wheel
 * delta: pinching out (scale growing) zooms in, as a negative delta does.
 */
export function gestureDeltaPx(scale: number, previousScale: number, logScaleToPx: number): number {
  const px = -Math.log(scale / previousScale) * logScaleToPx;
  return Math.max(-WHEEL_MAX_PX, Math.min(WHEEL_MAX_PX, px));
}
