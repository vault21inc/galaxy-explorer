import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';

/**
 * three's `LineMaterial` draws each line segment as a screen-facing quad, so lines keep a width
 * in pixels at any distance, which WebGL's own lines can't. It has one width for the whole
 * draw, though, and each group may set its own (GroupStyle.lineWidthPx).
 *
 * So this adds a per-segment `instanceWidth` attribute and multiplies it in where the vertex
 * shader scales the quad's sideways offset by `linewidth` (`offset *= linewidth`); the uniform
 * stays 1. In pixel mode (not `worldUnits`) the fragment shader doesn't use the width, so this
 * one line is the whole change. Every group's outline still goes in one draw call.
 */
export function perSegmentWidthLineMaterial(dashed: boolean): LineMaterial {
  const material = new LineMaterial({
    linewidth: 1,
    vertexColors: true,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    dashed,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        'attribute vec3 instanceStart;',
        'attribute vec3 instanceStart;\nattribute float instanceWidth;',
      )
      .replace('offset *= linewidth;', 'offset *= linewidth * instanceWidth;');
  };
  // Shares the compiled program between the solid and dashed materials' own variants only.
  material.customProgramCacheKey = () => `per-segment-width-${String(dashed)}`;
  return material;
}
