import type { CameraPose } from '@/state/navigation-stack.ts';

/**
 * The scripted camera move of capture mode (D-55, rendering.md §16): from one camera pose to
 * another over a set time, smooth enough to post as a clip.
 *
 * A pose is a camera position and the point it looks at (its target). The move is split into
 * the two things the eye reads separately:
 *
 * 1. **Where it looks and how far away it is.** Moving the target in a straight line while the
 *    distance changes in a straight line looks wrong: zooming from the whole disc (100,000 ly
 *    out) to a star cluster (500 ly out) linearly spends nine tenths of the time far out, then
 *    lunges at the end. Zooming has to be exponential: each second covers the same *ratio* of
 *    distance, so it feels steady. And panning far at close range whizzes past in a blur. Both
 *    are solved by van Wijk and Nuij's "smooth and efficient zooming and panning" (2003), the
 *    path d3's zoom transitions follow and Google Earth's flights resemble: it pulls back while
 *    travelling, as far as the trip needs, then pushes in, so the view's apparent speed stays
 *    the same throughout. A pure zoom comes out exponential.
 * 2. **Which way it looks.** The camera's direction from its target is two angles: the azimuth,
 *    turning around the vertical (y) axis, and the polar angle, down from straight above (0) to
 *    straight below (π). Both are interpolated on their own, the azimuth the short way round,
 *    plus any extra `spin` for a turntable shot.
 *
 * The time is eased (slow in, slow out) before either is computed, so the move starts and stops
 * gently instead of with a jolt.
 *
 * `planMove` does the work once when the move starts; `poseAt` is then a few multiplications
 * per frame, and writes into vectors it's given, so a frame allocates nothing (rendering.md §2,
 * rule 4).
 */

/** Anything with x, y and z to write into, such as a three.js Vector3. */
export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface MovePlan {
  /** The start's target, and the straight line from it to the end's target. */
  startTarget: readonly [number, number, number];
  targetDelta: readonly [number, number, number];
  /** The camera's direction from its target at the start, and how far each angle turns. */
  azimuth0: number;
  azimuthTurn: number;
  polar0: number;
  polarTurn: number;
  /** The van Wijk–Nuij path (see `pathAt`). */
  path: ZoomPath;
  /** The view's span (its height in scene units) per unit of camera distance. */
  spanPerDistance: number;
}

/** Plans a move. `curvature` is ρ (CAPTURE_ZOOM_CURVATURE); `fovDeg` the vertical field of view. */
export function planMove(
  from: CameraPose,
  to: CameraPose,
  { spinDeg, curvature, fovDeg }: { spinDeg: number; curvature: number; fovDeg: number },
): MovePlan {
  const start = toSpherical(from);
  const end = toSpherical(to);
  // How much of the scene fits on screen, top to bottom, per unit of distance: the view's
  // height at distance d is 2·d·tan(fov/2). The path measures zoom in spans, not distances.
  const spanPerDistance = 2 * Math.tan(((fovDeg / 2) * Math.PI) / 180);
  const targetDelta = [
    to.target[0] - from.target[0],
    to.target[1] - from.target[1],
    to.target[2] - from.target[2],
  ] as const;
  return {
    startTarget: from.target,
    targetDelta,
    azimuth0: start.azimuth,
    azimuthTurn: shortestTurn(start.azimuth, end.azimuth) + (spinDeg * Math.PI) / 180,
    polar0: start.polar,
    polarTurn: end.polar - start.polar,
    path: zoomPath(
      start.radius * spanPerDistance,
      end.radius * spanPerDistance,
      Math.hypot(...targetDelta),
      curvature,
    ),
    spanPerDistance,
  };
}

/**
 * The pose `t` of the way through the move (0 to 1, by time), written into `position` and
 * `target`.
 */
export function poseAt(plan: MovePlan, t: number, position: Vec3Like, target: Vec3Like): void {
  const eased = easeInOut(Math.min(1, Math.max(0, t)));
  const { along, span } = pathAt(plan.path, eased);
  const [tx, ty, tz] = plan.startTarget;
  const [dx, dy, dz] = plan.targetDelta;
  target.x = tx + dx * along;
  target.y = ty + dy * along;
  target.z = tz + dz * along;

  const radius = span / plan.spanPerDistance;
  const azimuth = plan.azimuth0 + plan.azimuthTurn * eased;
  const polar = plan.polar0 + plan.polarTurn * eased;
  // Back from angles to a position: the same convention as three.js's Spherical, with y up.
  const flat = radius * Math.sin(polar); // the distance from the target, seen from above
  position.x = target.x + flat * Math.sin(azimuth);
  position.y = target.y + radius * Math.cos(polar);
  position.z = target.z + flat * Math.cos(azimuth);
}

