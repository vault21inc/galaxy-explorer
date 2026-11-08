import { CameraControlsImpl } from '@react-three/drei';
import { Vector3 } from 'three';
import { detectPlatform, type Platform } from '@/input/platform.ts';
import { hoverStore } from '@/state/hover.ts';
import { useSelection } from '@/state/selection.ts';
import { flyTo } from './camera/fly-to.ts';
import { visibleLabels } from './labels/label-driver.tsx';
import { labelTimeline } from './labels/label-stats.ts';
import { clampedRadiusPx } from './bodies/body-scale.ts';
import { canvasState, frameTimeline, renderInfo, type RenderInfo } from './diagnostics.ts';
import type { FrameStats } from './frame-timeline.ts';
import { drawnObject, type DrawnObject } from './scene-index.ts';
import { worldPerPxAt1 } from './screen-scale.ts';

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
  /**
   * Where an object's center is on the page, in CSS pixels (for real mouse events), or null if
   * it isn't drawn or is off screen or behind the camera.
   */
  screenPositionOf(id: string): { x: number; y: number } | null;
  /** The object's on-screen radius in CSS pixels, with its renderer's clamp applied. */
  screenRadiusOf(id: string): number | null;
  /** How an object is drawn: its renderer, state (normal, redacted, draft) and color. */
  drawnObject(id: string): DrawnObject | null;
  /** The keyboard convention the app detected: Cmd is primary on 'mac', Ctrl elsewhere. */
  platform(): Platform;
  /** The selection, in order. */
  selectedIds(): string[];
  /** The object under the pointer, or null. */
  hoveredId(): string | null;
  /** Flies the camera to an object, as a double-click does; resolves when it has settled. */
  flyTo(id: string): Promise<void>;
  /** The labels on screen after the last frame. */
  visibleLabels(): { id: string; text: string }[];
  /** Label-update durations since the last reset (budget: 2 ms per frame, rendering.md §11). */
  labelStats(): { count: number; medianMs: number; p95Ms: number };
  resetLabelStats(): void;
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
    screenPositionOf,
    screenRadiusOf,
    drawnObject: (id) => drawnObject(id) ?? null,
    platform: () => detectPlatform(),
    selectedIds: () => [...useSelection.getState().selectedIds],
    hoveredId: () => hoverStore.getState().hoveredId,
    visibleLabels: () => visibleLabels().map(({ id, text }) => ({ id, text })),
    labelStats: () => labelTimeline.stats(),
    resetLabelStats: () => {
      labelTimeline.reset();
    },
    flyTo: async (id) => {
      const object = drawnObject(id);
      const controls = canvasState()?.controls;
      if (object && controls instanceof CameraControlsImpl) await flyTo(controls, [object]);
    },
  };
}

// Scratch vectors: the hooks may be called in tight loops by tests.
const scratch = new Vector3();

function screenPositionOf(id: string): { x: number; y: number } | null {
  const state = canvasState();
  const object = drawnObject(id);
  if (!state || !object) return null;
  // project() maps a world point to normalized device coordinates: -1 to 1 across the canvas,
  // and z from -1 (near plane) to 1 (far plane). Outside those ranges it isn't visible.
  scratch.set(...object.center).project(state.camera);
  if (Math.abs(scratch.x) > 1 || Math.abs(scratch.y) > 1 || Math.abs(scratch.z) > 1) return null;
  const rect = state.gl.domElement.getBoundingClientRect();
  return {
    x: rect.left + ((scratch.x + 1) / 2) * rect.width,
    // Device coordinates point up; page coordinates point down.
    y: rect.top + ((1 - scratch.y) / 2) * rect.height,
  };
}

function screenRadiusOf(id: string): number | null {
  const state = canvasState();
  const object = drawnObject(id);
  if (!state || !object) return null;
  // Depth: the distance in front of the camera, as the shaders compute it (view-space -z).
  scratch.set(...object.center).applyMatrix4(state.camera.matrixWorldInverse);
  return clampedRadiusPx(
    object.radius,
    -scratch.z,
    worldPerPxAt1(state.camera, state.size.height),
    object.minRadiusPx,
    object.maxRadiusPx,
  );
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
