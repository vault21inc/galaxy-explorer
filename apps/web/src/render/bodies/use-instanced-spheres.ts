import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type BufferGeometry,
  type Mesh,
  type ShaderMaterial,
} from 'three';
import type { QuadAttribute } from '../glyphs/use-glyph-quads.ts';
import { publishDrawn } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { useMovePreview, type InstanceRanges } from '../use-move-preview.ts';
import type { BodyBuffers } from './body-buffers.ts';

/**
 * The shared part of the sphere renderers of the system view (stars, planets): one unit sphere
 * drawn once per object in one draw call, with `aCenter`, `aRadius`, `aColor` and `aState` per
 * instance plus the renderer's own attributes; the move preview (M3-T3); the scene index; and
 * `uWorldPerPxAt1` for the on-screen size clamp, kept current every frame.
 *
 * `makeSphere` builds the unit sphere, whose vertex positions double as its normals. Its
 * geometry is copied into an instanced one and disposed; the instanced geometry is disposed
 * when replaced or unmounted (rendering.md §13).
 */
export function useInstancedSpheres(
  name: string,
  buffers: BodyBuffers,
  makeSphere: () => BufferGeometry,
  extra: readonly QuadAttribute[] = [],
) {
  const geometry = useMemo(() => {
    const sphere = makeSphere();
    const instanced = new InstancedBufferGeometry();
    const index = sphere.getIndex();
    if (index) instanced.setIndex(index);
    instanced.setAttribute('position', sphere.getAttribute('position'));
    instanced.setAttribute('aCenter', new InstancedBufferAttribute(buffers.centers, 3));
    instanced.setAttribute('aRadius', new InstancedBufferAttribute(buffers.radii, 1));
    instanced.setAttribute('aColor', new InstancedBufferAttribute(buffers.colors, 3));
    instanced.setAttribute('aState', new InstancedBufferAttribute(buffers.states, 1));
    for (const attribute of extra) {
      instanced.setAttribute(
        attribute.name,
        new InstancedBufferAttribute(attribute.array, attribute.itemSize),
      );
    }
    instanced.instanceCount = buffers.ids.length;
    sphere.dispose();
    return instanced;
    // `makeSphere` and `extra` are derived from the same inputs as `buffers`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buffers]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  // A copy of the centers: the attribute's array is shifted in place during a move preview.
  const baseCenters = useMemo(() => buffers.centers.slice(), [buffers]);
  const ranges: InstanceRanges = useMemo(
    () => new Map(buffers.ids.map((id, index) => [id, [index, 1] as const])),
    [buffers],
  );
  const mesh = useRef<Mesh<InstancedBufferGeometry>>(null);
  useMovePreview(mesh, ranges, baseCenters);

  useEffect(() => {
    publishDrawn(name, buffers.drawn);
    return () => {
      publishDrawn(name, null);
    };
  }, [name, buffers]);

  const material = useRef<ShaderMaterial>(null);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
  });

  return { geometry, mesh, material };
}

/**
 * The vertex shader part every sphere renderer shares: the center in view space, the radius
 * clamped on screen (rendering.md §6), and the vertex placed on the sphere. Declares
 * `vWorldNormal` (the sphere's surface direction, unit length; the sphere is never rotated, so
 * object and world directions agree) and `vWorldPosition`.
 */
export const SPHERE_VERTEX_GLSL = /* glsl */ `
  uniform float uWorldPerPxAt1;
  uniform float uMinRadiusPx;
  uniform float uMaxRadiusPx;
  attribute vec3 aCenter;
  attribute float aRadius;
  attribute vec3 aColor;
  attribute float aState;
  varying vec3 vColor;
  varying float vState;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewNormal;

  // Call from main(): sets gl_Position and the varyings. Returns the radius used.
  float placeOnSphere() {
    vec4 centerView = viewMatrix * vec4(aCenter, 1.0);
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    float radius = clamp(aRadius, uMinRadiusPx * worldPerPx, uMaxRadiusPx * worldPerPx);
    vWorldNormal = position;
    vWorldPosition = aCenter + position * radius;
    vViewNormal = mat3(viewMatrix) * position;
    vColor = aColor;
    vState = aState;
    gl_Position = projectionMatrix * (centerView + vec4(vViewNormal * radius, 0.0));
    return radius;
  }
`;
