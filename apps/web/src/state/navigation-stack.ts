import type { ViewLevel } from '@ge/domain';

/**
 * The navigation stack as pure data (rendering.md §4): which views are open, outermost first,
 * and the camera pose each was left at. The store (navigation.ts) holds one; the URL decides
 * which chain of views it should be, and `goTo` turns one into the other.
 */

export type Vec3 = [number, number, number];

/** Where the camera is and what it looks at, in the view's frame and unit. */
export interface CameraPose {
  position: Vec3;
  target: Vec3;
}

/** A view: its level and subject (the map for the galaxy view, else the object entered). */
export interface ViewTarget {
  level: ViewLevel;
  subjectId: string;
}

export interface ViewEntry extends ViewTarget {
  /** The pose the camera was in when a child view was entered from here, to return to it. */
  cameraPose: CameraPose | null;
}

/**
 * How one chain of views becomes another:
 * - `load`: nothing was open, or another map's views are: draw the new one straight away;
 * - `enter`: the new chain continues the old one, one or more views deeper;
 * - `exit`: the new chain is the start of the old one;
 * - `jump`: a different branch of the same map, such as another system from a link;
 * - `none`: the same chain.
 */
export type Move = 'load' | 'enter' | 'exit' | 'jump' | 'none';

export function sameTarget(a: ViewTarget, b: ViewTarget): boolean {
  return a.level === b.level && a.subjectId === b.subjectId;
}

/** How many views, from the outside, two chains share. */
export function sharedLength(a: readonly ViewTarget[], b: readonly ViewTarget[]): number {
  let length = 0;
  while (length < a.length && length < b.length) {
    const left = a[length];
    const right = b[length];
    if (!left || !right || !sameTarget(left, right)) break;
    length++;
  }
  return length;
}

export function moveBetween(from: readonly ViewTarget[], to: readonly ViewTarget[]): Move {
  const shared = sharedLength(from, to);
  // The root is the galaxy view of a map: not sharing it means another map, or a first load.
  if (shared === 0) return 'load';
  if (shared === from.length && shared === to.length) return 'none';
  if (shared === from.length) return 'enter';
  if (shared === to.length) return 'exit';
  return 'jump';
}

/**
 * The stack for a new chain of views. Views the chains share keep their saved poses; the rest
 * start without one. `pose` is where the camera is now: it's saved on the current view when
 * that view stays open below the new one (entering), so leaving again returns to it.
 */
export function goTo(
  stack: readonly ViewEntry[],
  chain: readonly ViewTarget[],
  pose: CameraPose | null,
): ViewEntry[] {
  const shared = sharedLength(stack, chain);
  const next = chain.map((target, index): ViewEntry => {
    const kept = index < shared ? stack[index] : undefined;
    return kept
      ? { ...kept }
      : { level: target.level, subjectId: target.subjectId, cameraPose: null };
  });
  const currentIndex = stack.length - 1;
  const current = next[currentIndex];
  if (pose && currentIndex < shared && currentIndex < next.length - 1 && current) {
    current.cameraPose = clonePose(pose);
  }
  return next;
}

/** One view deeper: `target` opens over the current view, which saves `pose`. */
export function enter(
  stack: readonly ViewEntry[],
  target: ViewTarget,
  pose: CameraPose | null,
): ViewEntry[] {
  return goTo(stack, [...stack, target], pose);
}

/** One view up, back to the parent and the pose it saved. The galaxy view has no parent. */
export function exit(stack: readonly ViewEntry[]): ViewEntry[] {
  return stack.length > 1 ? goTo(stack, stack.slice(0, -1), null) : [...stack];
}

function clonePose(pose: CameraPose): CameraPose {
  return { position: [...pose.position], target: [...pose.target] };
}
