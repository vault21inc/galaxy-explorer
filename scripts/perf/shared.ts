import { resolve } from 'node:path';

/** Where `pnpm perf` keeps raw results, and the budgets it checks (rendering.md §2). */
export const RESULTS_DIR = resolve(import.meta.dirname, 'results');
export const REPO_ROOT = resolve(import.meta.dirname, '../..');

export const BUDGETS = {
  /** Median frame interval during interaction: 60 fps or better. */
  interactionMedianMs: 1_000 / 60,
  interactionP95Ms: 25,
  galaxyDrawCalls: 50,
  systemDrawCalls: 80,
  /** Entering or leaving a view, from the request to the faded-in new view, data cached. */
  transitionMs: 700,
  /** Geometries and textures after 20 view round trips, against before: within 5 %. */
  memoryDrift: 0.05,
  firstFrameMs: 2_000,
  idleFrames: 0,
  /** Updating the labels per frame with up to 200 shown (rendering.md §11). */
  labelUpdateP95Ms: 2,
  initialJsGzipKb: 600,
  /** Baking one planet surface at 2,048 × 1,024 on the GPU (rendering.md §9, M6-T2). */
  planetBakeMs: 50,
} as const;

export interface FrameStats {
  count: number;
  medianMs: number;
  p95Ms: number;
}

export interface RenderInfo {
  calls: number;
  triangles: number;
  points: number;
  geometries: number;
  textures: number;
  dpr: number;
}

export interface PhaseResult {
  frames: FrameStats;
  render: RenderInfo;
  labels?: FrameStats & { shown: number };
}

/** `view`: the reader's galaxy view. `edit`: edit mode, underlay shown, 100 selected (M3). */
export type PerfMode = 'view' | 'edit';

/** The mode `pnpm perf` was started in (perf.ts sets it). */
export const PERF_MODE: PerfMode = process.env.PERF_MODE === 'edit' ? 'edit' : 'view';

/** Objects selected in edit mode: the M3 acceptance's "100 objects selected". */
export const EDIT_SELECTION = 100;

/** The system view's part of a run (system-path.ts, M5-T5). */
export interface SystemResult {
  /** Orbiting and zooming inside the busy system. */
  interaction: FrameStats;
  maxDrawCalls: number;
  /** One 2,048 × 1,024 planet bake per preset timed, in ms (M6-T2). */
  planetBakeMs: Record<string, number>;
  /** Each entry and exit, in order; the first entry also loads the view's code and data. */
  transitions: { enterMs: number[]; exitMs: number[] };
  roundTrips: { count: number; before: RenderInfo; after: RenderInfo };
}

/** One browser's run, written by path.spec.ts and read by report.ts. */
export interface PerfResult {
  project: string;
  mode: PerfMode;
  /** Edit mode: what was on screen besides the galaxy view. */
  edit?: { selected: number; underlay: boolean };
  browserVersion: string;
  refreshHz: number;
  viewport: { width: number; height: number; deviceScaleFactor: number };
  firstFrameMs: number;
  idleFrames: number[];
  phases: Record<string, PhaseResult>;
  /** All camera movement together: orbit, pan and zoom. */
  interaction: FrameStats;
  maxDrawCalls: number;
  memory: { start: RenderInfo; end: RenderInfo };
  objects: number;
  /** View mode only (M5-T5). */
  system?: SystemResult;
}
