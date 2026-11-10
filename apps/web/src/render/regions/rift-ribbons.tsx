import { pointsAlong, polylineLength, type ViewObject } from '@ge/domain';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, type RefObject } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  CustomBlending,
  DoubleSide,
  OneFactor,
  OneMinusSrcAlphaFactor,
  type InstancedBufferGeometry,
  type Mesh,
} from 'three';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { bake } from '../bake/bake.ts';
import { bakeCache } from '../bake/bake-cache.ts';
import { bodyState } from '../bodies/body-buffers.ts';
import { hexToLinear } from '../color.ts';
import {
  DEFAULT_REGION_STYLE,
  REDACTION_COLOR,
  REGION_SPRITE_PX,
  REGION_STYLES,
  RIFT_RIBBON_OPACITY,
} from '../tuning.ts';
import { useMovePreview } from '../use-move-preview.ts';
import { regionSpriteDefinition, regionSpriteKey } from './region-sprite.ts';
import { resolvedRegion, riftCurve } from './region-shape.ts';

/**
 * The flat band of every rift (M4-T6, rendering.md §6), such as the Great Rift, in one merged
 * mesh: one draw call for all of them. Each rift is a strip of triangles along its curve, as wide
 * as its band, in the plane of its object. The strip fades toward its edges and is broken up by
 * the region sprite's soft noise, so it reads as a band of cloud, not a ribbon. The billboards
 * along the curve are RegionCloud's.
 */
const VERTEX_SHADER = /* glsl */ `
  attribute vec3 aCenter;
  attribute vec2 aBand;
  attribute vec4 aColor;
  attribute float aAdditive;
  varying vec2 vBand;
  varying vec4 vColor;
  varying float vAdditive;
  void main() {
    vBand = aBand;
    vColor = aColor;
    vAdditive = aAdditive;
    // aCenter is the vertex's position: named so the move preview can shift it (M3-T3).
    gl_Position = projectionMatrix * viewMatrix * vec4(aCenter, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uSprite;
  varying vec2 vBand;
  varying vec4 vColor;
  varying float vAdditive;
  void main() {
    // vBand.x runs along the rift in half-widths, vBand.y across it from -1 to 1.
    float across = abs(vBand.y);
    float falloff = exp(-across * across * 2.5) * (1.0 - smoothstep(0.8, 1.0, across));
    // The sprite, sampled in overlapping tiles along the band, adds patchy density.
    float cloud = texture2D(uSprite, vec2(fract(vBand.x * 0.13), vBand.y * 0.5 + 0.5)).r;
    float alpha = falloff * (0.45 + 0.55 * cloud) * vColor.a;
    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(vColor.rgb, 1.0);
    #include <colorspace_fragment>
    gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha * (1.0 - vAdditive));
  }
`;

export function RiftRibbons({ objects }: { objects: readonly ViewObject[] }) {
  const gl = useThree((state) => state.gl);
  const policy = useSpoilerPolicy();

  const built = useMemo(() => {
    const strips = objects.map((object) => {
      const region = resolvedRegion(object);
      const curve = riftCurve(object, region);
      // Evenly by length, about two samples per half-width, so the band bends smoothly.
      const samples = Math.max(
        2,
        Math.min(512, Math.ceil(polylineLength(curve) / region.radius) * 2),
      );
      return { object, region, along: pointsAlong(curve, samples) };
    });
    const vertexCount = strips.reduce((sum, strip) => sum + strip.along.length * 2, 0);
    const centers = new Float32Array(vertexCount * 3);
    const band = new Float32Array(vertexCount * 2);
    const colors = new Float32Array(vertexCount * 4);
    const additive = new Float32Array(vertexCount);
    const index: number[] = [];
    const ranges = new Map<string, readonly [number, number]>();
    let vertex = 0;
    for (const { object, region, along } of strips) {
      const state = bodyState(object, policy);
      const style = REGION_STYLES[object.baseType] ?? DEFAULT_REGION_STYLE;
      const redacted = state === 'redacted';
      const [r, g, b] = hexToLinear(redacted ? REDACTION_COLOR : (region.color ?? REDACTION_COLOR));
      const tint = redacted ? 1 : style.tint;
      const opacity =
        RIFT_RIBBON_OPACITY * (0.6 + 0.8 * region.density) * (state === 'draft' ? 0.55 : 1);
      const y = object.position[1];
      const first = vertex;
      let travelled = 0;
      for (const [k, { point, tangent }] of along.entries()) {
        if (k > 0) {
          const previous = along[k - 1]?.point ?? point;
          travelled += Math.hypot(point[0] - previous[0], point[1] - previous[1]);
        }
        // The two edges: the curve's point pushed sideways (perpendicular to its tangent).
        for (const side of [-1, 1]) {
          centers.set(
            [
              point[0] - tangent[1] * region.radius * side,
              y,
              point[1] + tangent[0] * region.radius * side,
            ],
            vertex * 3,
          );
          band.set([travelled / region.radius, side], vertex * 2);
          colors.set([r * tint, g * tint, b * tint, opacity], vertex * 4);
          additive[vertex] = style.additive && !redacted ? 1 : 0;
          vertex++;
        }
        if (k > 0) {
          // Two triangles between this pair of edge points and the previous pair.
          const a = vertex - 4;
          index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      ranges.set(object.id, [first, vertex - first]);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('aCenter', new BufferAttribute(centers, 3));
    // three needs a `position` to size and draw the mesh: the same numbers.
    geometry.setAttribute('position', new BufferAttribute(centers.slice(), 3));
    geometry.setAttribute('aBand', new BufferAttribute(band, 2));
    geometry.setAttribute('aColor', new BufferAttribute(colors, 4));
    geometry.setAttribute('aAdditive', new BufferAttribute(additive, 1));
    geometry.setIndex(index);
    return { geometry, ranges, baseCenters: centers.slice(), vertexCount };
  }, [objects, policy]);

  useEffect(
    () => () => {
      built.geometry.dispose();
    },
    [built],
  );

  // The move preview shifts `aCenter` per vertex, as it does per instance elsewhere.
  const mesh = useRef<Mesh>(null);
  useMovePreview(
    mesh as unknown as RefObject<Mesh<InstancedBufferGeometry> | null>,
    built.ranges,
    built.baseCenters,
  );

  const uniforms = useMemo(() => {
    const sprite = bakeCache.get(regionSpriteKey(REGION_SPRITE_PX), () =>
      bake(gl, regionSpriteDefinition, REGION_SPRITE_PX, REGION_SPRITE_PX),
    );
    return { uSprite: { value: sprite.texture } };
  }, [gl]);

  if (built.vertexCount === 0) return null;
  return (
    <mesh ref={mesh} geometry={built.geometry} frustumCulled={false} renderOrder={4}>
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        // Flat in the galactic plane, like the disc and the group fills: drawn over the disc by
        // order, not by depth, which would fight it.
        depthTest={false}
        depthWrite={false}
        side={DoubleSide}
        forceSinglePass
        blending={CustomBlending}
        blendSrc={OneFactor}
        blendDst={OneMinusSrcAlphaFactor}
      />
    </mesh>
  );
}
