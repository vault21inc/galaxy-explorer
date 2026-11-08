import type { ViewObject } from '@ge/domain';

/** What every renderer in the registry receives: the view's objects it draws. */
export interface RendererProps {
  objects: readonly ViewObject[];
}
