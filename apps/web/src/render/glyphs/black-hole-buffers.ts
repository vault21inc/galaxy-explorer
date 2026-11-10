import type { SpoilerPolicy, ViewObject } from '@ge/domain';
import { hexToLinear } from '../color.ts';
import { labelText } from '../labels/label-text.ts';
import { bodyState, BODY_STATES } from '../bodies/body-buffers.ts';
import type { DrawnObject } from '../scene-index.ts';
import { BLACK_HOLE_MAX_PX, BLACK_HOLE_MIN_PX, REDACTION_COLOR } from '../tuning.ts';
import type { GlyphBuffers } from './use-glyph-quads.ts';

/** Per-instance data for BlackHoles: center, radius, tint and state, plus the scene index. */
export function buildBlackHoleBuffers(
  objects: readonly ViewObject[],
  policy: SpoilerPolicy,
  renderer: string,
): GlyphBuffers {
  const count = objects.length;
  const centers = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const states = new Float32Array(count);
  const ids: string[] = [];
  const drawn: DrawnObject[] = [];
  objects.forEach((object, i) => {
    const state = bodyState(object, policy);
    const color =
      state === 'redacted' ? REDACTION_COLOR : (object.appearance.color ?? REDACTION_COLOR);
    const radius = state === 'redacted' ? 0 : (object.size ?? 0);
    ids.push(object.id);
    centers.set(object.position, i * 3);
    radii[i] = radius;
    colors.set(hexToLinear(color), i * 3);
    states[i] = BODY_STATES[state];
    drawn.push({
      id: object.id,
      renderer,
      center: object.position,
      radius,
      minRadiusPx: BLACK_HOLE_MIN_PX,
      maxRadiusPx: BLACK_HOLE_MAX_PX,
      state,
      color,
      pickPriority: 1,
      label: labelText(object, policy),
      labelPriority: object.appearance.labelPriority ?? 0,
    });
  });
  return {
    ids,
    centers,
    drawn,
    attributes: [
      { name: 'aRadius', array: radii, itemSize: 1 },
      { name: 'aColor', array: colors, itemSize: 3 },
      { name: 'aState', array: states, itemSize: 1 },
    ],
  };
}
