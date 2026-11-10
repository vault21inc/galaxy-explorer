import {
  isHidden,
  spoilerKeys,
  type GalaxyObject,
  type SpoilerPolicy,
  type ViewObject,
} from '@ge/domain';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CustomBlending,
  DataArrayTexture,
  DoubleSide,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  LinearFilter,
  OneFactor,
  OneMinusSrcAlphaFactor,
  PlaneGeometry,
  SRGBColorSpace,
  type Mesh,
  type ShaderMaterial,
} from 'three';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { bodyState } from '../bodies/body-buffers.ts';
import { hexToLinear } from '../color.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import {
  DEFAULT_REGION_STYLE,
  REDACTION_COLOR,
  REGION_STYLES,
  STORM_DISC_MIN_PX,
  STORM_DISC_OPACITY,
  STORM_MAX_LAYERS,
  STORM_TEXTURE_PX,
} from '../tuning.ts';
import { useMovePreview } from '../use-move-preview.ts';
import { resolvedRegion } from './region-shape.ts';
import { generatedLayer, loadUploadedLayer, uploadedLayer } from './storm-layers.ts';

/**
 * Storms seen from above (M4-T6, D-25, rendering.md §6), such as the Eye of Terror: every storm
 * disc in one draw call. Each is a square lying flat in the galactic plane, textured with its
 * own layer of one texture array: a three.js `DataArrayTexture`, a stack of same-sized images
 * the shader picks from by index, so different storms need neither more textures nor more draw
 * calls. A layer is the storm's generated texture (storm-bake.ts) or its uploaded picture.
 *
 * Blending is RegionCloud's premultiplied alpha: nebula storms add light, anomalies (warp
 * storms) cover what's behind. Depth isn't written, like the galaxy disc's.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uWorldPerPxAt1;
  uniform float uMinPx;
  attribute vec3 aCenter;
  attribute float aRadius;
  attribute float aLayer;
  attribute float aRotation;
  attribute vec3 aTint;
  attribute float aAdditive;
  attribute float aOpacity;
  varying vec2 vUv;
  varying float vLayer;
  varying vec3 vTint;
  varying float vAdditive;
  varying float vOpacity;
  void main() {
    // Never smaller than uMinPx on screen, so a far storm doesn't vanish (as the bodies' clamp).
    vec4 centerView = viewMatrix * vec4(aCenter, 1.0);
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    float radius = max(aRadius, uMinPx * worldPerPx);
    // The plane's corner (±1, ±1) laid flat in the galactic plane: x stays x, y becomes z.
    vec3 world = aCenter + vec3(position.x, 0.0, position.y) * radius;
    // Turning the texture rather than the square keeps the square axis-aligned; the disc is
    // round, so the corners the turn pushes outside the texture are transparent anyway.
    float c = cos(aRotation);
    float s = sin(aRotation);
    vec2 corner = vec2(c * position.x - s * position.y, s * position.x + c * position.y);
    vUv = corner * 0.5 + 0.5;
    vLayer = aLayer;
    vTint = aTint;
    vAdditive = aAdditive;
    vOpacity = aOpacity;
    gl_Position = projectionMatrix * viewMatrix * vec4(world, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp sampler2DArray;
  uniform sampler2DArray uStorms;
  varying vec2 vUv;
  varying float vLayer;
  varying vec3 vTint;
  varying float vAdditive;
  varying float vOpacity;
  void main() {
    if (vUv.x < 0.0 || vUv.x > 1.0 || vUv.y < 0.0 || vUv.y > 1.0) discard;
    vec4 texel = texture(uStorms, vec3(vUv, vLayer));
    float alpha = texel.a * vOpacity;
    if (alpha <= 0.002) discard;
    gl_FragColor = vec4(texel.rgb * vTint, 1.0);
    #include <colorspace_fragment>
    // Premultiplied, as in RegionCloud: alpha 0 adds light, alpha 1 covers.
    gl_FragColor = vec4(gl_FragColor.rgb * alpha, alpha * (1.0 - vAdditive));
  }
`;

/** Which texture each storm draws now, for the test hooks: its generated one or its upload. */
const sources = new Map<string, 'generated' | 'upload'>();
export function stormTextureOf(id: string): 'generated' | 'upload' | null {
  return sources.get(id) ?? null;
}

