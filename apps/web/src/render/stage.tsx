import { AdaptiveDpr, CameraControls } from '@react-three/drei';
import { Canvas, type RootState } from '@react-three/fiber';
import { useState } from 'react';
import { InputBindings } from '@/input/input-bindings.tsx';
import { useCapture } from '@/state/capture.ts';
import { useEditor } from '@/state/editor.ts';
import { useQuality, useQualityPreset } from '@/state/quality.ts';
import { CaptureMoveDriver } from './capture-move-driver.tsx';
import { CaptureRecorderRig } from './capture/capture-recorder-rig.tsx';
import { attachCanvas, DIAGNOSTICS_ENABLED, loadTestHooks } from './diagnostics.ts';
import { FrameProbe } from './frame-probe.tsx';
import { LabelDriver } from './labels/label-driver.tsx';
import { TourAnchorDriver } from './tour-anchor-driver.tsx';
import { QualityGuard } from './quality-guard.tsx';
import { Sky } from './sky.tsx';
import { TransitionRig } from './transition/transition-rig.tsx';
import { ViewHost } from './view-host.tsx';
import {
  CAMERA_DRAGGING_SMOOTH_TIME_S,
  CAPTURE_MAX_DPR,
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
  const editing = useEditor((state) => state.editing);
  // Capture mode (D-55): a sharper canvas that stays sharp while the camera moves.
  const capture = useCapture((state) => state.aspect !== null);
  // Recording a clip (D-56): the clip's own pixel ratio, and frames drawn only by the recorder.
  const recordDpr = useCapture((state) => state.recordDpr);
  // WebGL fixes antialiasing when the context is created, so read it once: a change in the
  // quality popover applies on the next load.
  const [antialias] = useState(() => QUALITY_PRESETS[useQuality.getState().level].antialias);
  return (
    <Canvas
      frameloop={recordDpr === null ? 'demand' : 'never'}
      dpr={recordDpr ?? (capture ? [1, Math.max(dprRange[1], CAPTURE_MAX_DPR)] : dprRange)}
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
      {/* Steps the quality down when frames stay slow (rendering.md §13). */}
      <QualityGuard />
      <AdaptiveDpr />
      <CameraControls
        makeDefault
        regress={!capture}
        smoothTime={CAMERA_SMOOTH_TIME_S}
        draggingSmoothTime={CAMERA_DRAGGING_SMOOTH_TIME_S}
        dollyToCursor
        infinityDolly={false}
      />
      {/* Assigns the camera controls' buttons per press from the bindings table (ux.md §3). */}
      <InputBindings mode={editing ? 'edit' : 'view'} />
      {/* Lets the transition between views fly the camera (rendering.md §4). */}
      <TransitionRig />
      {/* Plays capture mode's scripted camera move (D-55), and lets it be recorded (D-56). */}
      <CaptureMoveDriver />
      <CaptureRecorderRig />
      <Sky />
      {/* The current view, which sets its own camera limits (rendering.md §4–5). */}
      <ViewHost />
      {/* Places the DOM labels (labels/label-layer.tsx) after every rendered frame. */}
      <LabelDriver />
      {/* Tells the guided tours where a step's object is, after frames drawn anyway (M8-T10). */}
      <TourAnchorDriver />
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
