import { create } from 'zustand';
import {
  goTo,
  moveBetween,
  type CameraPose,
  type Move,
  type ViewEntry,
  type ViewTarget,
} from './navigation-stack.ts';

export type { CameraPose, ViewEntry, ViewTarget } from './navigation-stack.ts';

/**
 * How the camera should arrive in the view now on top, read by the view's camera
 * (use-view-camera.ts) when it mounts:
 * - `move`: how the stack last changed;
 * - `from`: the subject of the view just left, which a parent view without a saved pose looks at;
 * - `ease`: start away from the resting pose and ease into it (false with reduced motion, and
 *   for loads and jumps).
 */
export interface Arrival {
  move: Move;
  from: string | null;
  ease: boolean;
}

interface NavigationState {
  /** The open views, outermost (the galaxy view) first; empty on pages without a canvas view. */
  stack: ViewEntry[];
  arrival: Arrival;
  /**
   * Makes the stack the given chain of views (navigation-stack.ts `goTo`). `pose` is the camera's
   * pose now, saved on the current view if it stays open below the new top.
   */
  goTo: (chain: readonly ViewTarget[], pose: CameraPose | null, ease: boolean) => void;
  /** No views: the canvas draws only the sky. */
  clear: () => void;
}

const STILL: Arrival = { move: 'load', from: null, ease: false };

/**
 * What the canvas shows (rendering.md §4). The URL is the source of truth for which views are
 * open (ux.md §9); the view sync (navigation/use-view-sync.ts) resolves it into a chain and the
 * transition controller (render/transition/) commits it here, behind the fade. `<ViewHost>` draws
 * the top entry.
 */
export const useNavigation = create<NavigationState>()((set, get) => ({
  stack: [],
  arrival: STILL,
  goTo: (chain, pose, ease) => {
    const { stack } = get();
    const move = moveBetween(stack, chain);
    if (move === 'none') return;
    set({
      stack: goTo(stack, chain, pose),
      arrival: {
        move,
        from: stack.at(-1)?.subjectId ?? null,
        ease: ease && (move === 'enter' || move === 'exit'),
      },
    });
  },
  clear: () => {
    set({ stack: [], arrival: STILL });
  },
}));

/** The view on top of the stack, or undefined when none is open. */
export function topView(state: { stack: readonly ViewEntry[] }): ViewEntry | undefined {
  return state.stack.at(-1);
}
