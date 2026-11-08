import { GALAXY_SHAPE, type ResolvedGalaxySettings } from '@ge/domain';
import { Vector3 } from 'three';
import type { BakeDefinition } from '../bake/bake.ts';
import { hexToLinear } from '../color.ts';
import { GALAXY_DISC_EXTENT_RADII, GALAXY_DISC_NOISE_AMOUNT } from '../tuning.ts';

/**
 * The galaxy disc seen from above (rendering.md §6, §9), baked once per settings. It draws
 * the same density the stars are sampled from (`sampleGalaxyPosition` in @ge/domain): an
 * exponential disc whose light gathers along logarithmic spiral arms, plus a central bulge.
 * Keep the two in step: GALAXY_SHAPE holds the constants both use.
 *
 * All lengths in the shader are in galaxy radii, so one shader fits every galaxy size.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  #define PI 3.141592653589793
  #define MAX_ARMS 8

  uniform float uExtent;       // half-width of the texture, in radii
  uniform float uArms;         // 0 for an elliptical galaxy
  uniform float uTwist;        // turns of the spiral from armStart to the edge
  uniform float uSpread;       // arm width, as in the sampler
  uniform float uBulge;        // bulge radius, in radii
  uniform float uArmStart;
  uniform float uScaleLength;
  uniform float uBulgeSigma;
  uniform float uNoiseAmount;
  uniform float uSeed;
  uniform vec3 uCore;
  uniform vec3 uArm;
  uniform vec3 uDust;
  varying vec2 vUv;

  // Value noise: random values on a grid, smoothly interpolated. Fine here because it runs
  // once per texel at bake time, never per frame.
  float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21) + uSeed);
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
  // Fractal noise: four layers of noise, each twice as fine and half as strong.
  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 4; octave++) {
      sum += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return sum;
  }

  // The shortest signed angle from b to a, in (-PI, PI].
  float angleBetween(float a, float b) {
    return mod(a - b + PI, 2.0 * PI) - PI;
  }

  // How close (x, z) is to an arm: 1 on an arm's center line, falling off like the sampler's
  // Gaussian scatter. 'shift' moves the arms around the center, for the dust lanes.
  float armDensity(float r, float theta, float sigma, float shift) {
    // The sampler's spiral: the same angle for each doubling of the radius, normalized so the
    // arm makes uTwist turns between armStart and the edge.
    float progress = log(1.0 + r / uArmStart) / log(1.0 + 1.0 / uArmStart);
    float sum = 0.0;
    for (int k = 0; k < MAX_ARMS; k++) {
      if (float(k) >= uArms) break;
      float center = float(k) * 2.0 * PI / uArms + progress * uTwist * 2.0 * PI + shift;
      float d = angleBetween(theta, center) / sigma;
      sum += exp(-0.5 * d * d);
    }
    return min(sum, 1.0);
  }

  void main() {
    // Texture coordinates to the galactic plane. The disc mesh lies in the X/Z plane, and its
    // texture's v axis runs along -Z (a plane rotated -90° about X), hence the minus sign.
    float x = (vUv.x * 2.0 - 1.0) * uExtent;
    float z = -(vUv.y * 2.0 - 1.0) * uExtent;
    float r = length(vec2(x, z));
    float theta = atan(z, x);

    // The disc: exponential falloff, faded smoothly to nothing at the edge.
    float disc = exp(-r / uScaleLength) * (1.0 - smoothstep(0.8, 1.05, r));

    float arms = 1.0;
    float dust = 0.0;
    if (uArms > 0.0) {
      float sigma = max(uSpread * PI / uArms, 0.02);
      arms = armDensity(r, theta, sigma, 0.0);
      // Dust lanes run along the inner edge of each arm: a narrower band, slightly behind.
      dust = armDensity(r, theta, sigma * 0.45, -sigma * 0.9) * smoothstep(0.08, 0.3, r);
    }

    // Mottling: star-forming clumps along the arms, and patchy dust.
    vec2 p = vec2(x, z) * 9.0;
    float clumps = fbm(p);
    float patches = fbm(p * 0.5 + 17.0);

    float armLight = disc * (0.07 + 0.93 * arms);
    armLight *= (1.0 - uNoiseAmount) + uNoiseAmount * 2.0 * clumps;
    float dustAmount = clamp(dust * (0.5 + patches), 0.0, 1.0) * 0.85;

    // The bulge: a Gaussian ball, as in the sampler.
    float bulgeSigma = max(uBulge * uBulgeSigma, 1e-4);
    float bulge = exp(-0.5 * (r * r) / (bulgeSigma * bulgeSigma));

    // Colors blend from the core color in the middle to the arm color outside it; dust darkens
    // the light and tints what's left toward the dust color.
    vec3 light = mix(uArm, uCore, smoothstep(uBulge * 2.0, 0.0, r)) * armLight * 1.1;
    light = mix(light, light * uDust * 2.0, dustAmount);
    light *= 1.0 - dustAmount * 0.75;
    light += uCore * bulge * 0.55;

    // Stored as the square root of linear light: 8 bits per channel would band in the dim
    // outer disc otherwise. The disc's draw shader squares it back.
    gl_FragColor = vec4(sqrt(clamp(light, 0.0, 1.0)), 1.0);
  }
`;

/** Normalized for the shader: every length in radii, colors in linear light. */
export function discBakeDefinition(settings: ResolvedGalaxySettings): BakeDefinition {
  const vector = (hex: string) => new Vector3(...hexToLinear(hex));
  return {
    fragmentShader: FRAGMENT_SHADER,
    uniforms: {
      uExtent: { value: GALAXY_DISC_EXTENT_RADII },
      uArms: { value: settings.arms },
      uTwist: { value: settings.armTwist },
      uSpread: { value: settings.armSpread },
      uBulge: { value: settings.bulgeRadiusLy / settings.radiusLy },
      uArmStart: { value: GALAXY_SHAPE.armStart },
      uScaleLength: { value: GALAXY_SHAPE.discScaleLength },
      uBulgeSigma: { value: GALAXY_SHAPE.bulgeSigma },
      uNoiseAmount: { value: GALAXY_DISC_NOISE_AMOUNT },
      // Keeps the noise pattern different per galaxy but stable per seed.
      uSeed: { value: (settings.seed % 1_000) / 1_000 },
      uCore: { value: vector(settings.colors.core) },
      uArm: { value: vector(settings.colors.arm) },
      uDust: { value: vector(settings.colors.dust) },
    },
  };
}

/** The bake cache key: everything that changes the baked pixels. */
export function discBakeKey(settings: ResolvedGalaxySettings, sizePx: number): string {
  const { thicknessLy: _thickness, ...shape } = settings;
  return `galaxy-disc:${sizePx.toString()}:${JSON.stringify(shape)}`;
}
