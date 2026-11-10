import { useMemo } from 'react';
import { SphereGeometry } from 'three';
import { useThree } from '@react-three/fiber';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { buildBodyBuffers } from '../bodies/body-buffers.ts';
import { SPHERE_VERTEX_GLSL, useInstancedSpheres } from '../bodies/use-instanced-spheres.ts';
import type { RendererProps } from '../renderer-types.ts';
import { LIGHTING_GLSL, lightUniforms } from '../stars/system-lights.ts';
import { useLitUniforms } from '../stars/use-lit-uniforms.ts';
import { PLANET_SEGMENTS, SYSTEM_PLANET_MAX_PX, SYSTEM_PLANET_MIN_PX } from '../tuning.ts';
import { PlanetRings } from './planet-rings.tsx';

export const PLANET_BODIES = 'planet-bodies';

/**
 * A system's planets (rendering.md §7): spheres of 32 × 16 segments in their own color, lit by
 * the system's stars (system-lights.ts), every planet in one draw call, and their rings in one
 * more. M6 replaces the flat color with the baked planet textures of the orbit view.
 *
 * Like every body they keep a minimum on-screen size (SYSTEM_PLANET_MIN_PX), so a planet seen
 * from the edge of a wide system is still a dot to point at.
 */
const VERTEX_SHADER = /* glsl */ `
  ${SPHERE_VERTEX_GLSL}
  void main() {
    placeOnSphere();
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  ${LIGHTING_GLSL}
  varying vec3 vColor;
  varying float vState;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewNormal;
  void main() {
    if (vState > 1.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
    if (vState > 0.5 && vState < 1.5) {
      gl_FragColor = vec4(vColor, 1.0);
      #include <colorspace_fragment>
      return;
    }
    vec3 lit = vColor * starlight(vWorldPosition, normalize(vWorldNormal));
    // A thin bright rim on the lit side, as a hint of atmosphere: strongest at the silhouette.
    float facing = clamp(normalize(vViewNormal).z, 0.0, 1.0);
    lit += vColor * pow(1.0 - facing, 4.0) * 0.25 * min(length(lit), 1.0);
    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
  }
`;

export function PlanetBodies({ objects }: RendererProps) {
  const invalidate = useThree((state) => state.invalidate);
  const policy = useSpoilerPolicy();
  const buffers = useMemo(
    () =>
      buildBodyBuffers(objects, policy, PLANET_BODIES, {
        minRadiusPx: SYSTEM_PLANET_MIN_PX,
        maxRadiusPx: SYSTEM_PLANET_MAX_PX,
      }),
    [objects, policy],
  );
  const { geometry, mesh, material } = useInstancedSpheres(
    PLANET_BODIES,
    buffers,
    () => new SphereGeometry(1, PLANET_SEGMENTS, PLANET_SEGMENTS / 2),
  );

  const uniforms = useMemo(
    () => ({
      ...lightUniforms(),
      uWorldPerPxAt1: { value: 1 },
      uMinRadiusPx: { value: SYSTEM_PLANET_MIN_PX },
      uMaxRadiusPx: { value: SYSTEM_PLANET_MAX_PX },
    }),
    [],
  );
  useLitUniforms(uniforms, invalidate);

  if (buffers.ids.length === 0) return null;
  return (
    <>
      <mesh ref={mesh} geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={material}
          vertexShader={VERTEX_SHADER}
          fragmentShader={FRAGMENT_SHADER}
          uniforms={uniforms}
        />
      </mesh>
      <PlanetRings objects={objects} buffers={buffers} />
    </>
  );
}
