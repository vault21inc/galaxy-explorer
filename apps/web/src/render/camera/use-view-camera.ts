import { CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { Box3, PerspectiveCamera, Vector3 } from 'three';

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
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

/** The current view's setup, for "reset the view" (H or Home). */
let currentConfig: ViewCameraConfig | null = null;

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
    // `false`: jump there instead of easing in from wherever the last view left the camera.
    void controls.setLookAt(...config.position, ...config.target, false);

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
    return () => {
      controls.removeEventListener('update', followCamera);
      controls.setBoundary();
      if (currentConfig === config) currentConfig = null;
    };
    // Only `key` decides when to apply: the config object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controlsReady, get]);
}
