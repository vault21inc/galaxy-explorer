import { CameraControlsImpl } from '@react-three/drei';
import type { RootState } from '@react-three/fiber';
import { Vector3 } from 'three';
import { useNavigation } from '@/state/navigation.ts';
import { useSelection } from '@/state/selection.ts';
import { viewNavigation } from '@/state/view-navigator.ts';
import { detectPlatform } from '@/input/platform.ts';
import { clampedRadiusPx } from '../bodies/body-scale.ts';
import { pickAt } from '../picking/picking.ts';
import { drawnObject, type DrawnObject } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { transitionTiming } from '../transition/transition-controller.ts';
import { hidePushRing, showPushRing } from '../transition/push-ring-store.ts';
import {
  ENTER_PUSH_PX,
  EXIT_PUSH_PX,
  EXIT_RING_RADIUS_PX,
  PUSH_RESET_MS,
  PUSH_RING_GAP_PX,
  PUSH_RING_MIN_RADIUS_PX,
} from '../tuning.ts';
import {
  atFarLimit,
  atNearLimit,
  enterDistance,
  MomentumGuard,
  Push,
  stopDistance,
} from './thresholds.ts';
import { viewCameraConfig } from './use-view-camera.ts';

/**
 * Zooming between views (rendering.md §4, M5-T2). Every wheel step passes through here before
 * the camera controls see it (input/use-input-bindings.ts), and is let through, held back or
 * turned into a change of view:
 *
 * - **The zoom target** is the object under the pointer, else the one selected object. Zooming
 *   in moves the camera straight toward it (`zoomToward`), so the zoom converges on it, as in
 *   Google Earth, and it stays under the pointer. It stays the target while the reader keeps
 *   scrolling, even if the pointer drifts off it.
 * - **Toward an object that opens a view**, the camera stops at its enter distance; pushing on
 *   by ENTER_PUSH_PX fills the progress ring and enters it. Its view's data is fetched as soon
 *   as it becomes the target.
 * - **Toward any other object**, the camera stops at its stop distance and the object is
 *   selected, which opens its info.
 * - **Zooming out of a system or orbit view**, the camera stops at the view's farthest distance;
 *   pushing on by EXIT_PUSH_PX leaves it.
 * - **The momentum guard** drops wheel input during and just after a change of view.
 *
 * Zooming toward a target is done here, step by step, so it can stop exactly at the limit;
 * zooming over empty space and zooming out stay camera-controls' own.
 */

const guard = new MomentumGuard();
const push = new Push();
/** The zoom target while a zoom continues, so it survives sliding out from under the pointer. */
let held: { id: string; lastMs: number } | null = null;
let prefetched: string | null = null;
const scratch = new Vector3();
const scratchTarget = new Vector3();
const scratchCenter = new Vector3();

/**
 * Every wheel event, wherever it lands (even on the transition overlay), so the momentum guard
 * can tell a continuing stream from a new one. Returns whether this event may zoom.
 */
export function noteWheel(nowMs: number): boolean {
  const { startedAtMs, active } = transitionTiming();
  const allowed = guard.allow(nowMs, startedAtMs, active);
  if (!allowed) {
    push.reset();
    hidePushRing();
  }
  return allowed;
}

/**
 * Decides one zoom step of `deltaPx` (negative zooms in) at a page point. Returns true to let
 * the camera zoom, false when the step was held back or used to push toward a change of view.
 */
export function gateZoom(state: RootState, deltaPx: number, clientX: number, clientY: number) {
  const { controls } = state;
  const config = viewCameraConfig();
  const { stack } = useNavigation.getState();
  const top = stack.at(-1);
  if (!(controls instanceof CameraControlsImpl) || !config || !top || deltaPx === 0) return true;
  const nowMs = performance.now();

  if (deltaPx > 0) {
    // Zooming out lets go of the target, and may leave a system or orbit view.
    held = null;
    if (stack.length < 2 || !atFarLimit(endDistance(controls), config.maxDistance)) {
      push.reset();
      hidePushRing();
      return true;
    }
    const progress = push.add(`exit:${top.subjectId}`, deltaPx, nowMs, EXIT_PUSH_PX);
    const rect = state.gl.domElement.getBoundingClientRect();
    showPushRing({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      radiusPx: EXIT_RING_RADIUS_PX,
      progress,
    });
    if (progress >= 1) {
      push.reset();
      hidePushRing();
      viewNavigation.exit();
    }
    return false;
  }

  const target = zoomTarget(state, clientX, clientY, nowMs);
  if (!target) {
    // Empty space: camera-controls zooms toward the pointer, within the view's own limits.
    push.reset();
    hidePushRing();
    return true;
  }
  const limit = target.opensView
    ? enterDistance(top.level, target.radius, config.minDistance)
    : stopDistance(top.level, target.radius, config.minDistance);
  if (target.opensView && prefetched !== target.id) {
    prefetched = target.id;
    viewNavigation.prefetch(target.id);
  }
  const distance = zoomToward(controls, target, deltaPx, limit);
  if (!atNearLimit(distance, limit)) {
    push.reset();
    hidePushRing();
    return false;
  }
  if (!target.opensView) {
    // As close as it goes: show its info.
    const selection = useSelection.getState();
    if (selection.selectedIds.length !== 1 || selection.selectedIds[0] !== target.id) {
      selection.select([target.id]);
    }
    return false;
  }
  const progress = push.add(`enter:${target.id}`, deltaPx, nowMs, ENTER_PUSH_PX);
  const ring = ringAround(state, target, progress);
  if (ring) showPushRing(ring);
  if (progress >= 1) {
    push.reset();
    hidePushRing();
    held = null;
    viewNavigation.enter(target.id);
  }
  return false;
}

