/**
 * Surface coordinates on a globe (data-model §5): latitude and longitude in degrees, and how
 * they map to directions in the orbit frame and to texture coordinates. Defined once here, and
 * matched to three.js's `SphereGeometry`, so a pin at (lat, lon) lands on the texel the planet
 * texture puts there (M6-T1, M6-T3).
 *
 *                  +Y  north pole (lat +90)
 *                   |
 *                   |      lon +90 (east of lon 0) lies along −Z
 *                   |    /
 *                   |  /
 *     lon ±180 -----+-----→ +X   lat 0, lon 0: the texture's horizontal center
 *                 / |
 *               /   |
 *     lon −90 along +Z
 *                   |
 *                  −Y  south pole (lat −90)
 *
 * - Latitude: +90 at +Y (north), −90 at −Y, 0 on the equator (the X/Z plane).
 * - Longitude: 0 along +X, growing eastward. Looking at lon 0 from outside with north up, east
 *   is to the right, which is −Z, so lon +90 lies along −Z and lon −90 along +Z. It runs
 *   −180 ≤ lon < 180; the antimeridian (±180) is −X, the texture's left and right edges.
 * - Texture: u = lon / 360 + 0.5 (0 at the left edge, the antimeridian; 0.5 at lon 0), and
 *   v = lat / 180 + 0.5 (0 at the south pole at the bottom, 1 at the north pole at the top),
 *   which is how `SphereGeometry` lays out its UVs.
 *
 * Positions are in body radii (the globe's radius is 1). Axial tilt turns the whole globe, so
 * it's applied by the renderer, not here.
 */

export type Vec3 = readonly [number, number, number];

export interface LatLon {
  latDeg: number;
  lonDeg: number;
}

const RAD = Math.PI / 180;

/** A longitude brought into [−180, 180). */
export function normalizeLonDeg(lonDeg: number): number {
  const wrapped = (((lonDeg + 180) % 360) + 360) % 360;
  return wrapped - 180;
}

/** The direction from the globe's center through (lat, lon): a point on the unit sphere. */
export function latLonToUnitVector({ latDeg, lonDeg }: LatLon): Vec3 {
  const lat = latDeg * RAD;
  const lon = lonDeg * RAD;
  return [Math.cos(lat) * Math.cos(lon), Math.sin(lat), -Math.cos(lat) * Math.sin(lon)];
}

/**
 * The lat/lon a direction points at; the vector needn't be unit length. At the poles every
 * longitude is the same point, so it's reported as 0.
 */
export function unitVectorToLatLon([x, y, z]: Vec3): LatLon {
  const length = Math.hypot(x, y, z);
  if (length === 0) return { latDeg: 0, lonDeg: 0 };
  const latDeg = Math.asin(Math.max(-1, Math.min(1, y / length))) / RAD;
  const across = Math.hypot(x, z);
  // Within a hair of a pole, longitude means nothing: don't report rounding noise.
  if (across <= 1e-12 * length) return { latDeg, lonDeg: 0 };
  return { latDeg, lonDeg: normalizeLonDeg(Math.atan2(-z, x) / RAD) };
}

/** Texture coordinates (0–1, v up) to lat/lon, as `SphereGeometry` maps its UVs. */
export function uvToLatLon(u: number, v: number): LatLon {
  return { latDeg: (v - 0.5) * 180, lonDeg: normalizeLonDeg((u - 0.5) * 360) };
}

/** Lat/lon to texture coordinates: u in [0, 1), v from 0 (south) to 1 (north). */
export function latLonToUv({ latDeg, lonDeg }: LatLon): { u: number; v: number } {
  return { u: normalizeLonDeg(lonDeg) / 360 + 0.5, v: latDeg / 180 + 0.5 };
}

/**
 * Where a ray first meets a sphere centered at the origin, or null if it misses it or the
 * sphere is behind it. `dir` needn't be unit length. From inside the sphere, the ray meets it
 * on its way out.
 *
 * Solving |origin + t·dir|² = radius² for t gives a quadratic a·t² + 2b·t + c = 0, with
 * a = dir·dir, b = origin·dir and c = origin·origin − radius². Its roots are
 * t = (−b ± √(b² − a·c)) / a: no real root is a miss, and the smaller root ≥ 0 is the hit.
 */
export function raySphereIntersect(origin: Vec3, dir: Vec3, radius: number): Vec3 | null {
  const a = dot(dir, dir);
  if (a === 0) return null;
  const b = dot(origin, dir);
  const c = dot(origin, origin) - radius * radius;
  const discriminant = b * b - a * c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = (-b - root) / a;
  const far = (-b + root) / a;
  const t = near >= 0 ? near : far;
  if (t < 0) return null;
  return [origin[0] + t * dir[0], origin[1] + t * dir[1], origin[2] + t * dir[2]];
}

/**
 * The angle between two surface points seen from the globe's center, in radians: their
 * distance along the surface in globe radii. The haversine form stays accurate for points very
 * close together, where the plain arccosine of a dot product loses precision.
 */
export function greatCircleDistanceRad(a: LatLon, b: LatLon): number {
  const dLat = (b.latDeg - a.latDeg) * RAD;
  const dLon = (b.lonDeg - a.lonDeg) * RAD;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latDeg * RAD) * Math.cos(b.latDeg * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The point a share `t` (0–1) of the way from `a` to `b` along the shorter great circle: how a
 * dragged pin moves across the globe. Spherical linear interpolation turns the direction at a
 * constant angular speed, instead of cutting through the globe as a straight line would.
 *
 * Opposite points have no shorter great circle; the path then goes over the nearer pole.
 */
export function slerpLatLon(a: LatLon, b: LatLon, t: number): LatLon {
  const p = latLonToUnitVector(a);
  const q = latLonToUnitVector(b);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(p, q))));
  if (angle < 1e-12) return unitVectorToLatLon(p);
  if (Math.PI - angle < 1e-9) {
    // Antipodes: every great circle through p reaches q. Take the one through the pole on p's
    // side: m is the direction from p toward that pole, at right angles to p. Points on that
    // circle are cos(θ)·p + sin(θ)·m, and q is at θ = π.
    const pole: Vec3 = [0, p[1] >= 0 ? 1 : -1, 0];
    const along = dot(p, pole);
    let m: Vec3 = [pole[0] - along * p[0], pole[1] - along * p[1], pole[2] - along * p[2]];
    const length = Math.hypot(...m);
    // p is the pole itself: any direction at right angles will do.
    m = length < 1e-12 ? [1, 0, 0] : [m[0] / length, m[1] / length, m[2] / length];
    const theta = t * Math.PI;
    const [c, s] = [Math.cos(theta), Math.sin(theta)];
    return unitVectorToLatLon([c * p[0] + s * m[0], c * p[1] + s * m[1], c * p[2] + s * m[2]]);
  }
  // Weights that keep the result on the sphere and its angle growing evenly with t.
  const sin = Math.sin(angle);
  const wp = Math.sin((1 - t) * angle) / sin;
  const wq = Math.sin(t * angle) / sin;
  return unitVectorToLatLon([wp * p[0] + wq * q[0], wp * p[1] + wq * q[1], wp * p[2] + wq * q[2]]);
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
