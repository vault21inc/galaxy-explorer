import type { SpoilerPolicy, ViewObject } from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import { CustomBlending, OneFactor, OneMinusSrcAlphaFactor } from 'three';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { bake } from '../bake/bake.ts';
import { bakeCache } from '../bake/bake-cache.ts';
import { bodyState, BODY_STATES } from '../bodies/body-buffers.ts';
import { hexToLinear } from '../color.ts';
import { labelText } from '../labels/label-text.ts';
import type { RendererProps } from '../renderer-types.ts';
import type { DrawnObject } from '../scene-index.ts';
import { ICON_CELL_PX, ICON_MAX_PX, ICON_MIN_PX, REDACTION_COLOR } from '../tuning.ts';
import { ICON_CELLS, ICON_COUNT, iconAtlasDefinition, iconAtlasKey } from './icon-atlas.ts';
import {
  CLAMP_RADIUS_GLSL,
  ghostMaterialProps,
  useGlyphQuads,
  type GlyphBuffers,
} from './use-glyph-quads.ts';

export const ICON_SPRITES = 'icon-sprites';

const VERTEX_SHADER = /* glsl */ `
  ${CLAMP_RADIUS_GLSL}
  uniform float uMinPx;
  uniform float uMaxPx;
  attribute vec3 aCenter;
  attribute float aRadius;
  attribute float aCell;
  attribute vec3 aColor;
  attribute float aState;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vState;
  void main() {
    // modelViewMatrix: the mesh's own transform (identity, except for the placement ghost,
    // whose group follows the pointer) and then the camera's.
    vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
    centerView.xy += position.xy * clampedRadius(centerView, aRadius, uMinPx, uMaxPx);
    vUv = vec2((aCell + uv.x) / ${ICON_COUNT.toString()}.0, uv.y);
    vColor = aColor;
    vState = aState;
    gl_Position = projectionMatrix * centerView;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vColor;
  varying float vState;
  void main() {
    if (vState > 1.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
    vec4 cell = texture2D(uAtlas, vUv);
    gl_FragColor = vec4(vColor * cell.r, 1.0);
    #include <colorspace_fragment>
    // Premultiplied: the tinted shape over a dark outline that covers what's behind.
    gl_FragColor = vec4(gl_FragColor.rgb, cell.a) * uOpacity;
  }
`;

/** Per-instance data for IconSprites, and the scene index's entries. */
export function buildIconBuffers(
  objects: readonly ViewObject[],
  policy: SpoilerPolicy,
  renderer: string,
): GlyphBuffers {
  const count = objects.length;
  const centers = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const cells = new Float32Array(count);
  const colors = new Float32Array(count * 3);
  const states = new Float32Array(count);
  const ids: string[] = [];
  const drawn: DrawnObject[] = [];
  objects.forEach((object, i) => {
    const state = bodyState(object, policy);
    const color =
      state === 'redacted' ? REDACTION_COLOR : (object.appearance.color ?? REDACTION_COLOR);
    const radius = state === 'redacted' ? 0 : (object.size ?? 0);
    ids.push(object.id);
    centers.set(object.position, i * 3);
    radii[i] = radius;
    cells[i] = ICON_CELLS[object.baseType] ?? 0;
    colors.set(hexToLinear(color), i * 3);
    states[i] = BODY_STATES[state];
    drawn.push({
      id: object.id,
      renderer,
      center: object.position,
      radius,
      minRadiusPx: ICON_MIN_PX,
      maxRadiusPx: ICON_MAX_PX,
      state,
      color,
      pickPriority: 1,
      label: labelText(object, policy),
      labelPriority: object.appearance.labelPriority ?? 0,
    });
  });
  return {
    ids,
    centers,
    drawn,
    attributes: [
      { name: 'aRadius', array: radii, itemSize: 1 },
      { name: 'aCell', array: cells, itemSize: 1 },
      { name: 'aColor', array: colors, itemSize: 3 },
      { name: 'aState', array: states, itemSize: 1 },
    ],
  };
}

/**
 * Stations and markers in the galaxy view (D-28): small tinted icons, every one in one draw
 * call, from a baked atlas (icon-atlas.ts) until M6-T4's icon set replaces the shapes.
 */
export function IconSprites({ objects, ghost = false }: RendererProps) {
  const gl = useThree((state) => state.gl);
  const policy = useSpoilerPolicy();
  const buffers = useMemo(() => buildIconBuffers(objects, policy, ICON_SPRITES), [objects, policy]);
  const { geometry, mesh, material } = useGlyphQuads(ICON_SPRITES, buffers, ghost);

  const uniforms = useMemo(() => {
    const atlas = bakeCache.get(iconAtlasKey(ICON_CELL_PX), () =>
      bake(gl, iconAtlasDefinition, ICON_CELL_PX * ICON_COUNT, ICON_CELL_PX),
    );
    return {
      uAtlas: { value: atlas.texture },
      uWorldPerPxAt1: { value: 1 },
      uOpacity: { value: ghostMaterialProps(ghost).opacity },
      uMinPx: { value: ICON_MIN_PX },
      uMaxPx: { value: ICON_MAX_PX },
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
