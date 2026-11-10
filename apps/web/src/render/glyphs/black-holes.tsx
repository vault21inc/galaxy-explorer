import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from 'three';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { bake } from '../bake/bake.ts';
import { bakeCache } from '../bake/bake-cache.ts';
import type { RendererProps } from '../renderer-types.ts';
import {
  BLACK_HOLE_CELL_PX,
  BLACK_HOLE_EXTENT,
  BLACK_HOLE_MAX_PX,
  BLACK_HOLE_MIN_PX,
} from '../tuning.ts';
import {
  BLACK_HOLE_ELEVATIONS,
  blackHoleAtlasDefinition,
  blackHoleAtlasKey,
} from './black-hole-atlas.ts';
import { buildBlackHoleBuffers } from './black-hole-buffers.ts';
import { CLAMP_RADIUS_GLSL, ghostMaterialProps, useGlyphQuads } from './use-glyph-quads.ts';

export const BLACK_HOLES = 'black-holes';

/**
 * Black holes in the galaxy view (D-28): a lensed accretion disc after NASA's visualization,
 * every black hole in one draw call.
 *
 * The disc lies in the galactic plane, so how it looks depends on where the camera is:
 * - **how open it looks:** the camera's elevation above the plane. The vertex shader turns the
 *   plane's "up" (world +Y) into view space; its z part is the sine of that elevation (1 looking
 *   straight down, 0 edge-on). The atlas holds four elevations; the two nearest are blended;
 * - **which way it lies on screen:** the same vector's x and y point to where "up out of the
 *   plane" appears on screen. The quad is turned so the image's top (the far side's arch) points
 *   that way. Seen from below the plane, the vector is flipped, so the arch still rises away
 *   from the disc toward the camera's side.
 */
const VERTEX_SHADER = /* glsl */ `
  ${CLAMP_RADIUS_GLSL}
  uniform float uMinPx;
  uniform float uMaxPx;
  uniform float uExtent;
  attribute vec3 aCenter;
  attribute float aRadius;
  attribute vec3 aColor;
  attribute float aState;
  varying vec2 vUvFirst;
  varying vec2 vUvSecond;
  varying float vWeight;
  varying vec3 vColor;
  varying float vState;
  void main() {
    // modelViewMatrix: the mesh's own transform (identity, except for the placement ghost,
    // whose group follows the pointer) and then the camera's.
    vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
    float radius = clampedRadius(centerView, aRadius, uMinPx, uMaxPx) * uExtent;

    // The galactic plane's normal in view space, on the camera's side of the plane.
    vec3 normal = mat3(viewMatrix) * vec3(0.0, 1.0, 0.0);
    if (normal.z < 0.0) normal = -normal;
    // Its on-screen direction: where the image's top goes. Looking straight down it has no
    // direction (the image is a ring then), so any will do.
    vec2 up = length(normal.xy) > 1e-4 ? normalize(normal.xy) : vec2(0.0, 1.0);
    vec2 right = vec2(up.y, -up.x);
    centerView.xy += (position.x * right + position.y * up) * radius;

    // The two baked elevations around this one, and how far between them (elevationBlend()).
    float elevation = asin(clamp(normal.z, 0.0, 1.0));
    float cells = ${BLACK_HOLE_ELEVATIONS.toString()}.0;
    float position01 = elevation / (3.141592653589793 / 2.0) * (cells - 1.0);
    float first = min(floor(position01), cells - 2.0);
    vWeight = position01 - first;
    vUvFirst = vec2((first + uv.x) / cells, uv.y);
    vUvSecond = vec2((first + 1.0 + uv.x) / cells, uv.y);

    vColor = aColor;
    vState = aState;
    gl_Position = projectionMatrix * centerView;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uOpacity;
  varying vec2 vUvFirst;
  varying vec2 vUvSecond;
  varying float vWeight;
  varying vec3 vColor;
  varying float vState;
  void main() {
    if (vState > 1.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
    vec4 cell = mix(texture2D(uAtlas, vUvFirst), texture2D(uAtlas, vUvSecond), vWeight);
    // The gas glows in the black hole's color, whiter where it's hottest.
    vec3 light = mix(vColor, vec3(1.0, 0.95, 0.85), cell.r * cell.r * 0.5) * cell.r * 1.6;
    gl_FragColor = vec4(light, 1.0);
    #include <colorspace_fragment>
    // Premultiplied: the light adds, the shadow (alpha 1, no light) blacks out what's behind.
    gl_FragColor = vec4(gl_FragColor.rgb, cell.a) * uOpacity;
  }
`;

export function BlackHoles({ objects, ghost = false }: RendererProps) {
  const gl = useThree((state) => state.gl);
  const policy = useSpoilerPolicy();
  const buffers = useMemo(
    () => buildBlackHoleBuffers(objects, policy, BLACK_HOLES),
    [objects, policy],
  );
  const { geometry, mesh, material } = useGlyphQuads(BLACK_HOLES, buffers, ghost);

  const uniforms = useMemo(() => {
    const atlas = bakeCache.get(blackHoleAtlasKey(BLACK_HOLE_CELL_PX), () =>
      bake(
        gl,
        blackHoleAtlasDefinition,
        BLACK_HOLE_CELL_PX * BLACK_HOLE_ELEVATIONS,
        BLACK_HOLE_CELL_PX,
      ),
    );
    return {
      uAtlas: { value: atlas.texture },
      uWorldPerPxAt1: { value: 1 },
      uOpacity: { value: ghostMaterialProps(ghost).opacity },
      uMinPx: { value: BLACK_HOLE_MIN_PX },
      uMaxPx: { value: BLACK_HOLE_MAX_PX },
      uExtent: { value: BLACK_HOLE_EXTENT },
    };
  }, [gl, ghost]);

  if (buffers.ids.length === 0) return null;
  return (
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
