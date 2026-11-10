import type { ViewObject } from '@ge/domain';

/** What every renderer in the registry receives: the view's objects it draws. */
export interface RendererProps {
  objects: readonly ViewObject[];
  /**
   * The placement ghost (M3-T2): drawn see-through on top, following its group's transform,
   * and kept out of the scene index (no picking, labels or rings for it).
   */
  ghost?: boolean;
}
