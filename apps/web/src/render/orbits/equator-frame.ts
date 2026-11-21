import type { Appearance, ViewObject, ViewPayload } from '@ge/domain';

/**
 * A planet's equatorial frame (rendering.md §8, D-60). What orbits a planet is stored in the
 * planet's own frame, in its radii, with y = 0 as its equator: that's the plane the editor
 * places and drags moons on. The views draw the planet tilted by its axial tilt, a turn about
 * the x axis that leans the north pole from +Y toward +Z (globe.tsx, planet-surfaces.ts), and
 * its rings with it. Moons and stations turn the same way here, so they circle in the plane of
 * the equator and the rings, as Saturn's do, instead of in the view's flat plane.
 *
 * The turn about x by θ, in plain words: x stays put, and a point's (y, z) turns by θ in the
 * y–z plane, so y′ = y·cos θ − z·sin θ and z′ = y·sin θ + z·cos θ. Turning back is the same
 * with −θ. A tilt of 0 changes nothing, which is every planet that doesn't set one.
 */

type Vec3 = readonly [number, number, number];
const DEG = Math.PI / 180;

/** A planet's axial tilt in radians, from its appearance; 0 when it sets none. */
export function axialTiltRad(appearance: Appearance | null | undefined): number {
  return (appearance?.planet?.axialTiltDeg ?? 0) * DEG;
}

/** A point (or a shift) from the planet's equatorial frame into the view, where it's drawn. */
export function equatorToView([x, y, z]: Vec3, tiltRad: number): [number, number, number] {
  if (tiltRad === 0) return [x, y, z];
  const cos = Math.cos(tiltRad);
  const sin = Math.sin(tiltRad);
  return [x, y * cos - z * sin, y * sin + z * cos];
}

/** A point (or a shift) from the view back into the planet's equatorial frame, to be saved. */
export function viewToEquator(point: Vec3, tiltRad: number): [number, number, number] {
  return equatorToView(point, -tiltRad);
}

/** The planet's north pole in the view: the work plane's normal, and the "height" direction. */
export function poleInView(tiltRad: number): [number, number, number] {
  return equatorToView([0, 1, 0], tiltRad);
}

/** Objects that orbit a planet, as the view draws them: their positions turned by its tilt. */
export function objectsInView<T extends Pick<ViewObject, 'position'>>(
  objects: readonly T[],
  tiltRad: number,
): T[] {
  if (tiltRad === 0) return [...objects];
  return objects.map((object) => ({
    ...object,
    position: equatorToView(object.position, tiltRad),
  }));
}

/**
 * The orbit view's payload as it's drawn: what orbits the planet turned by its axial tilt. The
 * view and the editor read this; saving turns positions back (`viewToEquator`).
 */
export function orbitPayloadInView(payload: ViewPayload<'orbit'>): ViewPayload<'orbit'> {
  const tiltRad = axialTiltRad(payload.subject.appearance);
  return tiltRad === 0
    ? payload
    : { ...payload, children: objectsInView(payload.children, tiltRad) };
}
