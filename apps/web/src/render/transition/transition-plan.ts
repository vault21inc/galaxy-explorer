import type { CameraPose, Move } from '@/state/navigation-stack.ts';
import {
  VIEW_ENTER_START_FACTOR,
  VIEW_EXIT_START_FACTOR,
  VIEW_FADE_IN_MS,
  VIEW_FADE_OUT_MS,
  VIEW_FLY_MS,
  VIEW_REDUCED_FADE_MS,
} from '../tuning.ts';

/** The steps of one change of view (rendering.md §4), in milliseconds. */
export interface TransitionPlan {
  /** The camera flies toward the object entered, or away from the view left. */
  flyMs: number;
  /** The screen fades to black; the views swap at the end. */
  fadeOutMs: number;
  /** The screen fades back in while the new camera eases into place. */
  fadeInMs: number;
  /** Whether the new view's camera eases in from its arrival pose (arrivalStart below). */
  ease: boolean;
}

const INSTANT: TransitionPlan = { flyMs: 0, fadeOutMs: 0, fadeInMs: 0, ease: false };

/**
 * What a move between views looks like:
 * - entering or leaving: fly, fade, swap, ease in;
 * - a jump to another branch of the map (a link): a fade, with nothing to fly toward;
 * - `prefers-reduced-motion`: a single quick fade, no camera moves;
 * - the first view of a page, or another map: drawn straight away.
 */
export function transitionPlan(move: Move, reducedMotion: boolean): TransitionPlan {
  if (move === 'load' || move === 'none') return INSTANT;
  if (reducedMotion) {
    return {
      flyMs: 0,
      fadeOutMs: VIEW_REDUCED_FADE_MS,
      fadeInMs: VIEW_REDUCED_FADE_MS,
      ease: false,
    };
  }
  if (move === 'jump') {
    return { flyMs: 0, fadeOutMs: VIEW_FADE_OUT_MS, fadeInMs: VIEW_FADE_IN_MS, ease: false };
  }
  return { flyMs: VIEW_FLY_MS, fadeOutMs: VIEW_FADE_OUT_MS, fadeInMs: VIEW_FADE_IN_MS, ease: true };
}

/**
 * Where the new view's camera starts before easing to its resting pose: on the same line of
 * sight to the same target, only farther (entering: the view arrives from afar, continuing the
 * dive) or nearer (leaving: the camera pulls back out of the view just left). Scaling the
 * vector from target to camera changes the distance and keeps the viewing angle.
 */
export function arrivalStart(move: Move, rest: CameraPose): CameraPose {
  const factor =
    move === 'enter' ? VIEW_ENTER_START_FACTOR : move === 'exit' ? VIEW_EXIT_START_FACTOR : 1;
  const [tx, ty, tz] = rest.target;
  const [px, py, pz] = rest.position;
  return {
    position: [tx + (px - tx) * factor, ty + (py - ty) * factor, tz + (pz - tz) * factor],
    target: [tx, ty, tz],
  };
}
