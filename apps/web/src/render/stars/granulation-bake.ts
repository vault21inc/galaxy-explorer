import type { BakeDefinition } from '../bake/bake.ts';
import { STAR_GRANULATION_CELLS } from '../tuning.ts';

/**
 * A star's surface texture (rendering.md §7, §9): granulation, the bright convection cells
 * separated by darker lanes that cover the Sun. Baked once, shared by every star, which tints
 * it with its own color.
 *
 * The texture is equirectangular, like a world map: x is longitude, y latitude. Each texel is
 * turned back into its point on the unit sphere and the cell pattern is computed there, in 3D,
 * so there's no seam where the map's edges meet and no pinching at the poles.
 *
 * The pattern is cellular ("Worley") noise: space is cut into a grid of cubes, each holding one
 * random point; F1 is the distance to the nearest point and F2 to the second nearest. F2 − F1
 * is small near a boundary between two cells and large inside one: bright cells, dark lanes.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  const float PI = 3.141592653589793;
  const float CELLS = ${STAR_GRANULATION_CELLS.toFixed(1)};

  // A cheap, repeatable pseudo-random point in [0,1)³ for each integer cube.
  vec3 hash3(vec3 cell) {
    cell = vec3(dot(cell, vec3(127.1, 311.7, 74.7)),
                dot(cell, vec3(269.5, 183.3, 246.1)),
                dot(cell, vec3(113.5, 271.9, 124.6)));
    return fract(sin(cell) * 43758.5453123);
  }

  // F2 − F1 of cellular noise at p, checking the 27 cubes around p's own.
  float cells(vec3 p) {
    vec3 base = floor(p);
    float f1 = 8.0;
    float f2 = 8.0;
    for (int x = -1; x <= 1; x++)
    for (int y = -1; y <= 1; y++)
    for (int z = -1; z <= 1; z++) {
      vec3 cell = base + vec3(float(x), float(y), float(z));
      float d = length(cell + hash3(cell) - p);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
    return f2 - f1;
  }

  void main() {
    float longitude = (vUv.x - 0.5) * 2.0 * PI;
    float latitude = (vUv.y - 0.5) * PI;
    vec3 onSphere = vec3(cos(latitude) * cos(longitude), sin(latitude), cos(latitude) * sin(longitude));
    // CELLS around the equator: the sphere's circumference is 2π, so scale by CELLS / 2π.
    vec3 p = onSphere * CELLS / (2.0 * PI);
    // Big cells with finer ones on top, as real granulation has.
    float pattern = 0.7 * cells(p) + 0.3 * cells(p * 2.7 + 11.0);
    gl_FragColor = vec4(vec3(clamp(pattern * 1.6, 0.0, 1.0)), 1.0);
  }
`;

export const granulationDefinition: BakeDefinition = {
  fragmentShader: FRAGMENT_SHADER,
  uniforms: {},
};

export const granulationKey = (widthPx: number) => `granulation:${widthPx.toString()}`;
