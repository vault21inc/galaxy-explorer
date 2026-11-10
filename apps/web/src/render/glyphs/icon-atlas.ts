import type { BaseType } from '@ge/domain';
import type { BakeDefinition } from '../bake/bake.ts';

/** The icons baked, left to right. M6-T4's icon set replaces these built-in shapes (D-28). */
export const ICON_CELLS: Partial<Record<BaseType, number>> = { station: 0, marker: 1 };
export const ICON_COUNT = 2;

/**
 * Small built-in icons for stations and markers, baked once into one atlas (rendering.md §9),
 * white on transparent so each is tinted when drawn:
 * - **station:** a ring with a hub and four spokes, like an orbital station seen from above;
 * - **marker:** a diamond, outlined, with a solid center.
 * A dark outline around each keeps it readable over the bright galaxy.
 */
const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  // A line of 'width' around the set where 'distance' is 0, antialiased by about a pixel.
  float stroke(float distance, float width) {
    return 1.0 - smoothstep(width * 0.5, width * 0.5 + 0.02, abs(distance));
  }

  void main() {
    float cell = floor(vUv.x * 2.0);
    vec2 p = vec2(fract(vUv.x * 2.0), vUv.y) * 2.0 - 1.0;
    float shape = 0.0;
    float outline = 0.0;
    if (cell < 0.5) {
      // Station: a ring, a hub, and four spokes between them.
      float r = length(p);
      float ring = stroke(r - 0.62, 0.16);
      float hub = 1.0 - smoothstep(0.16, 0.2, r);
      float spokes = max(stroke(p.x, 0.1), stroke(p.y, 0.1)) * step(r, 0.62);
      shape = max(max(ring, hub), spokes);
      outline = max(stroke(r - 0.62, 0.34), 1.0 - smoothstep(0.26, 0.3, r));
    } else {
      // Marker: a diamond (|x| + |y| = const), outlined, with a solid center.
      float d = abs(p.x) + abs(p.y);
      shape = max(stroke(d - 0.66, 0.18), 1.0 - smoothstep(0.26, 0.3, d));
      outline = max(stroke(d - 0.66, 0.36), 1.0 - smoothstep(0.36, 0.4, d));
    }
    // White shape in red; coverage (shape plus its dark outline) in alpha.
    gl_FragColor = vec4(shape, shape, shape, max(shape, outline * 0.8));
  }
`;

export const iconAtlasDefinition: BakeDefinition = {
  fragmentShader: FRAGMENT_SHADER,
  uniforms: {},
};
export const iconAtlasKey = (cellPx: number) => `icons:${cellPx.toString()}`;
