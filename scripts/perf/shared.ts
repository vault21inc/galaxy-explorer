import { resolve } from 'node:path';

/** Where `pnpm perf` keeps raw results, and the budgets it checks (rendering.md §2). */
export const RESULTS_DIR = resolve(import.meta.dirname, 'results');
export const REPO_ROOT = resolve(import.meta.dirname, '../..');

export const BUDGETS = {
  /** Median frame interval during interaction: 60 fps or better. */
  interactionMedianMs: 1_000 / 60,
  interactionP95Ms: 25,
  galaxyDrawCalls: 50,
  firstFrameMs: 2_000,
  idleFrames: 0,
  /** Updating the labels per frame with up to 200 shown (rendering.md §11). */
  labelUpdateP95Ms: 2,
  initialJsGzipKb: 600,
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

/** One browser's run, written by path.spec.ts and read by report.ts. */
export interface PerfResult {
  project: string;
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
}
