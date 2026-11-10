import { pointsAlong, polylineLength, type SpoilerPolicy, type ViewObject } from '@ge/domain';
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
  RIFT_BILLBOARD_SPACING_RADII,
  RIFT_BILLBOARDS_MAX,
  RIFT_BILLBOARDS_MIN,
  STORM_BILLBOARDS,
} from '../tuning.ts';
import { bodyState } from '../bodies/body-buffers.ts';
import { resolvedRegion, riftCurve, type ResolvedRegion } from './region-shape.ts';

/**
 * Per-billboard data for RegionCloud (rendering.md §6). Each shape scatters soft billboards its
 * own way (M4-T6):
 * - **sphere** and **disc:** 6–20 inside the radius, the disc flattened;
 * - **storm:** a few around the rim, for depth when the camera tilts; the flat disc itself is
 *   `StormDiscs`;
 * - **rift:** spread evenly by length along its curve and across its width; the flat band under
 *   them is `RiftRibbons`.
 *
 * Positions come from a generator seeded by the region's id, so a region keeps its shape on
 * every load. Pure and unit-tested.
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
  /** Each region's billboards: [first, count] in the buffers. */
  ranges: Map<string, readonly [number, number]>;
  count: number;
}

/** A 32-bit FNV-1a hash of the id: a stable seed per region. */
function hashId(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/** How many billboards a region gets. */
function billboardCount(region: ResolvedRegion, curveLength: number): number {
  if (region.shape === 'storm') return STORM_BILLBOARDS;
  if (region.shape === 'rift') {
    const count = Math.round(curveLength / (region.radius * RIFT_BILLBOARD_SPACING_RADII));
    return Math.min(RIFT_BILLBOARDS_MAX, Math.max(RIFT_BILLBOARDS_MIN, count));
  }
  const span = REGION_BILLBOARDS_MAX - REGION_BILLBOARDS_MIN;
  return REGION_BILLBOARDS_MIN + Math.round(region.density * span);
}

export function buildRegionBuffers(
  objects: readonly ViewObject[],
  policy: SpoilerPolicy,
  renderer: string,
): RegionBuffers {
  const plans = objects.map((object) => {
    const region = resolvedRegion(object);
    const curve = region.shape === 'rift' ? riftCurve(object, region) : null;
    const count = billboardCount(region, curve ? polylineLength(curve) : 0);
    return { object, region, density: region.density, curve, count };
  });
  const total = plans.reduce((sum, plan) => sum + plan.count, 0);
  const buffers: RegionBuffers = {
    centers: new Float32Array(total * 3),
    sizes: new Float32Array(total),
    colors: new Float32Array(total * 4),
    additive: new Float32Array(total),
    rotations: new Float32Array(total),
    drawn: [],
    ranges: new Map(),
    count: total,
  };

  let index = 0;
  for (const { object, region, density, curve, count } of plans) {
    buffers.ranges.set(object.id, [index, count]);
    const redacted = bodyState(object, policy) === 'redacted';
    const style = REGION_STYLES[object.baseType] ?? DEFAULT_REGION_STYLE;
    const radius = region.radius;
    const hex = redacted ? REDACTION_COLOR : (region.color ?? REDACTION_COLOR);
    const [r, g, b] = hexToLinear(hex);
    const tint = redacted ? 1 : style.tint;
    const flatten = region.shape === 'disc' ? 0.15 : 1;
    const random = seededRandom(hashId(object.id));
    const [cx, cy, cz] = object.position;
    const along = curve ? pointsAlong(curve, count) : [];

    for (let k = 0; k < count; k++, index++) {
      if (region.shape === 'storm') {
        // Around the rim, a little above and below the plane, as puffs of the storm's wall.
        const angle = (k / count) * 2 * Math.PI + random() * 0.6;
        const ring = radius * (region.innerRadius + (1 - region.innerRadius) * 0.35);
        buffers.centers.set(
          [
            cx + Math.cos(angle) * ring,
            cy + (random() - 0.5) * radius * 0.08,
            cz + Math.sin(angle) * ring,
          ],
          index * 3,
        );
        buffers.sizes[index] = radius * (0.12 + 0.1 * random());
      } else if (region.shape === 'rift') {
        // Along the curve, pushed sideways by up to half the band's width.
        const { point, tangent } = along[k] ?? {
          point: [cx, cz] as const,
          tangent: [1, 0] as const,
        };
        const side = (random() - 0.5) * radius;
        buffers.centers.set(
          [
            point[0] - tangent[1] * side,
            cy + (random() - 0.5) * radius * 0.15,
            point[1] + tangent[0] * side,
          ],
          index * 3,
        );
        buffers.sizes[index] = radius * (0.6 + 0.4 * random());
      } else {
        // A point in the unit ball (rejection sampling), then scaled into the region;
        // billboards stay within 60 % of the radius so the cloud's edge is soft, not square.
        let x: number, y: number, z: number;
        do {
          x = 2 * random() - 1;
          y = 2 * random() - 1;
          z = 2 * random() - 1;
        } while (x * x + y * y + z * z > 1);
        const spread = radius * 0.6;
        buffers.centers.set(
          [cx + x * spread, cy + y * spread * flatten, cz + z * spread],
          index * 3,
        );
        buffers.sizes[index] = radius * (0.35 + 0.35 * random());
      }
      buffers.colors.set(
        [r * tint, g * tint, b * tint, REGION_BILLBOARD_OPACITY * (0.6 + 0.8 * density)],
        index * 4,
      );
      buffers.additive[index] = style.additive && !redacted ? 1 : 0;
      buffers.rotations[index] = random() * 2 * Math.PI;
    }

    // A rift is labelled and ringed at its curve's middle, and picked along its curve.
    const middle = curve ? pointsAlong(curve, 1)[0]?.point : undefined;
    buffers.drawn.push({
      id: object.id,
      renderer,
      center: middle ? [middle[0], cy, middle[1]] : object.position,
      radius,
      shape: region.shape,
      ...(curve ? { curve: curve.map(([x, z]) => [x, cy, z] as const) } : {}),
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
