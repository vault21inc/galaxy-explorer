import type { BakeDefinition } from '../bake/bake.ts';

/** Viewing elevations baked, side by side: 0° (edge-on), 30°, 60° and 90° (from above). */
export const BLACK_HOLE_ELEVATIONS = 4;

/**
 * A black hole as NASA's visualization shows it (D-28): an accretion disc of hot gas around a
 * black shadow, its light bent by gravity. Baked once per viewing elevation into one atlas
 * (rendering.md §9); an approximation built from a few shapes, not a ray-traced simulation.
 *
 * Coordinates: `p` runs from −1 to 1 across a cell, +y up on screen. The parts, as in the
 * diagram:
 * - **the shadow:** a black disc at the center, about twice the event horizon;
 * - **the photon ring:** a thin bright circle hugging the shadow;
 * - **the disc** (the "primary image"): an annulus in the galactic plane. Seen at elevation e it's
 *   an ellipse squashed vertically by sin(e). Its near half passes in front of the shadow, its
 *   far half is hidden behind it;
 * - **the far side's image:** gravity bends light from the far side up over the shadow, so an arch
 *   rises above it. It's strongest edge-on and blends into the ring seen from above;
 * - **the underside's image:** a fainter arc below, the disc's underside lensed the same way;
 * - **Doppler beaming:** gas moving toward us (the left side here) is brighter. Seen from above
 *   nothing moves toward us, so it fades out with the elevation.
 *
 * The cell stores the light (red channel) and how much it covers what's behind (alpha): 1 in
 * the shadow, so a black hole blacks out the stars behind it.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  #define PI 3.141592653589793
  varying vec2 vUv;

  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  // Streaks along the orbit: noise stretched around the circle, fine across the radius.
  float streaks(float radius, float angle) {
    return 0.55 + 0.45 * noise(vec2(radius * 26.0, angle * 3.0)) * noise(vec2(radius * 61.0, angle * 7.0 + 3.1));
  }

  void main() {
    float cell = floor(vUv.x * 4.0);
    vec2 p = vec2(fract(vUv.x * 4.0), vUv.y) * 2.0 - 1.0;
    float elevation = cell * PI / 6.0;
    float openness = max(sin(elevation), 0.06);   // edge-on, the disc is a thin line
    float edgeOn = 1.0 - sin(elevation);          // 1 edge-on, 0 from above

    float shadowRadius = 0.2;
    float d = length(p);
    float shadow = 1.0 - smoothstep(shadowRadius - 0.008, shadowRadius + 0.008, d);
    float side = p.x / max(d, 1e-3);              // −1 left … 1 right

    // The disc's primary image: in disc coordinates, unsquash the vertical axis.
    vec2 q = vec2(p.x, p.y / openness);
    float r = length(q);
    float disc = smoothstep(0.3, 0.36, r) * (1.0 - smoothstep(0.72, 0.98, r));
    disc *= 1.7 - 1.3 * smoothstep(0.3, 0.98, r);                 // hotter inside
    disc *= streaks(r, atan(q.y, q.x));
    disc *= 1.0 - 0.55 * edgeOn * (q.x / max(r, 1e-3));         // Doppler beaming
    // The far half (above the center) is behind the shadow.
    float far = step(0.0, p.y);
    disc *= 1.0 - shadow * far;

    // The far side's image: an arch over the shadow.
    float above = smoothstep(-0.1, 0.35, p.y / max(d, 1e-3));
    float arch = smoothstep(shadowRadius * 1.1, shadowRadius * 1.4, d)
               * (1.0 - smoothstep(shadowRadius * 2.3, shadowRadius * 3.1, d))
               * above * edgeOn;
    arch *= streaks(d * 1.3, atan(p.y, p.x)) * (1.0 - 0.45 * side);

    // The underside's image: a thinner, fainter arc below.
    float below = smoothstep(-0.05, 0.4, -p.y / max(d, 1e-3));
    float under = smoothstep(shadowRadius * 1.04, shadowRadius * 1.14, d)
                * (1.0 - smoothstep(shadowRadius * 1.5, shadowRadius * 1.9, d))
                * below * edgeOn * 0.5;

    // The photon ring: a thin, bright circle just outside the shadow.
    float ring = exp(-pow((d - shadowRadius * 1.04) / 0.009, 2.0)) * 0.9;

    // The near half of the disc passes in front of everything else.
    float nearDisc = disc * (1.0 - far);
    float behind = (arch + under + ring) * (1.0 - shadow) * (1.0 - clamp(nearDisc, 0.0, 1.0));
    float light = clamp((disc + behind) * 0.7, 0.0, 1.0);
    float coverage = clamp(max(shadow, light * 1.2), 0.0, 1.0);
    gl_FragColor = vec4(light, light, light, coverage);
  }
`;

export const blackHoleAtlasDefinition: BakeDefinition = {
  fragmentShader: FRAGMENT_SHADER,
  uniforms: {},
};

export const blackHoleAtlasKey = (cellPx: number) => `black-holes:${cellPx.toString()}`;

/**
 * Which two baked elevations to blend for a view, and how much of the second (0–1): `sinUp` is
 * the sine of the camera's elevation above the galactic plane, as the vertex shader computes
 * it. Mirrors the shader, for the unit tests.
 */
export function elevationBlend(sinUp: number): { first: number; second: number; weight: number } {
  const elevation = Math.asin(Math.min(Math.max(Math.abs(sinUp), 0), 1));
  const position = (elevation / (Math.PI / 2)) * (BLACK_HOLE_ELEVATIONS - 1);
  const first = Math.min(Math.floor(position), BLACK_HOLE_ELEVATIONS - 2);
  return { first, second: first + 1, weight: position - first };
}
