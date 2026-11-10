import type { GalaxyObject } from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from 'three';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { bake } from '../bake/bake.ts';
import { bakeCache } from '../bake/bake-cache.ts';
import type { RendererProps } from '../renderer-types.ts';
import {
  SYSTEM_GLYPH_CELL_PX,
  SYSTEM_GLYPH_EXTENT,
  SYSTEM_STAR_MAX_PX,
  SYSTEM_STAR_MIN_PX,
} from '../tuning.ts';
import { buildSystemGlyphBuffers } from './system-glyph-buffers.ts';
import {
  SYSTEM_ATLAS_COLUMNS,
  SYSTEM_ATLAS_ROWS,
  systemGlyphAtlasDefinition,
  systemGlyphAtlasKey,
} from './system-glyph-atlas.ts';
import { CLAMP_RADIUS_GLSL, ghostMaterialProps, useGlyphQuads } from './use-glyph-quads.ts';

export const SYSTEM_GLYPHS = 'system-glyphs';

/**
 * Systems in the galaxy view (D-28, D-29): a star (or a pair, or three) with faint orbit rings,
 * a dot for each planet. Every system in one draw call: camera-facing quads that each show a
 * cell of the baked atlas (system-glyph-atlas.ts).
 *
 * The star's on-screen radius is clamped like the old spheres (SYSTEM_STAR_MIN/MAX_PX), and
 * the quad reaches SYSTEM_GLYPH_EXTENT times further to fit the rings.
 */
const VERTEX_SHADER = /* glsl */ `
  ${CLAMP_RADIUS_GLSL}
  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uExtent;
  uniform vec2 uGrid;
  attribute vec3 aCenter;
  attribute float aRadius;
  attribute vec2 aCell;
  attribute float aRotation;
  attribute float aState;
  attribute vec3 aStar1;
  attribute vec3 aStar2;
  attribute vec3 aStar3;
  attribute vec3 aRing;
  varying vec2 vUv;
  varying vec3 vStar1;
  varying vec3 vStar2;
  varying vec3 vStar3;
  varying vec3 vRing;
  varying float vState;
  void main() {
    // modelViewMatrix: the mesh's own transform (identity, except for the placement ghost,
    // whose group follows the pointer) and then the camera's.
    vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
    float radius = clampedRadius(centerView, aRadius, uMinPx, uMaxPx) * uExtent;
    // Turn the corner by the glyph's own angle, then lay it out facing the camera.
    float c = cos(aRotation);
    float s = sin(aRotation);
    vec2 corner = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
    centerView.xy += corner * radius;
    // This glyph's cell in the atlas: the quad's 0–1 coordinates inside it.
    vUv = (aCell + uv) / uGrid;
    vStar1 = aStar1;
    vStar2 = aStar2;
    vStar3 = aStar3;
    vRing = aRing;
    vState = aState;
    gl_Position = projectionMatrix * centerView;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vStar1;
  varying vec3 vStar2;
  varying vec3 vStar3;
  varying vec3 vRing;
  varying float vState;
  void main() {
    // Drafts are see-through, as for the other bodies: every other pixel is skipped.
    if (vState > 1.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
    // Each channel is one star's light (or, in alpha, the rings); give each its own color.
    vec4 cell = texture2D(uAtlas, vUv);
    vec3 light = cell.r * vStar1 + cell.g * vStar2 + cell.b * vStar3 + cell.a * vRing;
    float coverage = clamp(max(max(cell.r, cell.g), max(cell.b, cell.a)), 0.0, 1.0);
    gl_FragColor = vec4(light, 1.0);
    #include <colorspace_fragment>
    // The light is already scaled by coverage (premultiplied): the glyph covers what's behind
    // it as much as it shines, so stars over the bright galaxy core stay readable.
    gl_FragColor = vec4(gl_FragColor.rgb, coverage * 0.85) * uOpacity;
  }
`;

export function SystemGlyphs({ objects, ghost = false }: RendererProps) {
  const gl = useThree((state) => state.gl);
  const policy = useSpoilerPolicy();
  const buffers = useMemo(
    // The galaxy payload's objects carry the glyph fields (GalaxyObject).
    () => buildSystemGlyphBuffers(objects as readonly GalaxyObject[], policy, SYSTEM_GLYPHS),
    [objects, policy],
  );
  const { geometry, mesh, material } = useGlyphQuads(SYSTEM_GLYPHS, buffers, ghost);

  const uniforms = useMemo(() => {
    // Baked once for the page, kept by the cache (rendering.md §9).
    const atlas = bakeCache.get(systemGlyphAtlasKey(SYSTEM_GLYPH_CELL_PX), () =>
      bake(
        gl,
        systemGlyphAtlasDefinition,
        SYSTEM_GLYPH_CELL_PX * SYSTEM_ATLAS_COLUMNS,
        SYSTEM_GLYPH_CELL_PX * SYSTEM_ATLAS_ROWS,
      ),
    );
    return {
      uAtlas: { value: atlas.texture },
      uWorldPerPxAt1: { value: 1 },
      uOpacity: { value: ghostMaterialProps(ghost).opacity },
      uMinPx: { value: SYSTEM_STAR_MIN_PX },
      uMaxPx: { value: SYSTEM_STAR_MAX_PX },
      uExtent: { value: SYSTEM_GLYPH_EXTENT },
      uGrid: { value: [SYSTEM_ATLAS_COLUMNS, SYSTEM_ATLAS_ROWS] },
    };
  }, [gl, ghost]);

  if (buffers.ids.length === 0) return null;
  return (
    // Drawn after the background, without writing depth, and with culling off: the shader
    // places every quad, and three.js can't judge the instances' bounds.
    <mesh
      ref={mesh}
      geometry={geometry}
      frustumCulled={false}
      renderOrder={ghostMaterialProps(ghost).renderOrder}
    >
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthTest={ghostMaterialProps(ghost).depthTest}
        depthWrite={false}
        blending={CustomBlending}
        blendSrc={OneFactor}
        blendDst={OneMinusSrcAlphaFactor}
      />
    </mesh>
  );
}