/** Bodies only: regions are areas to zoom through, and routes are lines. */
function zoomable(object: DrawnObject | null | undefined): object is DrawnObject {
  return !!object && object.pickPriority >= 1 && !object.curve && object.state !== 'redacted';
}

function zoomTarget(state: RootState, clientX: number, clientY: number, nowMs: number) {
  const hovered = pickAt(state, clientX, clientY);
  let target: DrawnObject | null = zoomable(hovered) ? hovered : null;
  if (!target && held && nowMs - held.lastMs <= PUSH_RESET_MS) {
    const kept = drawnObject(held.id);
    if (zoomable(kept)) target = kept;
  }
  if (!target) {
    const { selectedIds } = useSelection.getState();
    const selected = selectedIds.length === 1 ? drawnObject(selectedIds[0] ?? '') : undefined;
    if (zoomable(selected)) target = selected;
  }
  held = target ? { id: target.id, lastMs: nowMs } : null;
  return target;
}

/**
 * One zoom step toward the target, never closer than `limit`; returns the distance to the target
 * before the step (where the camera was already heading).
 *
 * The camera moves along the straight line from itself to the target, keeping its orientation.
 * Every point on that line projects to the same place on screen, so the target stays exactly
 * under the pointer while the camera closes in, and the step can stop precisely at the limit.
 * What the camera looks at (camera-controls' "target", the point it orbits) is put at the same
 * distance straight ahead, so orbiting afterwards turns around the depth of the object.
 *
 * The step size copies camera-controls' own wheel zoom, so zooming feels the same over objects
 * and over empty space: it scales the distance by 0.95 per 10 px of wheel on a Mac (per 30 px
 * elsewhere), times its `dollySpeed`.
 */
function zoomToward(
  controls: CameraControlsImpl,
  target: DrawnObject,
  deltaPx: number,
  limit: number,
): number {
  const camera = controls.getPosition(scratch, true);
  const looking = controls.getTarget(scratchTarget, true);
  const center = scratchCenter.set(...target.center);
  const distance = camera.distanceTo(center);
  if (atNearLimit(distance, limit)) return distance;
  const pxPerStep = detectPlatform() === 'mac' ? 10 : 30;
  const scale = 0.95 ** ((-deltaPx / pxPerStep) * controls.dollySpeed);
  const next = Math.max(limit, distance * scale);
  const ahead = looking.sub(camera).normalize();
  // Along the line to the target: from `distance` away to `next` away.
  const moved = camera.lerp(center, (distance - next) / distance);
  const lookAt = scratchCenter.copy(moved).addScaledVector(ahead, next);
  void controls.setLookAt(moved.x, moved.y, moved.z, lookAt.x, lookAt.y, lookAt.z, true);
  return distance;
}

/** The distance the camera is heading for: where its eased movement will settle. */
function endDistance(controls: CameraControlsImpl): number {
  return controls.getPosition(scratch, true).distanceTo(controls.getTarget(scratchTarget, true));
}

/** The ring just outside the target as drawn, with the renderer's on-screen size clamp. */
function ringAround(state: RootState, target: DrawnObject, progress: number) {
  const { camera, gl, size } = state;
  const rect = gl.domElement.getBoundingClientRect();
  const center = scratch.set(...target.center);
  // Depth: the distance in front of the camera along its view direction, as the shaders use.
  const depth = -center.clone().applyMatrix4(camera.matrixWorldInverse).z;
  center.project(camera);
  if (depth <= 0) return null;
  const radiusPx = clampedRadiusPx(
    target.radius,
    depth,
    worldPerPxAt1(camera, size.height),
    target.minRadiusPx,
    target.maxRadiusPx,
  );
  return {
    x: rect.left + ((center.x + 1) / 2) * rect.width,
    y: rect.top + ((1 - center.y) / 2) * rect.height,
    radiusPx: Math.max(radiusPx + PUSH_RING_GAP_PX, PUSH_RING_MIN_RADIUS_PX),
    progress,
  };
}
