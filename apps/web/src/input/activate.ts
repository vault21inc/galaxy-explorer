import { flyToShown } from '@/render/camera/fly-request.ts';
import { drawnObject } from '@/render/scene-index.ts';
import { viewNavigation } from '@/state/view-navigator.ts';

/**
 * What Enter does to the selection, and a double-click to a row of the List (ux.md §4, §10):
 * one object that opens a view (an explorable system or planet) is entered; anything else is
 * flown to, a group by its members (fly-request.ts, D-61).
 */
export function enterOrFlyTo(ids: readonly string[]): void {
  const only = ids.length === 1 ? drawnObject(ids[0] ?? '') : undefined;
  if (only?.opensView) {
    viewNavigation.enter(only.id);
    return;
  }
  flyToShown(ids);
}
