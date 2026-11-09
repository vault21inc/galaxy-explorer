import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  CustomBlending,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  type Mesh,
  type ShaderMaterial,
} from 'three';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { bake } from '../bake/bake.ts';
import { bakeCache } from '../bake/bake-cache.ts';
import type { RendererProps } from '../renderer-types.ts';
import { publishDrawn } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { useMovePreview } from '../use-move-preview.ts';
import { REGION_BILLBOARD_MAX_PX, REGION_BILLBOARD_MIN_PX, REGION_SPRITE_PX } from '../tuning.ts';
import { buildRegionBuffers } from './region-buffers.ts';
import { regionSpriteDefinition, regionSpriteKey } from './region-sprite.ts';

export const REGION_CLOUD = 'region-cloud';

/**
 * Nebulae and anomalies (rendering.md §6): every region's billboards in one draw call.
 *
 * Blending: nebulae should add light, anomalies should cover what's behind them, and one draw
 * call can only use one blend mode. Premultiplied-alpha blending does both: the GPU computes
 * `result = source + destination × (1 − source alpha)`. With alpha 0 that's pure addition (a
 * nebula); with alpha 1 it's ordinary covering (an anomaly). Each billboard picks per instance.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uWorldPerPxAt1;
  uniform float uMinPx;
  uniform float uMaxPx;
  attribute vec3 aCenter;
  attribute float aSize;
  attribute vec4 aColor;
  attribute float aAdditive;
  attribute float aRotation;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vAdditive;
  void main() {
    vec4 centerView = viewMatrix * vec4(aCenter, 1.0);
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    float size = clamp(aSize, uMinPx * worldPerPx, uMaxPx * worldPerPx);
    // The quad's corner (±1, ±1), turned by the billboard's rotation, then laid out in view
    // space so it always faces the camera.
    float c = cos(aRotation);
    float s = sin(aRotation);
    vec2 corner = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
    centerView.xy += corner * size;
    vUv = uv;
    vColor = aColor;
    vAdditive = aAdditive;
    gl_Position = projectionMatrix * centerView;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uSprite;
  varying vec2 vUv;
  varying vec4 vColor;
  varying float vAdditive;
  void main() {
    float alpha = texture2D(uSprite, vUv).r * vColor.a;
    gl_FragColor = vec4(vColor.rgb, 1.0);
    #include <colorspace_fragment>
    // Premultiply after the color-space conversion, then choose adding (alpha 0) or covering.
    gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha * (1.0 - vAdditive));
  }
`;

export function RegionCloud({ objects }: RendererProps) {
  const gl = useThree((state) => state.gl);
  const policy = useSpoilerPolicy();
  const buffers = useMemo(
    () => buildRegionBuffers(objects, policy, REGION_CLOUD),
    [objects, policy],
  );

  const geometry = useMemo(() => {
    const quad = new PlaneGeometry(2, 2);
    const instanced = new InstancedBufferGeometry();
    instanced.setIndex(quad.getIndex());
    instanced.setAttribute('position', quad.getAttribute('position'));
    instanced.setAttribute('uv', quad.getAttribute('uv'));
    instanced.setAttribute('aCenter', new InstancedBufferAttribute(buffers.centers, 3));
    instanced.setAttribute('aSize', new InstancedBufferAttribute(buffers.sizes, 1));
    instanced.setAttribute('aColor', new InstancedBufferAttribute(buffers.colors, 4));
    instanced.setAttribute('aAdditive', new InstancedBufferAttribute(buffers.additive, 1));
    instanced.setAttribute('aRotation', new InstancedBufferAttribute(buffers.rotations, 1));
    instanced.instanceCount = buffers.count;
    quad.dispose();
    return instanced;
  }, [buffers]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  // A copy of the centers: the attribute's array is shifted in place during a move preview.
  const baseCenters = useMemo(() => buffers.centers.slice(), [buffers]);
  const mesh = useRef<Mesh<InstancedBufferGeometry>>(null);
  useMovePreview(mesh, buffers.ranges, baseCenters);

  useEffect(() => {
    publishDrawn(REGION_CLOUD, buffers.drawn);
    return () => {
      publishDrawn(REGION_CLOUD, null);
    };
  }, [buffers]);

  const uniforms = useMemo(() => {
    const sprite = bakeCache.get(regionSpriteKey(REGION_SPRITE_PX), () =>
      bake(gl, regionSpriteDefinition, REGION_SPRITE_PX, REGION_SPRITE_PX),
    );
    return {
      uSprite: { value: sprite.texture },
      uWorldPerPxAt1: { value: 1 },
      uMinPx: { value: REGION_BILLBOARD_MIN_PX },
      uMaxPx: { value: REGION_BILLBOARD_MAX_PX },
    };
  }, [gl]);
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
  });

  if (buffers.count === 0) return null;
  return (
    // Drawn after the background's stars, without writing depth: clouds never hide what's
    // behind them from the depth test. Culling is off, as for the bodies.
    <mesh ref={mesh} geometry={geometry} frustumCulled={false} renderOrder={4}>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={CustomBlending}
        blendSrc={OneFactor}
        blendDst={OneMinusSrcAlphaFactor}
      />
    </mesh>
  );
}
