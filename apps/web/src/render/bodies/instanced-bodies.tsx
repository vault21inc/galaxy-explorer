import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import {
  IcosahedronGeometry,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  type Mesh,
  type ShaderMaterial,
} from 'three';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import type { RendererProps } from '../renderer-types.ts';
import { publishDrawn } from '../scene-index.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';
import { useMovePreview } from '../use-move-preview.ts';
import { GALAXY_BODY_MAX_PX, GALAXY_BODY_MIN_PX } from '../tuning.ts';
import { buildBodyBuffers } from './body-buffers.ts';

export const INSTANCED_BODIES = 'instanced-bodies';

/**
 * Every body in the view in one draw call (rendering.md §1 concept 5, §6). One small sphere
 * mesh (an icosphere, 80 triangles) is drawn once per object; per-instance attributes give each
 * copy its center, radius, color and state.
 *
 * The vertex shader keeps every body between GALAXY_BODY_MIN_PX and _MAX_PX tall on screen,
 * whatever the camera distance, so objects never vanish when zoomed out (Sins-style
 * readability) and never fill the screen up close. body-scale.ts does the same on the CPU.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uWorldPerPxAt1;   // world units per CSS pixel at distance 1 (screen-scale.ts)
  uniform float uMinRadiusPx;
  uniform float uMaxRadiusPx;
  attribute vec3 aCenter;         // world position (ly)
  attribute float aRadius;        // world radius (ly)
  attribute vec3 aColor;          // linear RGB
  attribute float aState;         // 0 normal, 1 redacted, 2 draft
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vState;
  void main() {
    // The center in view space, where the camera sits at the origin looking down -Z.
    vec4 centerView = viewMatrix * vec4(aCenter, 1.0);
    // How many world units one pixel covers at this depth, then the radius clamped in pixels.
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    float radius = clamp(aRadius, uMinRadiusPx * worldPerPx, uMaxRadiusPx * worldPerPx);
    // On a unit sphere the vertex position is also its normal. mat3(viewMatrix) turns it with
    // the camera; the mesh itself sits at the origin unrotated, so no model matrix is needed.
    vNormal = mat3(viewMatrix) * position;
    vColor = aColor;
    vState = aState;
    gl_Position = projectionMatrix * (centerView + vec4(vNormal * radius, 0.0));
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying float vState;
  void main() {
    // Drafts (edit mode only) are see-through: every other pixel is skipped, a checkerboard
    // that keeps them in the one opaque draw call instead of needing a blended pass.
    if (vState > 1.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;

    // A cheap fake instead of lights: 'facing' is 1 where the surface faces the camera and 0
    // at the silhouette. A bright core plus a soft rim reads as a small glowing sphere.
    float facing = clamp(normalize(vNormal).z, 0.0, 1.0);
    vec3 color = vColor * (0.45 + 0.55 * facing);
    if (vState < 0.5) {
      color += vColor * pow(1.0 - facing, 3.0) * 0.6;   // rim glow
      color += vec3(pow(facing, 10.0) * 0.35);          // hot center
    }
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** An icosphere with one subdivision: round enough at 40 px, and only 80 triangles. */
const SPHERE_DETAIL = 1;

export function InstancedBodies({ objects }: RendererProps) {
  const policy = useSpoilerPolicy();
  const buffers = useMemo(
    () => buildBodyBuffers(objects, policy, INSTANCED_BODIES),
    [objects, policy],
  );

  // Built with `new`, so disposed by hand when replaced or unmounted (rendering.md §13).
  const geometry = useMemo(() => {
    const sphere = new IcosahedronGeometry(1, SPHERE_DETAIL);
    const instanced = new InstancedBufferGeometry();
    instanced.setAttribute('position', sphere.getAttribute('position'));
    instanced.setAttribute('aCenter', new InstancedBufferAttribute(buffers.centers, 3));
    instanced.setAttribute('aRadius', new InstancedBufferAttribute(buffers.radii, 1));
    instanced.setAttribute('aColor', new InstancedBufferAttribute(buffers.colors, 3));
    instanced.setAttribute('aState', new InstancedBufferAttribute(buffers.states, 1));
    instanced.instanceCount = buffers.ids.length;
    sphere.dispose();
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
  const ranges = useMemo(
    () => new Map(buffers.ids.map((id, index) => [id, [index, 1] as const])),
    [buffers],
  );
  const mesh = useRef<Mesh<InstancedBufferGeometry>>(null);
  useMovePreview(mesh, ranges, baseCenters);

  useEffect(() => {
    publishDrawn(INSTANCED_BODIES, buffers.drawn);
    return () => {
      publishDrawn(INSTANCED_BODIES, null);
    };
  }, [buffers]);

  const uniforms = useMemo(
    () => ({
      uWorldPerPxAt1: { value: 1 },
      uMinRadiusPx: { value: GALAXY_BODY_MIN_PX / 2 },
      uMaxRadiusPx: { value: GALAXY_BODY_MAX_PX / 2 },
    }),
    [],
  );
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
  });

  if (buffers.ids.length === 0) return null;
  return (
    // The instances are spread over the whole galaxy, but three.js would judge visibility by
    // the one unit sphere at the origin: turn culling off, the shader places everything.
    <mesh ref={mesh} geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
      />
    </mesh>
  );
}