/** FNV-1a of the id: a stable seed for the storm's clumps. */
function seedOf(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/** The uploaded picture a storm draws, if it has one and may show it. */
function uploadUrl(object: ViewObject, policy: SpoilerPolicy): string | null {
  const region = resolvedRegion(object);
  const texture = (object as Partial<GalaxyObject>).regionTexture;
  if (region.texture !== 'upload' || !texture) return null;
  // A spoiler picture shows only when spoilers are shown; until then, the generated one.
  const key = spoilerKeys.image(object.id, texture.assetId, 'region_texture');
  return isHidden(texture.isSpoiler, key, policy) ? null : texture.url;
}

export function StormDiscs({ objects }: { objects: readonly ViewObject[] }) {
  const policy = useSpoilerPolicy();
  // Bumped when an uploaded picture finishes loading, to build its layer.
  const [loaded, setLoaded] = useState(0);
  const storms = useMemo(() => objects.slice(0, STORM_MAX_LAYERS), [objects]);

  useEffect(() => {
    let active = true;
    for (const object of storms) {
      const url = uploadUrl(object, policy);
      if (url && !uploadedLayer(url)) {
        loadUploadedLayer(url).then(
          () => {
            if (active) setLoaded((value) => value + 1);
          },
          (error: unknown) => {
            console.warn(error);
          },
        );
      }
    }
    return () => {
      active = false;
    };
  }, [storms, policy]);

  const built = useMemo(() => {
    // One layer per distinct texture: storms with the same settings share it.
    const keys = new Map<string, number>();
    const layerPixels: Uint8Array[] = [];
    sources.clear();
    const layerOf = storms.map((object) => {
      const region = resolvedRegion(object);
      const url = uploadUrl(object, policy);
      const uploaded = url ? uploadedLayer(url) : undefined;
      const { key, pixels } = uploaded
        ? { key: `upload:${url ?? ''}`, pixels: uploaded }
        : generatedLayer({
            innerRadius: region.innerRadius,
            color: region.color ?? '#ffffff',
            rimColor: region.rimColor ?? region.color ?? '#ffffff',
            filaments: region.filaments,
            gaps: region.gaps,
            seed: seedOf(object.id),
          });
      sources.set(object.id, uploaded ? 'upload' : 'generated');
      let layer = keys.get(key);
      if (layer === undefined) {
        layer = layerPixels.length;
        keys.set(key, layer);
        layerPixels.push(pixels);
      }
      return layer;
    });
    const size = STORM_TEXTURE_PX * STORM_TEXTURE_PX * 4;
    const data = new Uint8Array(size * Math.max(1, layerPixels.length));
    for (const [index, pixels] of layerPixels.entries()) data.set(pixels, index * size);
    const texture = new DataArrayTexture(
      data,
      STORM_TEXTURE_PX,
      STORM_TEXTURE_PX,
      Math.max(1, layerPixels.length),
    );
    texture.colorSpace = SRGBColorSpace;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.needsUpdate = true;

    const count = storms.length;
    const centers = new Float32Array(count * 3);
    const radii = new Float32Array(count);
    const layersAttr = new Float32Array(count);
    const rotations = new Float32Array(count);
    const tints = new Float32Array(count * 3);
    const additive = new Float32Array(count);
    const opacity = new Float32Array(count);
    const ranges = new Map<string, readonly [number, number]>();
    for (const [index, object] of storms.entries()) {
      const region = resolvedRegion(object);
      const state = bodyState(object, policy);
      const style = REGION_STYLES[object.baseType] ?? DEFAULT_REGION_STYLE;
      centers.set(object.position, index * 3);
      radii[index] = region.radius;
      layersAttr[index] = layerOf[index] ?? 0;
      rotations[index] = (region.rotationDeg * Math.PI) / 180;
      // A hidden spoiler storm keeps its shape but loses its colors (ux.md §7).
      const [r, g, b] = state === 'redacted' ? hexToLinear(REDACTION_COLOR) : [1, 1, 1];
      tints.set(
        [r, g, b].map((channel) => channel * (state === 'redacted' ? 1 : style.tint)),
        index * 3,
      );
      additive[index] = style.additive && state !== 'redacted' ? 1 : 0;
      opacity[index] = STORM_DISC_OPACITY * (state === 'draft' ? 0.55 : 1);
      ranges.set(object.id, [index, 1]);
    }
    const quad = new PlaneGeometry(2, 2);
    const geometry = new InstancedBufferGeometry();
    geometry.setIndex(quad.getIndex());
    geometry.setAttribute('position', quad.getAttribute('position'));
    geometry.setAttribute('aCenter', new InstancedBufferAttribute(centers, 3));
    geometry.setAttribute('aRadius', new InstancedBufferAttribute(radii, 1));
    geometry.setAttribute('aLayer', new InstancedBufferAttribute(layersAttr, 1));
    geometry.setAttribute('aRotation', new InstancedBufferAttribute(rotations, 1));
    geometry.setAttribute('aTint', new InstancedBufferAttribute(tints, 3));
    geometry.setAttribute('aAdditive', new InstancedBufferAttribute(additive, 1));
    geometry.setAttribute('aOpacity', new InstancedBufferAttribute(opacity, 1));
    geometry.instanceCount = count;
    quad.dispose();
    return { texture, geometry, ranges, baseCenters: centers.slice() };
    // `loaded` rebuilds the layers once an uploaded picture has arrived.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storms, policy, loaded]);

  useEffect(
    () => () => {
      built.texture.dispose();
      built.geometry.dispose();
    },
    [built],
  );

  const mesh = useRef<Mesh<InstancedBufferGeometry>>(null);
  useMovePreview(mesh, built.ranges, built.baseCenters);

  const uniforms = useMemo(
    () => ({
      uStorms: { value: built.texture },
      uWorldPerPxAt1: { value: 1 },
      uMinPx: { value: STORM_DISC_MIN_PX },
    }),
    [built],
  );
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
  });

  if (storms.length === 0) return null;
  return (
    // With the regions, after the background's stars; never writing depth.
    <mesh ref={mesh} geometry={built.geometry} frustumCulled={false} renderOrder={4}>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        // Flat in the galactic plane, like the disc and the group fills: drawn over the disc by
        // order, not by depth, which would fight it.
        depthTest={false}
        depthWrite={false}
        // Laying the plane's x-y corners onto x-z turns its front face downward, so from above
        // the camera sees the back. Both sides are drawn, in one pass: a flat disc needs no
        // back-to-front sorting.
        side={DoubleSide}
        forceSinglePass
        blending={CustomBlending}
        blendSrc={OneFactor}
        blendDst={OneMinusSrcAlphaFactor}
      />
    </mesh>
  );
}
