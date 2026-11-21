import type { ViewLevel, ViewObject, ViewPayload } from '@ge/domain';
import { useViewPayload } from '@/api/hooks.ts';
import { queryKeys } from '@/api/keys.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { useEditor } from '@/state/editor.ts';
import { topView, useNavigation } from '@/state/navigation.ts';
import { levels, objectsIn, type LevelEdit } from './registry.ts';

/**
 * The view the editor works in (M5-T4): the one on top of the navigation stack, with its edit
 * settings from the levels registry, its cached payload and its objects. Every tool reads this
 * instead of assuming the galaxy view, so the same tools work inside a system.
 */
export interface EditView {
  mapId: string;
  level: ViewLevel;
  /** The map for the galaxy view, else the object whose view this is. */
  subjectId: string;
  edit: LevelEdit;
  /** The TanStack Query key of the view's payload, for optimistic updates. */
  viewKey: ReturnType<typeof queryKeys.view>;
  /** As the view draws it (levels/registry.ts `inView`): the orbit view's moons tilted. */
  payload: ViewPayload<ViewLevel> | undefined;
  objects: readonly ViewObject[];
  /**
   * The work plane's tilt in radians: the orbit view's planet's axial tilt (D-60), else 0.
   * Points on it are turned back into the planet's frame before they're saved
   * (orbits/equator-frame.ts `viewToEquator`).
   */
  tiltRad: number;
}

/** The view being edited, or null where there's none, or it can't be edited (the orbit view). */
export function useEditView(): EditView | null {
  const top = useNavigation(topView);
  const mapId = useNavigation((state) => state.stack[0]?.subjectId);
  const readOptions = useReadOptions();
  const level = levels[top?.level ?? 'galaxy'];
  const view = useViewPayload(top?.level ?? 'galaxy', top?.subjectId, readOptions, level.inView);
  if (!top || mapId === undefined) return null;
  const edit = level.edit;
  if (!edit) return null;
  return {
    mapId,
    level: top.level,
    subjectId: top.subjectId,
    edit,
    viewKey: queryKeys.view(top.level, top.subjectId, readOptions),
    payload: view.data,
    objects: view.data ? objectsIn(view.data) : [],
    tiltRad: view.data ? (level.workPlaneTiltRad?.(view.data) ?? 0) : 0,
  };
}

/** The snapping grid in a view: the reader's own spacing there, or the view's default. */
export function gridSizeIn(level: ViewLevel): number {
  return useEditor.getState().gridSizes[level] ?? levels[level].edit?.gridSize ?? 1;
}
