import { CLICK_MAX_MOVE_PX } from '@/render/tuning.ts';

/**
 * Click versus drag (ux.md §3): a press that moves less than CLICK_MAX_MOVE_PX before release
 * is a click; anything more is a drag (rotate, pan, box-select). The selection (M2-T5) and the
 * context menu (M3) use this.
 */
export function isClick(
  down: { x: number; y: number },
  up: { x: number; y: number },
  maxMovePx = CLICK_MAX_MOVE_PX,
): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) < maxMovePx;
}
