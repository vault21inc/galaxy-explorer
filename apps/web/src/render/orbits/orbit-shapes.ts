import { isHidden, spoilerKeys, type SpoilerPolicy, type ViewObject } from '@ge/domain';
import { hexToLinear } from '../color.ts';
import { ORBIT_RING_COLOR, ORBIT_RING_SELECTED_COLOR, ORBIT_RING_SEGMENTS } from '../tuning.ts';

/**
 * Orbit rings as line segments (rendering.md §7), pure so it's unit-tested. Each ring is a
 * circle in the system's plane through the body, around what it orbits: the system's center,
 * or the star named by its `orbitCenterId` (an S-type orbit in a binary, D-29). Its radius is
 * the body's distance from that center in the plane, √(Δx² + Δz²), at the body's own height.
 */
export interface OrbitRing {
  id: string;
  /** The body's position, which the circle passes through. */
  position: readonly [number, number, number];
  /** The star it circles, or null for the system's center. */
  centerId: string | null;
}

/** The bodies that get a ring: `showOrbit` set, not a hidden spoiler, not at their center. */
export function orbitRings(objects: readonly ViewObject[], policy: SpoilerPolicy): OrbitRing[] {
  const centers = starCenters(objects);
  return objects
    .filter((object) => object.appearance.showOrbit === true)
    .filter((object) => !isHidden(object.isSpoiler, spoilerKeys.record(object.id), policy))
    .map(({ id, position, orbitCenterId }) => ({
      id,
      position,
      // A center that isn't in this view (hidden, or gone) falls back to the system's.
      centerId: orbitCenterId !== null && centers.has(orbitCenterId) ? orbitCenterId : null,
    }))
    .filter(({ position: [x, , z], centerId }) => {
      const [cx, , cz] = centerId === null ? [0, 0, 0] : (centers.get(centerId) ?? [0, 0, 0]);
      return Math.hypot(x - cx, z - cz) > 1e-6;
    });
}

/** Where each object that can be orbited is: the view's stars, by id. */
export function starCenters(
  objects: readonly ViewObject[],
): Map<string, readonly [number, number, number]> {
  return new Map(
    objects
      .filter((object) => object.baseType === 'star')
      .map((object) => [object.id, object.position] as const),
  );
}

/** A ring as drawn: its center and radius in the system's plane, at its body's height. */
export interface RingShape {
  center: [number, number, number];
  radius: number;
}

/**
 * Writes the rings' segments into `positions` (6 floats per segment: start and end) and their
 * colors into `colors`, a ring in the selection color if its body is selected. `shift` moves
 * bodies and stars during a drag, so a ring follows its body and its star. Writes in place:
 * called on every drag step. Returns each ring's shape, for the test hooks.
 */
export function writeOrbitRings(
  rings: readonly OrbitRing[],
  centers: ReadonlyMap<string, readonly [number, number, number]>,
  positions: Float32Array,
  colors: Float32Array,
  selected: ReadonlySet<string>,
  shift: { ids: ReadonlySet<string>; delta: readonly [number, number, number] } | null,
): Map<string, RingShape> {
  const shapes = new Map<string, RingShape>();
  const plain = hexToLinear(ORBIT_RING_COLOR);
  const highlight = hexToLinear(ORBIT_RING_SELECTED_COLOR);
  const shifted = (id: string, [x, y, z]: readonly [number, number, number]) =>
    shift?.ids.has(id)
      ? ([x + shift.delta[0], y + shift.delta[1], z + shift.delta[2]] as const)
      : ([x, y, z] as const);
  rings.forEach((ring, r) => {
    const [x, y, z] = shifted(ring.id, ring.position);
    const center = ring.centerId === null ? undefined : centers.get(ring.centerId);
    const [cx, , cz] = ring.centerId && center ? shifted(ring.centerId, center) : [0, 0, 0];
    const radius = Math.hypot(x - cx, z - cz);
    shapes.set(ring.id, { center: [cx, y, cz], radius });
    const color = selected.has(ring.id) ? highlight : plain;
    for (let s = 0; s < ORBIT_RING_SEGMENTS; s++) {
      const a0 = (s / ORBIT_RING_SEGMENTS) * 2 * Math.PI;
      const a1 = ((s + 1) / ORBIT_RING_SEGMENTS) * 2 * Math.PI;
      const at = (r * ORBIT_RING_SEGMENTS + s) * 6;
      positions[at] = cx + radius * Math.cos(a0);
      positions[at + 1] = y;
      positions[at + 2] = cz + radius * Math.sin(a0);
      positions[at + 3] = cx + radius * Math.cos(a1);
      positions[at + 4] = y;
      positions[at + 5] = cz + radius * Math.sin(a1);
      colors.set(color, at);
      colors.set(color, at + 3);
    }
  });
  return shapes;
}
