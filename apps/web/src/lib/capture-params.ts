import type { CameraPose } from '@/state/navigation-stack.ts';
import {
  CAPTURE_MOVE_SECONDS,
  CAPTURE_RECORD_FPS,
  CAPTURE_RECORD_FPS_CHOICES,
  CAPTURE_RECORD_WIDTH_PX,
  CAPTURE_MOVE_SECONDS_STEPS,
  CAPTURE_SPIN_LIMIT_DEG,
} from '@/render/tuning.ts';
import { formatCameraParam, parseCameraParam } from './camera-param.ts';

/**
 * Capture mode's address (D-55, ux.md §14): everything about a shot is in the query, so a shot
 * can be bookmarked, written down and opened again exactly.
 *
 * - `capture=9x16`: capture mode, framed to that aspect ratio (CAPTURE_ASPECTS);
 * - `cam=…`: where the view opens, and where the scripted move starts (D-52);
 * - `to=…`: where the move ends, in the same six numbers as `cam`;
 * - `secs=10`: how long the move takes, in seconds;
 * - `spin=90`: extra degrees to turn around the target on the way (positive is
 *   counterclockwise seen from above), for a turntable shot with no `to`, or a turn on the way;
 * - `fps=30`: frames a second of a recorded clip (D-56), one of CAPTURE_RECORD_FPS_CHOICES.
 */
export const CAPTURE_PARAM = 'capture';
export const MOVE_END_PARAM = 'to';
export const MOVE_SECONDS_PARAM = 'secs';
export const MOVE_SPIN_PARAM = 'spin';
export const RECORD_FPS_PARAM = 'fps';

/** The params that belong to a shot, and go when capture mode is left. `cam` stays (D-52). */
export const SHOT_PARAMS = [
  CAPTURE_PARAM,
  MOVE_END_PARAM,
  MOVE_SECONDS_PARAM,
  MOVE_SPIN_PARAM,
  RECORD_FPS_PARAM,
];

/**
 * The frames on offer, as width:height. Instagram shows Reels and Stories at 9:16 and feed posts
 * at 4:5 or 3:4 (its profile grid's shape since 2025). A new one is a row here.
 */
export const CAPTURE_ASPECTS = [
  { id: '9x16', width: 9, height: 16, use: 'Reels and Stories' },
  { id: '4x5', width: 4, height: 5, use: 'feed posts' },
  { id: '3x4', width: 3, height: 4, use: 'feed posts' },
] as const;

export type CaptureAspect = (typeof CAPTURE_ASPECTS)[number];
export type CaptureAspectId = CaptureAspect['id'];

/** "9:16". */
export function aspectLabel(aspect: CaptureAspect): string {
  return `${String(aspect.width)}:${String(aspect.height)}`;
}

export function captureAspect(id: string | null): CaptureAspect | null {
  return CAPTURE_ASPECTS.find((aspect) => aspect.id === id) ?? null;
}

/** A shot as the address describes it. */
export interface CaptureShot {
  aspect: CaptureAspect | null;
  /** Where the move starts: the view's `cam`, or null to start from wherever the camera is. */
  start: CameraPose | null;
  end: CameraPose | null;
  durationS: number;
  spinDeg: number;
  /** A recorded clip's frames a second. */
  fps: number;
}

export function parseCaptureShot(params: URLSearchParams): CaptureShot {
  return {
    aspect: captureAspect(params.get(CAPTURE_PARAM)),
    start: parseCameraParam(params.get('cam')),
    end: parseCameraParam(params.get(MOVE_END_PARAM)),
    durationS: boundedNumber(
      params.get(MOVE_SECONDS_PARAM),
      CAPTURE_MOVE_SECONDS_STEPS[0],
      CAPTURE_MOVE_SECONDS_STEPS.at(-1) ?? CAPTURE_MOVE_SECONDS,
      CAPTURE_MOVE_SECONDS,
    ),
    spinDeg: boundedNumber(
      params.get(MOVE_SPIN_PARAM),
      -CAPTURE_SPIN_LIMIT_DEG,
      CAPTURE_SPIN_LIMIT_DEG,
      0,
    ),
    fps: recordFps(params.get(RECORD_FPS_PARAM)),
  };
}

function recordFps(value: string | null): number {
  const fps = Number(value);
  return (CAPTURE_RECORD_FPS_CHOICES as readonly number[]).includes(fps) ? fps : CAPTURE_RECORD_FPS;
}

/** A number from the address, kept within [min, max]; `fallback` when it isn't one. */
function boundedNumber(value: string | null, min: number, max: number, fallback: number): number {
  if (value === null || value.trim() === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

/**
 * `params` with capture mode on at `aspect`, or off (null): leaving drops the shot's params but
 * keeps the rest (the selection, `cam`, a share link's key). Returns a new object.
 */
export function withCapture(
  params: URLSearchParams,
  aspect: CaptureAspectId | null,
): URLSearchParams {
  const next = new URLSearchParams(params);
  if (aspect === null) for (const name of SHOT_PARAMS) next.delete(name);
  else next.set(CAPTURE_PARAM, aspect);
  return next;
}

/** `params` with a camera pose written to `name` (`cam` for the start, `to` for the end). */
export function withPose(
  params: URLSearchParams,
  name: 'cam' | typeof MOVE_END_PARAM,
  pose: CameraPose,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(name, formatCameraParam(pose));
  return next;
}

/**
 * The next move length in CAPTURE_MOVE_SECONDS_STEPS from `current`, one step longer (+1) or
 * shorter (−1), staying at the ends.
 */
export function stepDuration(current: number, direction: 1 | -1): number {
  const steps = CAPTURE_MOVE_SECONDS_STEPS;
  if (direction === 1) return steps.find((step) => step > current) ?? steps.at(-1) ?? current;
  return steps.findLast((step) => step < current) ?? steps[0];
}

/** Where the framed canvas sits in a container, in whole CSS pixels. */
export interface CaptureFrame {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * The largest box of the aspect's shape that fits the container, centred: the rest is black
 * bars. Whole pixels, in whole steps of the shape (9 by 16 px for 9:16), so the box is exactly
 * that shape: a clip recorded from it (render/capture/record-move.ts) isn't stretched by a rounding pixel.
 */
export function captureFrame(
  containerWidth: number,
  containerHeight: number,
  aspect: Pick<CaptureAspect, 'width' | 'height'>,
): CaptureFrame {
  const fit = Math.min(containerWidth / aspect.width, containerHeight / aspect.height);
  const steps = Math.max(1, Math.floor(fit));
  const width = steps * aspect.width;
  const height = steps * aspect.height;
  return {
    left: Math.floor((containerWidth - width) / 2),
    top: Math.floor((containerHeight - height) / 2),
    width,
    height,
  };
}

/**
 * The size of a recorded clip (D-56): CAPTURE_RECORD_WIDTH_PX wide, and the aspect's height,
 * so 1080 × 1920 for 9:16, 1080 × 1350 for 4:5 and 1080 × 1440 for 3:4: Instagram's sizes.
 */
export function recordingSize(aspect: Pick<CaptureAspect, 'width' | 'height'>): {
  width: number;
  height: number;
} {
  const width = CAPTURE_RECORD_WIDTH_PX;
  // Even, as H.264 needs.
  const height = Math.round((width * aspect.height) / aspect.width / 2) * 2;
  return { width, height };
}