/**
 * Slow in, slow out: half a cosine wave from 0 to 1. Its speed is zero at both ends and
 * greatest halfway, with no sudden change anywhere, so the camera eases off the start, glides,
 * and settles.
 */
export function easeInOut(t: number): number {
  return (1 - Math.cos(Math.PI * t)) / 2;
}

/** A pose as its target, distance and two angles. */
function toSpherical(pose: CameraPose): { radius: number; azimuth: number; polar: number } {
  const x = pose.position[0] - pose.target[0];
  const y = pose.position[1] - pose.target[1];
  const z = pose.position[2] - pose.target[2];
  const radius = Math.hypot(x, y, z);
  return {
    radius,
    // Around the vertical axis, measured from +z toward +x (three.js's Spherical.theta).
    azimuth: Math.atan2(x, z),
    // Down from straight above (three.js's Spherical.phi). A camera on its own target has no
    // direction; parseCameraParam refuses one, but stay finite anyway.
    polar: radius === 0 ? Math.PI / 2 : Math.acos(Math.min(1, Math.max(-1, y / radius))),
  };
}

/** The signed turn from one azimuth to another the short way round, in (−π, π]. */
function shortestTurn(from: number, to: number): number {
  const turn = (to - from) % (2 * Math.PI);
  if (turn > Math.PI) return turn - 2 * Math.PI;
  if (turn <= -Math.PI) return turn + 2 * Math.PI;
  return turn;
}

/**
 * The van Wijk–Nuij path between two views, each a centre and a span (how much of the scene the
 * view shows across). The centres are a straight line `distance` long; the path decides how far
 * along it the view is (`along`, 0 to 1) and how wide it is (`span`) at each point.
 *
 * The idea, from the paper: picture the view as a point in a space where one axis is position
 * and the other is the logarithm of the span. Moving 1 span sideways, or zooming by a constant
 * factor, costs the same. The cheapest route in that space between two views is an arc that
 * rises (zooms out) in the middle when the views are far apart, and the trip along it at a
 * steady pace looks steady on screen. The closed form uses hyperbolic functions; `curvature`
 * (ρ) trades zooming against panning.
 */
export interface ZoomPath {
  span0: number;
  distance: number;
  curvature: number;
  /** The path's length in the paper's units (S), and where on its curve it starts (r₀). */
  length: number;
  r0: number;
  /** A pure zoom: the centres (nearly) coincide, so only the span changes. */
  pureZoom: boolean;
}

function zoomPath(span0: number, span1: number, distance: number, curvature: number): ZoomPath {
  const rho = curvature;
  const rho2 = rho * rho;
  const rho4 = rho2 * rho2;
  // The centres barely differ (relative to how much is on screen): a zoom, exponential in time.
  if (distance < 1e-9 * Math.max(span0, span1)) {
    return {
      span0,
      distance,
      curvature,
      length: Math.log(span1 / span0) / rho,
      r0: 0,
      pureZoom: true,
    };
  }
  // The paper's equations (9)–(10). log(√(b² + 1) − b) is −asinh(b), which stays accurate when
  // b is large, where the log form loses its digits to cancellation.
  const b0 =
    (span1 * span1 - span0 * span0 + rho4 * distance * distance) / (2 * span0 * rho2 * distance);
  const b1 =
    (span1 * span1 - span0 * span0 - rho4 * distance * distance) / (2 * span1 * rho2 * distance);
  const r0 = -Math.asinh(b0);
  const r1 = -Math.asinh(b1);
  return { span0, distance, curvature, length: (r1 - r0) / rho, r0, pureZoom: false };
}

/** Where the path is a fraction `t` of the way along it (by its own length, so steadily). */
export function pathAt(path: ZoomPath, t: number): { along: number; span: number } {
  const { span0, distance, curvature: rho, length, r0 } = path;
  const s = t * length;
  if (path.pureZoom) return { along: t, span: span0 * Math.exp(rho * s) };
  const coshR0 = Math.cosh(r0);
  // The paper's equations (5)–(6): u(s) is the distance travelled along the line, w(s) the span.
  const u = (span0 / (rho * rho)) * (coshR0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
  return { along: u / distance, span: (span0 * coshR0) / Math.cosh(rho * s + r0) };
}
