// Coordinate conversions for the real Milky Way.
// Equatorial (J2000) → galactic (l, b) → heliocentric Cartesian → galactocentric → the app's
// galaxy frame (light-years, X/Z the plane).

const DEG = Math.PI / 180;

/** Sun–Galactic Centre distance: GRAVITY 2019, 8.178 kpc. */
export const R0_LY = 26_670;
/** The Sun's height above the plane: 20.8 pc (Bennett & Bovy 2019). */
export const ZSUN_LY = 68;
export const LY_PER_KPC = 3_261.56;

// The galactic north pole and the north celestial pole's galactic longitude (J2000).
const RA_NGP = 192.85948 * DEG;
const DEC_NGP = 27.12825 * DEG;
const L_NCP = 122.93192 * DEG;

export function hms(h: number, m: number, s: number) {
  return (h + m / 60 + s / 3600) * 15;
}
export function dms(d: number, m: number, s: number) {
  const sign = d < 0 || Object.is(d, -0) ? -1 : 1;
  return sign * (Math.abs(d) + m / 60 + s / 3600);
}

export function equatorialToGalactic(raDeg: number, decDeg: number) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const sinB =
    Math.sin(dec) * Math.sin(DEC_NGP) + Math.cos(dec) * Math.cos(DEC_NGP) * Math.cos(ra - RA_NGP);
  const b = Math.asin(sinB);
  const y = Math.cos(dec) * Math.sin(ra - RA_NGP);
  const x =
    Math.sin(dec) * Math.cos(DEC_NGP) - Math.cos(dec) * Math.sin(DEC_NGP) * Math.cos(ra - RA_NGP);
  let l = L_NCP - Math.atan2(y, x);
  l = ((l % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return { lDeg: l / DEG, bDeg: b / DEG };
}

/** Galactocentric (x toward the GC from the Sun's side, y toward l = 90°, z to the NGP), ly. */
export function galacticToGalactocentric(lDeg: number, bDeg: number, dLy: number) {
  const l = lDeg * DEG;
  const b = bDeg * DEG;
  const hx = dLy * Math.cos(b) * Math.cos(l);
  const hy = dLy * Math.cos(b) * Math.sin(l);
  const hz = dLy * Math.sin(b);
  // Shift to the GC, then tilt so the GC is at the origin and the Sun ZSUN above the plane.
  const x = hx - R0_LY;
  const sinT = ZSUN_LY / R0_LY;
  const cosT = Math.sqrt(1 - sinT * sinT);
  return { x: x * cosT + hz * sinT, y: hy, z: -x * sinT + hz * cosT };
}

/**
 * Galactocentric → the app's frame. The app's procedural spiral winds clockwise outward seen
 * from +Y, the Milky Way's arms wind clockwise outward seen from the *south* galactic pole, so
 * galactic north is −Y here: (x, y, z) → (x, −z, y), a proper rotation (no mirror). Then a turn
 * about Y puts the bar's near end on +X, where the procedural bar and arm 0 start.
 */
export function makeFrame(rotDeg: number) {
  const c = Math.cos(rotDeg * DEG);
  const s = Math.sin(rotDeg * DEG);
  return (g: { x: number; y: number; z: number }) => {
    const X = g.x;
    const Y = -g.z;
    const Z = g.y;
    return { x: X * c - Z * s, y: Y, z: X * s + Z * c };
  };
}

/** The bar's near end is 27° from the Sun–GC line, on the l > 0 side (Wegg et al. 2015). */
export const BAR_ANGLE_DEG = 27;
/** The rotation that puts the bar's near end on +X. */
export function barRotationDeg() {
  // Near-end direction in galactocentric (x, y): (−cos 27°, +sin 27°); in the frame before the
  // turn, (X, Z) = (x, y).
  const a = Math.atan2(Math.sin(BAR_ANGLE_DEG * DEG), -Math.cos(BAR_ANGLE_DEG * DEG));
  return -a / DEG;
}

/** A point on an arm from Reid et al. 2019 (ApJ 885, 131) table 2: β from the Sun's direction. */
export interface ArmFit {
  key: string;
  name: string;
  betaKinkDeg: number;
  rKinkKpc: number;
  pitchBeforeDeg: number;
  pitchAfterDeg: number;
  widthKpc: number;
  betaFromDeg: number;
  betaToDeg: number;
}

export function armPoint(arm: ArmFit, betaDeg: number) {
  const pitch = betaDeg < arm.betaKinkDeg ? arm.pitchBeforeDeg : arm.pitchAfterDeg;
  const lnR = Math.log(arm.rKinkKpc) - (betaDeg - arm.betaKinkDeg) * DEG * Math.tan(pitch * DEG);
  const rLy = Math.exp(lnR) * LY_PER_KPC;
  // β grows in the direction of rotation: clockwise from the NGP, so the azimuth (from +x,
  // counter-clockwise seen from the NGP) is 180° − β.
  const phi = (180 - betaDeg) * DEG;
  return { x: rLy * Math.cos(phi), y: rLy * Math.sin(phi), z: 0 };
}
