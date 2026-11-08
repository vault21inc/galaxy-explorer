import type { BakeDefinition } from '../bake/bake.ts';

/**
 * The soft-noise sprite every region billboard uses (rendering.md §9): a round, cloudy blot,
 * baked once. Grey levels only; the region's color is applied when drawing.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
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
  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int octave = 0; octave < 5; octave++) {
      sum += amplitude * noise(p);
      p *= 2.1;
      amplitude *= 0.5;
    }
    return sum;
  }

  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    // A smooth round falloff, so the square billboard never shows its corners.
    float falloff = 1.0 - smoothstep(0.2, 1.0, length(p));
    float cloud = smoothstep(0.25, 0.85, fbm(vUv * 5.0));
    gl_FragColor = vec4(vec3(falloff * cloud), 1.0);
  }
`;

export const regionSpriteDefinition: BakeDefinition = {
  fragmentShader: FRAGMENT_SHADER,
  uniforms: {},
};

export const regionSpriteKey = (sizePx: number) => `region-sprite:${sizePx.toString()}`;
