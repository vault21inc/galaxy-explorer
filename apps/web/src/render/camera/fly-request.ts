import { useNavigation } from '@/state/navigation.ts';
import { drawnGroup, onGroupsChange } from '../groups/group-index.ts';
import { drawnObject, onDrawnChange } from '../scene-index.ts';
import { onLevelArrived, viewControls } from '../transition/transition-controller.ts';
import { FLY_REQUEST_WAIT_MS } from '../tuning.ts';
import { flyTo, type FrameTarget } from './fly-to.ts';

/**
 * Flying to entries by id, from anywhere (D-61): the F and Enter keys, a double-click on a
 * group's label, a search result, Enter on a row of the List.
 */

/**
 * What flying to these entries frames: each one that's drawn, and for a group, which isn't an
 * object, what it holds: its members, own and nested, as its outline has them (so a membership
 * hidden as a spoiler isn't given away by the frame), or a ring's whole disc (D-53). A group
 * hidden by Layers has nothing drawn and frames nothing.
 */
export function frameTargets(ids: readonly string[]): FrameTarget[] {
  return ids.flatMap((id): FrameTarget[] => {
    const object = drawnObject(id);
    if (object) return [object];
    const group = drawnGroup(id);
    if (!group) return [];
    if (group.ring) {
      const [x, z] = group.ring.center;
      // A shape marks it as an area: as large as it's drawn (fly-to.ts `frameSphere`).
      return [{ id, center: [x, group.y, z], radius: group.ring.outerRadiusLy, shape: 'ring' }];
    }
    return group.memberIds.flatMap((memberId) => drawnObject(memberId) ?? []);
  });
}

/** Flies to what's drawn of these entries now; false when none of it is, or no view is open. */
export function flyToShown(ids: readonly string[]): boolean {
  const controls = viewControls();
  const targets = frameTargets(ids);
  if (!controls || targets.length === 0) return false;
  void flyTo(controls, targets);
  return true;
}

let waiting: { id: string; untilArrival: boolean; expiresAtMs: number } | null = null;

/**
 * Flies to a galaxy-view entry (an object, group or route of map `mapId`) once it's on screen:
 * at once if that map's galaxy view is the one open, otherwise when it has opened and placed
 * its camera (`onLevelArrived`), so the view's own arrival doesn't undo the fly. The reader chose
 * the entry by name (a search result), from any view of any map.
 */
export function flyToWhenShown(id: string, mapId: string): void {
  const top = useNavigation.getState().stack.at(-1);
  // The galaxy view's subject is its map (navigation-stack.ts).
  const here = top?.level === 'galaxy' && top.subjectId === mapId;
  waiting = { id, untilArrival: !here, expiresAtMs: performance.now() + FLY_REQUEST_WAIT_MS };
  tryWaiting();
}

function tryWaiting(): void {
  if (!waiting) return;
  if (performance.now() > waiting.expiresAtMs) {
    waiting = null;
    return;
  }
  if (waiting.untilArrival) return;
  if (useNavigation.getState().stack.at(-1)?.level !== 'galaxy') return;
  if (flyToShown([waiting.id])) waiting = null;
}

// A view has placed its camera: a fly waiting for it may go. In a task of its own, after the
// effect that placed the camera has wholly run: in development React runs each new effect
// twice (StrictMode), and the second placing would undo a fly started between the two.
onLevelArrived(() => {
  if (!waiting) return;
  setTimeout(() => {
    if (waiting) waiting.untilArrival = false;
    tryWaiting();
  }, 0);
});
// The target may be drawn a moment after the view arrives (its data still loading).
onDrawnChange(tryWaiting);
onGroupsChange(tryWaiting);
