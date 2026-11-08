import type { ViewObject } from '@ge/domain';
import { seededRandom } from '@ge/domain/galaxy';
import { hexToLinear } from '../color.ts';
import { labelText } from '../labels/label-text.ts';
import type { DrawnObject } from '../scene-index.ts';
import {
  DEFAULT_REGION_STYLE,
  REDACTION_COLOR,
  REGION_BILLBOARD_MAX_PX,
  REGION_BILLBOARD_MIN_PX,
  REGION_BILLBOARD_OPACITY,
  REGION_BILLBOARDS_MAX,
  REGION_BILLBOARDS_MIN,
  REGION_STYLES,
} from '../tuning.ts';
import { bodyState, type SpoilerPolicy } from '../bodies/body-buffers.ts';

/**
 * Per-billboard data for RegionCloud (rendering.md §6): every region becomes 6–20 soft
 * billboards scattered inside its radius. Positions come from a generator seeded by the
 * region's id, so a nebula keeps its shape on every load. Pure and unit-tested.
 */
export interface RegionBuffers {
  /** x, y, z of each billboard's center, in the view's unit. */
  centers: Float32Array;
  /** Each billboard's radius, in the view's unit. */
  sizes: Float32Array;
  /** Linear r, g, b and opacity per billboard. */
  colors: Float32Array;
  /** 1 adds light (nebulae), 0 covers what's behind (anomalies). */
  additive: Float32Array;
  /** Each billboard's rotation in radians, so the shared sprite never looks repeated. */
  rotations: Float32Array;
  /** One entry per region, for the scene index. */
  drawn: DrawnObject[];
  count: number;
}

/** A 32-bit FNV-1a hash of the id: a stable seed per region. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

export function buildRegionBuffers(
  objects: readonly ViewObject[],
  policy: SpoilerPolicy,
  renderer: string,
): RegionBuffers {
  const plans = objects.map((object) => {
    const region = object.appearance.region ?? {};
    const density = region.density ?? 0.5;
    const span = REGION_BILLBOARDS_MAX - REGION_BILLBOARDS_MIN;
    return { object, region, density, count: REGION_BILLBOARDS_MIN + Math.round(density * span) };
  });
  const total = plans.reduce((sum, plan) => sum + plan.count, 0);
  const buffers: RegionBuffers = {
    centers: new Float32Array(total * 3),
    sizes: new Float32Array(total),
    colors: new Float32Array(total * 4),
    additive: new Float32Array(total),
    rotations: new Float32Array(total),
    drawn: [],
    count: total,
  };

  let index = 0;
  for (const { object, region, density, count } of plans) {
    const redacted = bodyState(object, policy) === 'redacted';
    const style = REGION_STYLES[object.baseType] ?? DEFAULT_REGION_STYLE;
    const radius = region.radius ?? 1_000;
    const hex = redacted
      ? REDACTION_COLOR
      : (region.color ?? object.appearance.color ?? REDACTION_COLOR);
    const [r, g, b] = hexToLinear(hex);
    const tint = redacted ? 1 : style.tint;
    const flatten = region.shape === 'disc' ? 0.15 : 1;
    const random = seededRandom(hashId(object.id));
    const [cx, cy, cz] = object.position;

    for (let k = 0; k < count; k++, index++) {
      // A point in the unit ball (rejection sampling), then scaled into the region; billboards
      // stay within 60 % of the radius so the cloud's edge is soft rather than square.
      let x: number, y: number, z: number;
      do {
        x = 2 * random() - 1;
        y = 2 * random() - 1;
        z = 2 * random() - 1;
      } while (x * x + y * y + z * z > 1);
      const spread = radius * 0.6;
      buffers.centers.set([cx + x * spread, cy + y * spread * flatten, cz + z * spread], index * 3);
      buffers.sizes[index] = radius * (0.35 + 0.35 * random());
      buffers.colors.set(
        [r * tint, g * tint, b * tint, REGION_BILLBOARD_OPACITY * (0.6 + 0.8 * density)],
        index * 4,
      );
      buffers.additive[index] = style.additive && !redacted ? 1 : 0;
      buffers.rotations[index] = random() * 2 * Math.PI;
    }

    buffers.drawn.push({
      id: object.id,
      renderer,
      center: object.position,
      radius,
      minRadiusPx: REGION_BILLBOARD_MIN_PX,
      maxRadiusPx: REGION_BILLBOARD_MAX_PX,
      state: redacted ? 'redacted' : object.status === 'draft' ? 'draft' : 'normal',
      color: hex,
      pickPriority: 0,
      label: labelText(object, policy),
      labelPriority: object.appearance.labelPriority ?? 0,
    });
  }
  return buffers;
}
