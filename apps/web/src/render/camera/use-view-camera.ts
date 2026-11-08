import { CameraControlsImpl } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import { PerspectiveCamera } from 'three';

/**
 * A view's camera setup (rendering.md §5): clipping planes, how close and far the camera may
 * get, how far it may tilt, and where it starts. Units are the view's own (light-years in the
 * galaxy view).
 */
export interface ViewCameraConfig {
  /** Applied again only when this changes, such as another map: not on every render. */
  key: string;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  /** Tilt limits in radians from straight down onto the view (0) to straight up (π). */
  minPolarAngle: number;
  maxPolarAngle: number;
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}

/**
 * Applies a view's camera setup to the canvas's camera and `<CameraControls>`. M2-T4 adds the
 * dynamic near plane, keyboard and wheel handling on top.
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
    // `false`: jump there instead of easing in from wherever the last view left the camera.
    void controls.setLookAt(...config.position, ...config.target, false);
    invalidate();
    // Only `key` decides when to apply: the config object is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controlsReady, get]);
}
