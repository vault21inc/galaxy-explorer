import { AdaptiveDpr, CameraControls, PerformanceMonitor } from '@react-three/drei';
import { Canvas, type RootState } from '@react-three/fiber';
import { useState } from 'react';
import { useQuality, useQualityPreset } from '@/state/quality.ts';
import { attachCanvas, DIAGNOSTICS_ENABLED, loadTestHooks } from './diagnostics.ts';
import { FrameProbe } from './frame-probe.tsx';
import { Sky } from './sky.tsx';
import { ViewHost } from './view-host.tsx';
import {
  CAMERA_DRAGGING_SMOOTH_TIME_S,
  CAMERA_FAR,
  CAMERA_FOV_DEG,
  CAMERA_NEAR,
  CAMERA_SMOOTH_TIME_S,
  CAMERA_START_DISTANCE,
  MOVING_RESOLUTION_FACTOR,
  QUALITY_PRESETS,
  SPACE_COLOR,
} from './tuning.ts';

/**
 * The app's one 3D canvas (rendering.md §3). It stays mounted while routes change; the views
 * swap inside it (`<ViewHost>`).
 *
 * Why it's cheap when nothing moves:
 * - `frameloop="demand"`: React Three Fiber draws a frame only after `invalidate()` is called,
 *   instead of 60–120 times a second forever. The camera controls invalidate while they move,
 *   so frames render during a drag or zoom and stop when the camera settles.
 * - `dpr`: the pixel ratio is capped by the quality setting, at 1.5 on Medium (tuning.ts
 *   QUALITY_PRESETS).
 * - `regress` on the camera controls plus `<AdaptiveDpr>`: while the camera moves, the pixel
 *   ratio drops to MOVING_RESOLUTION_FACTOR of its resting value, and returns once it stops.
 * - `powerPreference: 'default'` keeps dual-GPU Macs on the integrated GPU.
 */
export function Stage() {
  const { dprRange } = useQualityPreset();
  // WebGL fixes antialiasing when the context is created, so read it once: a change in the
  // quality popover applies on the next load.
  const [antialias] = useState(() => QUALITY_PRESETS[useQuality.getState().level].antialias);
  return (
    <Canvas
      frameloop="demand"
      dpr={dprRange}
      gl={{ antialias, powerPreference: 'default', alpha: false }}
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
      />
      <Sky />
      {/* The current view, which sets its own camera limits (rendering.md §4–5). */}
      <ViewHost />
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
