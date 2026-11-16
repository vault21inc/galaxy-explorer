import { drawnObjects } from '@/render/scene-index.ts';
import { useEditor } from '@/state/editor.ts';
import { topView, useNavigation } from '@/state/navigation.ts';
import { useSelection } from '@/state/selection.ts';
import type { TourNeed, TourStep } from './tour-types.ts';

/** The view level on top: the galaxy view when no system or orbit view is open. */
export function currentLevel(): 'galaxy' | 'system' | 'orbit' {
  return topView(useNavigation.getState())?.level ?? 'galaxy';
}

/**
 * Whether each need holds now, read from the stores and the scene index when a step comes up.
 * A step with an unmet need is skipped (tour-store.ts).
 */
export const NEEDS: Record<TourNeed, () => boolean> = {
  'can-edit': () => useEditor.getState().available,
  editing: () => useEditor.getState().editing,
  selection: () => useSelection.getState().selectedIds.length > 0,
  // Something drawn now opens a view of its own: a system in the galaxy view, a planet in a
  // system's.
  explorable: () => drawnObjects().some((object) => object.opensView === true),
  'in-galaxy': () => currentLevel() === 'galaxy',
  'in-system': () => currentLevel() === 'system',
  'in-orbit': () => currentLevel() === 'orbit',
  'away-from-galaxy': () => currentLevel() !== 'galaxy',
};

export function needsMet(step: TourStep): boolean {
  return (step.needs ?? []).every((need) => NEEDS[need]());
}
