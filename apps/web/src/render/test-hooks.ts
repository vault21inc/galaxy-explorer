import { CameraControlsImpl } from '@react-three/drei';
import { Vector3 } from 'three';
import { canvasState, frameTimeline, renderInfo, type RenderInfo } from './diagnostics.ts';
import type { FrameStats } from './frame-timeline.ts';

/**
 * `window.__GE_TEST__`: lets end-to-end tests and `pnpm perf` read 3D state instead of guessing
 * from pixels (rendering.md §14). Later milestones add `level()`, `selectedIds()`,
 * `screenPositionOf()` and the rest of the interface in rendering.md.
 *
 * This module is loaded only when DIAGNOSTICS_ENABLED is true (see stage.tsx).
 */
export interface GeTestHooks {
  /** Frames rendered since the page loaded. */
  readonly frameCount: number;
  renderInfo(): RenderInfo | undefined;
  /** Frame-time statistics since the last `resetFrameStats()`. */
  frameStats(): FrameStats;
  resetFrameStats(): void;
  /** Where the camera is and what it looks at, in scene units. */
  cameraPose(): { position: [number, number, number]; target: [number, number, number] } | null;
}

declare global {
  interface Window {
    __GE_TEST__?: GeTestHooks;
  }
}

export function installTestHooks(): void {
  window.__GE_TEST__ = {
    get frameCount() {
      return frameTimeline.frameCount;
    },
    renderInfo,
    frameStats: () => frameTimeline.stats(),
    resetFrameStats: () => {
      frameTimeline.reset(performance.now());
    },
    cameraPose,
  };
}

function cameraPose() {
  const state = canvasState();
  if (!state) return null;
  const target = new Vector3();
  // `<CameraControls makeDefault>` registers itself as the canvas's default controls.
  if (state.controls instanceof CameraControlsImpl) {
    state.controls.getTarget(target);
  }
  const { x, y, z } = state.camera.position;
  return { position: [x, y, z] as [number, number, number], target: target.toArray() };
}
