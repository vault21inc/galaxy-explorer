import { gaussian, seededRandom, type SpoilerPolicy, type ViewObject } from '@ge/domain';
import { bodyState } from '../bodies/body-buffers.ts';
import { hexToLinear } from '../color.ts';
import { labelText } from '../labels/label-text.ts';
import type { DrawnObject } from '../scene-index.ts';
import {
  BELT_HALF_THICKNESS_SIZES,
  BELT_HALF_WIDTH_SIZES,
  BELT_MAX_ROCKS,
  BELT_PICK_HALF_WIDTH_PX,
  BELT_PICK_POINTS,
  BELT_ROCKS,
  BELT_ROCK_RADIUS_SU,
  REDACTION_COLOR,
} from '../tuning.ts';

/**
 * The rocks of every asteroid belt in the view (rendering.md §7), pure so it's unit-tested.
 *
 * A belt is a band around what it orbits, through the belt object's position: the system's
 * center, or the star named by its `orbitCenterId` (D-29), as its orbit ring is (orbit-shapes.ts).
 * Its middle radius is the position's distance from that center in the system's plane. Each rock is placed by seeded random
 * numbers (the seed comes from the belt's id), so a belt looks the same on every load:
 * - its angle around the band is uniform;
 * - its offset across the band and its height are bell-shaped (Gaussian), thinning toward the
 *   edges as real belts do;
 * - its size varies by up to ±60 %, and its shape is squashed per axis, so the rocks are lumpy;
 * - its color is the belt's, a little lighter or darker.
 */
export interface BeltRocks {
  /** Per rock: x, y, z. */
  centers: Float32Array;
  /** Per rock: radii along x, y, z (a squashed sphere). */
  scales: Float32Array;
  /** Per rock: a turn about the vertical axis, radians. */
  turns: Float32Array;
  /** Per rock: linear r, g, b. */
  colors: Float32Array;
  count: number;
  /** Each belt's [first rock, rock count], for the move preview. */
  ranges: Map<string, readonly [number, number]>;
  /** Each belt, for picking (along its middle circle), rings, labels and the test hooks. */
  drawn: DrawnObject[];
}

export function buildBeltRocks(
  belts: readonly ViewObject[],
  policy: SpoilerPolicy,
  renderer: string,
  /** The view's stars by id (orbit-shapes.ts `starCenters`); a missing one means the center. */
  centers: ReadonlyMap<string, readonly [number, number, number]> = new Map(),
): BeltRocks {
  const perBelt = Math.min(BELT_ROCKS, BELT_MAX_ROCKS);
  const count = belts.length * perBelt;
  const rocks: BeltRocks = {
    centers: new Float32Array(count * 3),
    scales: new Float32Array(count * 3),
    turns: new Float32Array(count),
    colors: new Float32Array(count * 3),
    count,
    ranges: new Map(),
    drawn: [],
  };
  belts.forEach((belt, b) => {
    const state = bodyState(belt, policy);
    const color = state === 'redacted' ? REDACTION_COLOR : (belt.appearance.color ?? '#a39380');
    const base = hexToLinear(color);
    const size = belt.size ?? 1;
    const [x, y, z] = belt.position;
    const [cx, , cz] = (belt.orbitCenterId === null
      ? undefined
      : centers.get(belt.orbitCenterId)) ?? [0, 0, 0];
    const radius = Math.hypot(x - cx, z - cz);
    const halfWidth = size * BELT_HALF_WIDTH_SIZES;
    const halfThickness = size * BELT_HALF_THICKNESS_SIZES;
    const random = seededRandom(seedOf(belt.id));
    const first = b * perBelt;
    rocks.ranges.set(belt.id, [first, perBelt]);
    for (let i = 0; i < perBelt; i++) {
      const rock = first + i;
      const angle = random() * 2 * Math.PI;
      // A Gaussian's spread is its standard deviation; half a half-width keeps ~95 % inside.
      const across = radius + gaussian(random) * halfWidth * 0.5;
      rocks.centers.set(
        [
          cx + across * Math.cos(angle),
          y + gaussian(random) * halfThickness * 0.5,
          cz + across * Math.sin(angle),
        ],
        rock * 3,
      );
      const rockRadius = BELT_ROCK_RADIUS_SU * (0.4 + 1.2 * random());
      rocks.scales.set(
        [
          rockRadius * (0.7 + 0.6 * random()),
          rockRadius * (0.5 + 0.5 * random()),
          rockRadius * (0.7 + 0.6 * random()),
        ],
        rock * 3,
      );
      rocks.turns[rock] = random() * 2 * Math.PI;
      const shade = 0.75 + 0.5 * random();
      rocks.colors.set([base[0] * shade, base[1] * shade, base[2] * shade], rock * 3);
    }
    rocks.drawn.push({
      id: belt.id,
      renderer,
      center: belt.position,
      radius: halfWidth,
      minRadiusPx: BELT_PICK_HALF_WIDTH_PX,
      maxRadiusPx: Number.POSITIVE_INFINITY,
      state,
      color,
      // Below bodies: a planet or station inside the band is picked before the belt.
      pickPriority: 0.9,
      label: labelText(belt, policy),
      labelPriority: belt.appearance.labelPriority ?? 0,
      // Picked anywhere along the band, like a rift (rendering.md §10).
      curve: Array.from({ length: BELT_PICK_POINTS + 1 }, (_, p) => {
        const angle = (p / BELT_PICK_POINTS) * 2 * Math.PI;
        return [cx + radius * Math.cos(angle), y, cz + radius * Math.sin(angle)] as const;
      }),
    });
  });
  return rocks;
}

/** A stable 32-bit seed from an id (FNV-1a). */
function seedOf(id: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return hash;
}
