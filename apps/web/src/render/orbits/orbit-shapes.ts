import { isHidden, spoilerKeys, type SpoilerPolicy, type ViewObject } from '@ge/domain';
import { hexToLinear } from '../color.ts';
import { ORBIT_RING_COLOR, ORBIT_RING_SELECTED_COLOR, ORBIT_RING_SEGMENTS } from '../tuning.ts';

/**
 * Orbit rings as line segments (rendering.md §7), pure so it's unit-tested. Each ring is a
 * circle in the system's plane around its center, through the body: radius = the body's
 * distance from the center axis, √(x² + z²), at the body's own height. M5-T4 centers a body
 * with an `orbitCenterId` on that star instead (D-29).
 */
export interface OrbitRing {
  id: string;
  /** The body's position, which the circle passes through. */
  position: readonly [number, number, number];
}

/** The bodies that get a ring: `showOrbit` set, not a hidden spoiler, not at the center. */
export function orbitRings(objects: readonly ViewObject[], policy: SpoilerPolicy): OrbitRing[] {
  return objects
    .filter((object) => object.appearance.showOrbit === true)
    .filter((object) => !isHidden(object.isSpoiler, spoilerKeys.record(object.id), policy))
    .filter(({ position: [x, , z] }) => Math.hypot(x, z) > 1e-6)
    .map(({ id, position }) => ({ id, position }));
}

/**
 * Writes the rings' segments into `positions` (6 floats per segment: start and end) and their
 * colors into `colors`, a ring in the selection color if its body is selected. `shift` moves a
 * body during a drag, so its ring follows it. Writes in place: called on every drag step.
 */
export function writeOrbitRings(
  rings: readonly OrbitRing[],
  positions: Float32Array,
  colors: Float32Array,
  selected: ReadonlySet<string>,
  shift: { ids: ReadonlySet<string>; delta: readonly [number, number, number] } | null,
): void {
  const plain = hexToLinear(ORBIT_RING_COLOR);
  const highlight = hexToLinear(ORBIT_RING_SELECTED_COLOR);
  rings.forEach((ring, r) => {
    let [x, y, z] = ring.position;
    if (shift?.ids.has(ring.id)) {
      x += shift.delta[0];
      y += shift.delta[1];
      z += shift.delta[2];
    }
    const radius = Math.hypot(x, z);
    const color = selected.has(ring.id) ? highlight : plain;
    for (let s = 0; s < ORBIT_RING_SEGMENTS; s++) {
      const a0 = (s / ORBIT_RING_SEGMENTS) * 2 * Math.PI;
      const a1 = ((s + 1) / ORBIT_RING_SEGMENTS) * 2 * Math.PI;
      const at = (r * ORBIT_RING_SEGMENTS + s) * 6;
      positions[at] = radius * Math.cos(a0);
      positions[at + 1] = y;
      positions[at + 2] = radius * Math.sin(a0);
      positions[at + 3] = radius * Math.cos(a1);
      positions[at + 4] = y;
      positions[at + 5] = radius * Math.sin(a1);
      colors.set(color, at);
      colors.set(color, at + 3);
    }
  });
}
