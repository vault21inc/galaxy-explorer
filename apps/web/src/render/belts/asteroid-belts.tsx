import { useFrame, useThree } from '@react-three/fiber';
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
import { LIGHTING_GLSL, lightUniforms } from '../stars/system-lights.ts';
import { useLitUniforms } from '../stars/use-lit-uniforms.ts';
import { BELT_ROCK_MIN_PX } from '../tuning.ts';
import { useMovePreview } from '../use-move-preview.ts';
import { buildBeltRocks } from './belt-rocks.ts';

export const ASTEROID_BELTS = 'asteroid-belts';

/**
 * Every asteroid belt in the system view in one draw call (rendering.md §7): a low-poly rock
 * (an icosahedron, 20 faces) drawn once per rock, with a per-rock position, squash, turn and
 * shade from belt-rocks.ts, lit by the system's stars.
 *
 * The rocks are faceted on purpose: each pixel's normal is computed from how the surface
 * position changes between neighbouring pixels (dFdx, dFdy), which is the same across a whole
 * triangle, so every face is flat and catches the light on its own.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uWorldPerPxAt1;
  attribute vec3 aCenter;
  attribute vec3 aScale;
  attribute float aTurn;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  void main() {
    vec4 centerView = viewMatrix * vec4(aCenter, 1.0);
    // Never smaller than BELT_ROCK_MIN_PX on screen: grow all three radii alike.
    float worldPerPx = uWorldPerPxAt1 * max(-centerView.z, 1e-3);
    float largest = max(aScale.x, max(aScale.y, aScale.z));
    float grow = max(1.0, ${BELT_ROCK_MIN_PX.toFixed(2)} * worldPerPx / largest);
    vec3 local = position * aScale * grow;
    // Turn about the vertical axis, so the rocks don't all face the same way.
    float c = cos(aTurn);
    float s = sin(aTurn);
    local = vec3(local.x * c - local.z * s, local.y, local.x * s + local.z * c);
    vWorldPosition = aCenter + local;
    vColor = aColor;
    gl_Position = projectionMatrix * viewMatrix * vec4(vWorldPosition, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  ${LIGHTING_GLSL}
  varying vec3 vColor;
  varying vec3 vWorldPosition;
  void main() {
    vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
    gl_FragColor = vec4(vColor * starlight(vWorldPosition, normal), 1.0);
    #include <colorspace_fragment>
  }
`;

export function AsteroidBelts({ objects }: RendererProps) {
  const invalidate = useThree((state) => state.invalidate);
  const policy = useSpoilerPolicy();
  const rocks = useMemo(() => buildBeltRocks(objects, policy, ASTEROID_BELTS), [objects, policy]);

  const geometry = useMemo(() => {
    const rock = new IcosahedronGeometry(1, 0);
    const instanced = new InstancedBufferGeometry();
    instanced.setAttribute('position', rock.getAttribute('position'));
    instanced.setAttribute('aCenter', new InstancedBufferAttribute(rocks.centers, 3));
    instanced.setAttribute('aScale', new InstancedBufferAttribute(rocks.scales, 3));
    instanced.setAttribute('aTurn', new InstancedBufferAttribute(rocks.turns, 1));
    instanced.setAttribute('aColor', new InstancedBufferAttribute(rocks.colors, 3));
    instanced.instanceCount = rocks.count;
    rock.dispose();
    return instanced;
  }, [rocks]);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );

  const baseCenters = useMemo(() => rocks.centers.slice(), [rocks]);
  const mesh = useRef<Mesh<InstancedBufferGeometry>>(null);
  useMovePreview(mesh, rocks.ranges, baseCenters);

  useEffect(() => {
    publishDrawn(ASTEROID_BELTS, rocks.drawn);
    return () => {
      publishDrawn(ASTEROID_BELTS, null);
    };
  }, [rocks]);

  const uniforms = useMemo(() => ({ ...lightUniforms(), uWorldPerPxAt1: { value: 1 } }), []);
  const material = useRef<ShaderMaterial>(null);
  useLitUniforms(uniforms, invalidate);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
  });

  if (rocks.count === 0) return null;
  return (
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
