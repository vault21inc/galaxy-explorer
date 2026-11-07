import type { RootState } from '@react-three/fiber';
import { FrameTimeline } from './frame-timeline.ts';

/**
 * Diagnostics shared by the performance HUD (`?perf=1`) and the test hooks (`window.__GE_TEST__`).
 * Both exist only in development and in end-to-end test builds (`VITE_TEST_HOOKS=1`); Vite
 * replaces this constant at build time, so production builds drop the code behind it.
 */
export const DIAGNOSTICS_ENABLED = import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1';

/**
 * Loads the test hooks module. The condition is written out in full, not as
 * DIAGNOSTICS_ENABLED, because the bundler only drops a dynamic import whose condition it can
 * see is false right here; otherwise production builds would still ship the chunk.
 */
export const loadTestHooks =
  import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === '1'
    ? () => import('./test-hooks.ts')
    : undefined;

/** Every rendered frame is recorded here by `<FrameProbe>`. */
export const frameTimeline = new FrameTimeline();

let getCanvasState: (() => RootState) | undefined;

/** Called once the canvas exists, so diagnostics outside it can read the renderer. */
export function attachCanvas(get: () => RootState): void {
  getCanvasState = get;
}

export interface RenderInfo {
  /** Draw calls in the last rendered frame (rendering.md §1, concept 4). */
  calls: number;
  /** Triangles in the last rendered frame; a point or line segment counts as its own kind. */
  triangles: number;
  points: number;
  /** Geometries and textures currently on the GPU. Steady numbers mean nothing leaks. */
  geometries: number;
  textures: number;
  /** The canvas's current device pixel ratio. */
  dpr: number;
}

/**
 * Numbers from three.js's renderer. `gl.info.render` is reset at the start of each frame, so
 * between frames it describes the last frame drawn.
 */
export function renderInfo(): RenderInfo | undefined {
  const state = getCanvasState?.();
  if (!state) return undefined;
  const { render, memory } = state.gl.info;
  return {
    calls: render.calls,
    triangles: render.triangles,
    points: render.points,
    geometries: memory.geometries,
    textures: memory.textures,
    dpr: state.viewport.dpr,
  };
}

/** The canvas state, for the test hooks. */
export function canvasState(): RootState | undefined {
  return getCanvasState?.();
}
