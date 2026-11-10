import type { ViewLevel } from '@ge/domain';
import {
  DISTANCE_LIMIT_SLACK,
  ENTER_DISTANCE_RADII,
  MOMENTUM_GUARD_MS,
  PUSH_RESET_MS,
  STOP_DISTANCE_RADII,
  WHEEL_STREAM_GAP_MS,
} from '../tuning.ts';

/**
 * When zooming changes view (rendering.md §4, M5-T2), as pure functions and small state
 * machines; zoom-gate.ts applies them to the camera.
 */

/**
 * How close the camera may zoom to an object before it stops: for an object that opens a view,
 * the distance from which pushing on enters it (`enterDistance`); for any other, the distance
 * at which zooming simply stops and its info opens (`stopDistance`). Both are multiples of the
 * object's drawn radius, set per view in tuning.ts, and never closer than the view lets the
 * camera get anyway.
 */
export function enterDistance(level: ViewLevel, radius: number, viewMinDistance: number): number {
  return Math.max(ENTER_DISTANCE_RADII[level] * radius, viewMinDistance);
}

export function stopDistance(level: ViewLevel, radius: number, viewMinDistance: number): number {
  return Math.max(STOP_DISTANCE_RADII[level] * radius, viewMinDistance);
}

/**
 * Whether the camera has reached a distance limit. The camera eases toward where it's going, so
 * this compares the distance it's heading for, within a small slack.
 */
export function atNearLimit(distance: number, limit: number): boolean {
  return distance <= limit * (1 + DISTANCE_LIMIT_SLACK);
}

export function atFarLimit(distance: number, limit: number): boolean {
  return distance >= limit * (1 - DISTANCE_LIMIT_SLACK);
}

/**
 * The push past a limit: zoom input accumulated after the camera has stopped, as a share of
 * what it takes to change view (1 = go). It starts over when the reader pauses for
 * PUSH_RESET_MS, changes direction or turns to another object, so only one sustained,
 * deliberate push changes view (the hysteresis in rendering.md §4).
 */
export class Push {
  private key = '';
  private progress = 0;
  private lastMs = Number.NEGATIVE_INFINITY;

  /** Adds `px` of input toward `key` (direction and object); returns the progress so far. */
  add(key: string, px: number, nowMs: number, thresholdPx: number): number {
    if (key !== this.key || nowMs - this.lastMs > PUSH_RESET_MS) this.progress = 0;
    this.key = key;
    this.lastMs = nowMs;
    this.progress += Math.abs(px) / thresholdPx;
    return this.progress;
  }

  reset(): void {
    this.key = '';
    this.progress = 0;
  }
}

/**
 * The momentum guard (rendering.md §4). A trackpad keeps sending shrinking wheel events for a
 * second or more after the fingers lift (inertia); without a guard that tail would zoom on in
 * the new view, and could push straight through into the next one. So wheel input is ignored:
 * - while a change of view runs, and for MOMENTUM_GUARD_MS after it starts;
 * - beyond that, for the rest of any stream of wheel events that was flowing when it started,
 *   until the stream pauses for WHEEL_STREAM_GAP_MS. A new scroll after a pause works at once.
 *
 * `allow` must see every wheel event, even ones the overlay catches mid-transition, so it can
 * tell a continuing stream from a new one.
 */
export class MomentumGuard {
  private lastWheelMs = Number.NEGATIVE_INFINITY;
  private seenStartMs = Number.NEGATIVE_INFINITY;
  private blocked = false;

  /**
   * Whether this wheel event, at `nowMs`, may zoom. `startMs` is when the latest change of view
   * started (or -Infinity), and `active` whether it's still running.
   */
  allow(nowMs: number, startMs: number, active: boolean): boolean {
    const continuing = nowMs - this.lastWheelMs < WHEEL_STREAM_GAP_MS;
    this.lastWheelMs = nowMs;
    if (startMs > this.seenStartMs) {
      // The first event since a change of view started: is it the tail of a stream?
      this.seenStartMs = startMs;
      this.blocked = continuing;
    } else if (!continuing) {
      this.blocked = false;
    }
    if (active || nowMs < startMs + MOMENTUM_GUARD_MS) return false;
    return !this.blocked;
  }
}
