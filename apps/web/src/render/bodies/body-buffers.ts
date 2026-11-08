import type { ViewObject } from '@ge/domain';
import { hexToLinear } from '../color.ts';
import type { DrawnObject, DrawnState } from '../scene-index.ts';
import { GALAXY_BODY_MAX_PX, GALAXY_BODY_MIN_PX, REDACTION_COLOR } from '../tuning.ts';

/** `aState` in the body shader: how an object is drawn. */
export const BODY_STATES: Record<DrawnState, number> = { normal: 0, redacted: 1, draft: 2 };

/**
 * Per-instance data for InstancedBodies: one entry per object, packed into typed arrays the
 * GPU reads directly (rendering.md §6). Pure, so it's unit-tested; it runs only when the payload
 * or the spoiler policy changes, never per frame.
 */
export interface BodyBuffers {
  ids: string[];
  /** x, y, z per object, in the view's unit. */
  centers: Float32Array;
  /** Radius per object, in the view's unit. */
  radii: Float32Array;
  /** Linear r, g, b per object. */
  colors: Float32Array;
  /** BODY_STATES per object. */
  states: Float32Array;
  /** The same objects, for the scene index (test hooks, picking). */
  drawn: DrawnObject[];
}

export interface SpoilerPolicy {
  showSpoilers: boolean;
}

export function bodyState(object: ViewObject, policy: SpoilerPolicy): DrawnState {
  if (object.isSpoiler && !policy.showSpoilers) return 'redacted';
  return object.status === 'draft' ? 'draft' : 'normal';
}

export function buildBodyBuffers(
  objects: readonly ViewObject[],
  policy: SpoilerPolicy,
  renderer: string,
): BodyBuffers {
  const count = objects.length;
  const buffers: BodyBuffers = {
    ids: [],
    centers: new Float32Array(count * 3),
    radii: new Float32Array(count),
    colors: new Float32Array(count * 3),
    states: new Float32Array(count),
    drawn: [],
  };
  objects.forEach((object, i) => {
    const state = bodyState(object, policy);
    // A hidden spoiler gives nothing away: not its color, nor its size.
    const color =
      state === 'redacted' ? REDACTION_COLOR : (object.appearance.color ?? REDACTION_COLOR);
    const radius = state === 'redacted' ? 0 : (object.size ?? 0);
    buffers.ids.push(object.id);
    buffers.centers.set(object.position, i * 3);
    buffers.radii[i] = radius;
    buffers.colors.set(hexToLinear(color), i * 3);
    buffers.states[i] = BODY_STATES[state];
    buffers.drawn.push({
      id: object.id,
      renderer,
      center: object.position,
      radius,
      minRadiusPx: GALAXY_BODY_MIN_PX / 2,
      maxRadiusPx: GALAXY_BODY_MAX_PX / 2,
      state,
      color,
    });
  });
  return buffers;
}
