import type { CameraControlsImpl } from '@react-three/drei';
import { Vector3 } from 'three';
import { useNavigation } from '@/state/navigation.ts';
import {
  moveBetween,
  type CameraPose,
  type Move,
  type ViewTarget,
} from '@/state/navigation-stack.ts';
import { drawnObject } from '../scene-index.ts';
import { VIEW_FLY_END_RADII, VIEW_FLY_OUT_FACTOR, VIEW_READY_TIMEOUT_MS } from '../tuning.ts';
import { transitionPlan } from './transition-plan.ts';
import { useTransition } from './transition-store.ts';

/**
 * The transition controller (rendering.md §4): turns "the URL now asks for this chain of views"
 * into fly, fade, swap and ease. One change runs at a time. If the URL changes again meanwhile
 * (Back pressed twice), the swap commits the latest chain, and another change follows if that
 * still isn't what's shown.
 *
 * It runs outside React: it awaits timers and the new view's readiness, and drives the overlay
 * and the navigation store, which React draws.
 */

let controls: CameraControlsImpl | null = null;
/** The chain the URL asks for, or null when no view should be open. */
let wanted: ViewTarget[] | null = null;
let running: Promise<void> | null = null;
let arrived: (() => void) | null = null;
let pendingResolves = 0;
/** When the latest animated change of view started (`performance.now()`), for the momentum guard. */
let startedAtMs = Number.NEGATIVE_INFINITY;
/** How many animated changes of view have started since the page loaded (for test hooks). */
let startedCount = 0;
/** An address change was asked for and React Router hasn't applied it yet. */
let navigationPending = false;

/** Called by `<TransitionRig>` inside the canvas once the camera controls exist. */
export function attachTransitionControls(next: CameraControlsImpl | null): void {
  controls = next;
}

/** The camera controls, for moving the camera from outside the canvas (fly-request.ts). */
export function viewControls(): CameraControlsImpl | null {
  return controls;
}

/** Asks for a chain of views; resolves when what's shown matches what was last asked for. */
export function requestView(chain: readonly ViewTarget[]): Promise<void> {
  wanted = chain.map(({ level, subjectId }) => ({ level, subjectId }));
  running ??= run().finally(() => {
    running = null;
  });
  return running;
}

/** No view: leaving the map pages. */
export function clearView(): void {
  wanted = null;
  useNavigation.getState().clear();
}

/** The new view's camera is in place (use-view-camera.ts): the fade can clear. */
export function levelArrived(): void {
  arrived?.();
  arrived = null;
  for (const listener of arrivalListeners) listener();
}

const arrivalListeners = new Set<() => void>();

/**
 * Calls `listener` each time a view has placed its camera, after its own arrival pose is set:
 * the moment a camera move meant for the new view can start (fly-request.ts). Returns the
 * unsubscribe.
 */
export function onLevelArrived(listener: () => void): () => void {
  arrivalListeners.add(listener);
  return () => {
    arrivalListeners.delete(listener);
  };
}

/** The view sync (use-view-sync.ts) is resolving a URL into a chain of views. */
export function trackResolve<T>(promise: Promise<T>): Promise<T> {
  pendingResolves++;
  return promise.finally(() => {
    pendingResolves--;
  });
}

/** The navigator is about to change the address (view-navigator.ts, use-view-sync.ts). */
export function expectNavigation(): void {
  navigationPending = true;
}

/** The address changed, and the view sync has started resolving it if it needs to. */
export function navigationApplied(): void {
  navigationPending = false;
}

/** Nothing is changing: no address pending or being resolved, no transition running. */
export function viewSettled(): boolean {
  return !navigationPending && running === null && pendingResolves === 0;
}

/** When the latest animated change of view started, and whether one is running now. */
export function transitionTiming(): { startedAtMs: number; active: boolean } {
  return { startedAtMs, active: useTransition.getState().active };
}

/** Animated changes of view started since the page loaded. */
export function transitionsStarted(): number {
  return startedCount;
}

/** The camera's pose now, in the current view's frame. */
export function currentCameraPose(): CameraPose | null {
  if (!controls) return null;
  const position = controls.getPosition(new Vector3());
  const target = controls.getTarget(new Vector3());
  return { position: [position.x, position.y, position.z], target: [target.x, target.y, target.z] };
}

async function run(): Promise<void> {
  try {
    for (;;) {
      const target = wanted;
      const navigation = useNavigation.getState();
      if (!target) return;
      const move = moveBetween(navigation.stack, target);
      if (move === 'none') return;
      const plan = transitionPlan(move, prefersReducedMotion());
      // Saved before the fly, so leaving returns the camera to where the reader was.
      const pose = currentCameraPose();
      if (plan.fadeOutMs === 0) {
        navigation.goTo(target, pose, false);
        continue;
      }
      useTransition.setState({ active: true });
      startedAtMs = performance.now();
      startedCount++;
      if (plan.flyMs > 0) {
        flyAway(move, navigation.stack.length, target);
        await sleep(plan.flyMs);
      }
      useTransition.setState({ opacity: 1, fadeMs: plan.fadeOutMs });
      await sleep(plan.fadeOutMs);
      // Behind the black: swap to whatever the URL asks for now.
      // Null when the reader left the map pages meanwhile: the store was already cleared.
      const latest = wanted;
      if (!latest) return;
      const swaps = moveBetween(useNavigation.getState().stack, latest) !== 'none';
      const ready = swaps ? untilArrived(VIEW_READY_TIMEOUT_MS) : Promise.resolve();
      useNavigation.getState().goTo(latest, pose, plan.ease);
      await ready;
      useTransition.setState({ opacity: 0, fadeMs: plan.fadeInMs });
      await sleep(plan.fadeInMs);
    }
  } finally {
    useTransition.setState({ active: false, opacity: 0 });
  }
}

/**
 * The fly before the fade (rendering.md §4, step 1). Entering, the camera dives toward the
 * object being entered, keeping its angle of view, and stops a few of the object's radii from
 * it. Leaving, it pulls straight back. camera-controls animates either with its own smoothing;
 * the fade starts after VIEW_FLY_MS whether or not the camera has settled.
 */
function flyAway(move: Move, depth: number, target: readonly ViewTarget[]): void {
  if (!controls) return;
  if (move === 'exit') {
    // Zooming out to leave stopped the camera at the view's farthest distance: allow more.
    const distance = controls.distance * VIEW_FLY_OUT_FACTOR;
    controls.maxDistance = Math.max(controls.maxDistance, distance);
    void controls.dollyTo(distance, true);
    return;
  }
  // The first view opened beyond the current one, which is drawn in the current view.
  const entered = target[depth];
  const object = entered ? drawnObject(entered.subjectId) : undefined;
  if (!object) return;
  const center = new Vector3(...object.center);
  // From the object toward the camera: the line the camera dives along.
  const direction = controls.getPosition(new Vector3()).sub(center).normalize();
  const distance = object.radius * VIEW_FLY_END_RADII;
  // Zooming in to enter stopped the camera at the enter distance (zoom-gate.ts): let it closer.
  controls.minDistance = Math.min(controls.minDistance, distance);
  const end = center.clone().addScaledVector(direction, distance);
  void controls.setLookAt(end.x, end.y, end.z, center.x, center.y, center.z, true);
}

function untilArrived(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      arrived = null;
      resolve();
    }, timeoutMs);
    arrived = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The reader's system setting (ux.md §10): a single quick fade instead of camera moves. */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
