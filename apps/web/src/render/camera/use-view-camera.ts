import { CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Box3, PerspectiveCamera, Vector3 } from 'three';
import { useNavigation, type CameraPose } from '@/state/navigation.ts';
import { arrivalStart } from '../transition/transition-plan.ts';
import { levelArrived } from '../transition/transition-controller.ts';

/**
 * A view's camera setup (rendering.md §5): clipping planes, how close and far the camera may
 * get, how far it may tilt, where its target may go, and where it starts. Units are the view's
 * own (light-years in the galaxy view).
 */
export interface ViewCameraConfig {
  /** Applied again only when this changes, such as another map: not on every render. */
  key: string;
  /** Clipping planes before the camera first moves. */
  near: number;
  far: number;
  /**
   * Clipping planes that follow the camera: near = distance × nearFraction (at least minNear),
   * far = distance + farBeyond, where distance is from the camera to its target.
   */
  clipping: { nearFraction: number; minNear: number; farBeyond: number };
  minDistance: number;
  maxDistance: number;
  /** Tilt limits in radians from straight down onto the view (0) to straight up (π). */
  minPolarAngle: number;
  maxPolarAngle: number;
  /** The box the camera's target must stay in. */
  targetBounds: { min: readonly [number, number, number]; max: readonly [number, number, number] };
  /** The view's default pose: where it starts, and where H or Home returns. */
  position: readonly [number, number, number];
  target: readonly [number, number, number];
  /** Flying to an object (F, double-click) frames at least this radius around it. */
  frameMinRadius: number;
  /**
   * A pose looking at one of the view's objects, or null if it isn't in the view. Used when the
   * reader leaves that object's view without a saved pose to return to (opened from a link).
   */
  focusPose?: (objectId: string) => CameraPose | null;
}

/** The current view's setup, for "reset the view" (H or Home). */
let currentConfig: ViewCameraConfig | null = null;

/** The current view's camera setup, or null when no view is open (zoom-gate.ts). */
export function viewCameraConfig(): ViewCameraConfig | null {
  return currentConfig;
}

/** The smallest radius flying to an object frames in the current view (fly-to.ts). */
export function frameMinRadius(): number {
  return currentConfig?.frameMinRadius ?? 0;
}

/** Eases the camera back to the current view's starting pose (ux.md §4, H or Home). */
export function resetViewCamera(controls: CameraControlsImpl): void {
  if (!currentConfig) return;
  void controls.setLookAt(...currentConfig.position, ...currentConfig.target, true);
}

/**
 * Applies a view's camera setup to the canvas's camera and `<CameraControls>`, and keeps the
 * clipping planes following the camera while the view is shown.
 */
export function useViewCamera(config: ViewCameraConfig | null): void {
  const get = useThree((state) => state.get);
  // Subscribed so the setup runs once `<CameraControls makeDefault>` has registered itself.
  const controlsReady = useThree((state) => state.controls !== null);
  const key = config?.key;

  useEffect(() => {
    // Read from the store at apply time: the camera and controls are three.js objects that
    // this hook changes, not React state.
    const { camera, controls, invalidate } = get();
    if (!config || !(controls instanceof CameraControlsImpl)) return;
    currentConfig = config;
    if (camera instanceof PerspectiveCamera) {
      camera.near = config.near;
      camera.far = config.far;
      // The projection matrix is cached; three.js recomputes it only when asked.
      camera.updateProjectionMatrix();
    }
    controls.minDistance = config.minDistance;
    controls.maxDistance = config.maxDistance;
    controls.minPolarAngle = config.minPolarAngle;
    controls.maxPolarAngle = config.maxPolarAngle;
    controls.setBoundary(
      new Box3(new Vector3(...config.targetBounds.min), new Vector3(...config.targetBounds.max)),
    );
    placeOnArrival(controls, config);

    // camera-controls fires 'update' on every frame the camera moves, just before the frame is
    // drawn, so the planes are always right for the frame being rendered.
    const { nearFraction, minNear, farBeyond } = config.clipping;
    const followCamera = () => {
      if (!(camera instanceof PerspectiveCamera)) return;
      const distance = controls.distance;
      const near = Math.max(distance * nearFraction, minNear);
      const far = distance + farBeyond;
      // Recomputing the projection matrix is cheap, but skip it while the camera only turns.
      if (
        Math.abs(near - camera.near) > camera.near * 0.01 ||
        Math.abs(far - camera.far) > camera.far * 0.01
      ) {
        camera.near = near;
        camera.far = far;
        camera.updateProjectionMatrix();
      }
    };
    controls.addEventListener('update', followCamera);
    followCamera();
    invalidate();
    levelArrived();
    return () => {
      controls.removeEventListener('update', followCamera);
      controls.setBoundary();
      if (currentConfig === config) currentConfig = null;
    };
    // Only `key` decides when to apply: the config object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controlsReady, get]);
}

/**
 * Where the camera goes when a view opens (rendering.md §4, steps 3 and "leaving"):
 * - its resting pose is the one saved when a child view was entered from here, so leaving
 *   returns to where the reader was; otherwise, after leaving a view opened from a link, a pose
 *   looking at the object just left; otherwise the view's default pose;
 * - entering or leaving with motion, it starts farther or nearer on the same line of sight and
 *   eases to the resting pose while the fade clears (transition-plan.ts `arrivalStart`).
 */
function placeOnArrival(controls: CameraControlsImpl, config: ViewCameraConfig): void {
  const { stack, arrival } = useNavigation.getState();
  const saved = stack.at(-1)?.cameraPose ?? null;
  const focus =
    !saved && arrival.move === 'exit' && arrival.from ? config.focusPose?.(arrival.from) : null;
  const rest: CameraPose = saved ??
    focus ?? { position: [...config.position], target: [...config.target] };
  const start = arrival.ease ? arrivalStart(arrival.move, rest) : rest;
  // `false`: jump there, instead of easing in from wherever the last view left the camera.
  void controls.setLookAt(...start.position, ...start.target, false);
  if (start !== rest) void controls.setLookAt(...rest.position, ...rest.target, true);
}
