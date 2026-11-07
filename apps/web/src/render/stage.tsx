import { AdaptiveDpr, CameraControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, type RootState } from '@react-three/fiber';
import { attachCanvas, DIAGNOSTICS_ENABLED, loadTestHooks } from './diagnostics.ts';
import { FrameProbe } from './frame-probe.tsx';
import { PlaceholderSky } from './placeholder-sky.tsx';
import {
  ANTIALIAS,
  CAMERA_DRAGGING_SMOOTH_TIME_S,
  CAMERA_FAR,
  CAMERA_FOV_DEG,
  CAMERA_MAX_DISTANCE,
  CAMERA_MIN_DISTANCE,
  CAMERA_NEAR,
  CAMERA_SMOOTH_TIME_S,
  CAMERA_START_DISTANCE,
  DPR_RANGE,
  MOVING_RESOLUTION_FACTOR,
  SPACE_COLOR,
} from './tuning.ts';

/**
 * The app's one 3D canvas (rendering.md §3). It stays mounted while routes change; the views
 * (M2 on) swap inside it.
 *
 * Why it's cheap when nothing moves:
 * - `frameloop="demand"`: React Three Fiber draws a frame only after `invalidate()` is called,
 *   instead of 60–120 times a second forever. The camera controls invalidate while they move,
 *   so frames render during a drag or zoom and stop when the camera settles.
 * - `dpr`: the pixel ratio is capped at 1.5 (tuning.ts DPR_RANGE).
 * - `regress` on the camera controls plus `<AdaptiveDpr>`: while the camera moves, the pixel
 *   ratio drops to MOVING_RESOLUTION_FACTOR of its resting value, and returns once it stops.
 * - `powerPreference: 'default'` keeps dual-GPU Macs on the integrated GPU.
 */
export function Stage() {
  return (
    <Canvas
      frameloop="demand"
      dpr={DPR_RANGE}
      gl={{ antialias: ANTIALIAS, powerPreference: 'default', alpha: false }}
      camera={{
        fov: CAMERA_FOV_DEG,
        near: CAMERA_NEAR,
        far: CAMERA_FAR,
        position: [0, 0, CAMERA_START_DISTANCE],
      }}
      performance={{ min: MOVING_RESOLUTION_FACTOR }}
      onCreated={onCreated}
    >
      {/* Watches the frame rate while frames render. M2 connects `onDecline` to the quality
          setting, stepping down one level when it stays low (rendering.md §13). */}
      <PerformanceMonitor />
      <AdaptiveDpr />
      <CameraControls
        makeDefault
        regress
        smoothTime={CAMERA_SMOOTH_TIME_S}
        draggingSmoothTime={CAMERA_DRAGGING_SMOOTH_TIME_S}
        dollyToCursor
        infinityDolly={false}
        minDistance={CAMERA_MIN_DISTANCE}
        maxDistance={CAMERA_MAX_DISTANCE}
      />
      <PlaceholderSky />
      {DIAGNOSTICS_ENABLED && <FrameProbe />}
    </Canvas>
  );
}

function onCreated({ gl, get }: RootState): void {
  gl.setClearColor(SPACE_COLOR);
  if (DIAGNOSTICS_ENABLED) attachCanvas(get);
  // Undefined in production builds, where the test hooks aren't shipped at all.
  void loadTestHooks?.().then(({ installTestHooks }) => {
    installTestHooks();
  });
}
