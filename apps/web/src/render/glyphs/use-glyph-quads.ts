import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  PlaneGeometry,
  type Mesh,
  type ShaderMaterial,
} from 'three';
import { publishDrawn, type DrawnObject } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { useMovePreview, type InstanceRanges } from '../use-move-preview.ts';

/** One per-instance attribute: a name the shader reads, its values and their width. */
export interface QuadAttribute {
  name: string;
  array: Float32Array;
  itemSize: number;
}

/**
 * What a glyph renderer draws (D-28): one camera-facing quad per object. `aCenter` is always
 * there (x, y, z per object); the renderer adds its own attributes.
 */
export interface GlyphBuffers {
  ids: string[];
  centers: Float32Array;
  attributes: QuadAttribute[];
  /** The objects for the scene index: picking, rings, labels and the test hooks. */
  drawn: DrawnObject[];
}

/**
 * The shared part of the glyph renderers (systems, black holes, icons): one instanced quad per
 * object in one draw call (rendering.md §1 concept 5), the move preview (M3-T3), and the scene
 * index. The geometry is built with `new`, so it's disposed by hand (rendering.md §13).
 */
export function useGlyphQuads(name: string, buffers: GlyphBuffers, ghost = false) {
  const geometry = useMemo(() => {
    // A 2 × 2 square: corners at ±1, so the vertex shader scales it by a radius directly.
    const quad = new PlaneGeometry(2, 2);
    const instanced = new InstancedBufferGeometry();
    instanced.setIndex(quad.getIndex());
    instanced.setAttribute('position', quad.getAttribute('position'));
    instanced.setAttribute('uv', quad.getAttribute('uv'));
    instanced.setAttribute('aCenter', new InstancedBufferAttribute(buffers.centers, 3));
    for (const attribute of buffers.attributes) {
      instanced.setAttribute(
        attribute.name,
        new InstancedBufferAttribute(attribute.array, attribute.itemSize),
      );
    }
    instanced.instanceCount = buffers.ids.length;
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
  // A ghost never moves with a drag: it has no ranges for the preview to shift.
  const ranges: InstanceRanges = useMemo(
    () => new Map(ghost ? [] : buffers.ids.map((id, index) => [id, [index, 1] as const])),
    [buffers, ghost],
  );
  const mesh = useRef<Mesh<InstancedBufferGeometry>>(null);
  useMovePreview(mesh, ranges, baseCenters);

  useEffect(() => {
    if (ghost) return;
    publishDrawn(name, buffers.drawn);
    return () => {
      publishDrawn(name, null);
    };
  }, [name, buffers, ghost]);

  // The pixel clamp needs the world size of one pixel at distance 1, which changes with the
  // camera's field of view and the canvas height (screen-scale.ts).
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
  });

  return { geometry, mesh, material };
}

/**
 * GLSL shared by the glyph vertex shaders: the on-screen size clamp of rendering.md §6. A
 * radius in world units becomes at least `minPx` and at most `maxPx` CSS pixels on screen,
 * whatever the camera's distance.
 */
export const CLAMP_RADIUS_GLSL = /* glsl */ `
  uniform float uWorldPerPxAt1;   // world units per CSS pixel at distance 1
  uniform float uOpacity;         // 1, or less for the placement ghost
  float clampedRadius(vec4 centerView, float radius, float minPx, float maxPx) {
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    return clamp(radius, minPx * worldPerPx, maxPx * worldPerPx);
  }
`;

/**
 * How the glyph materials differ for the placement ghost: see-through, drawn last and over
 * everything, so the type being placed shows its real look under the pointer.
 */
export function ghostMaterialProps(ghost: boolean) {
  return {
    renderOrder: ghost ? 11 : 5,
    depthTest: !ghost,
    opacity: ghost ? 0.55 : 1,
  };
}

/** A stable angle per id (0 to 2π), so neighbouring glyphs don't look stamped. */
export function angleOf(id: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619) >>> 0;
  }
  return (hash / 4_294_967_296) * 2 * Math.PI;
}
