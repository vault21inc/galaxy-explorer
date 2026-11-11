import type { PlanetAppearance } from '@ge/domain';
import { useEffect, useMemo } from 'react';
import { DoubleSide, RingGeometry } from 'three';
import { hexToLinear } from '../color.ts';
import {
  GLOBE_AMBIENT,
  GLOBE_EXPOSURE,
  GLOBE_RING_SEGMENTS,
  GLOBE_TERMINATOR_WRAP,
  PLANET_RINGS_COLOR,
  PLANET_RINGS_INNER_RADII,
  PLANET_RINGS_OPACITY,
  PLANET_RINGS_OUTER_RADII,
} from '../tuning.ts';
import { RING_FRAGMENT, RING_VERTEX } from './globe-shaders.ts';
import type { GlobeSun } from './globe-sun.ts';

const DEG = Math.PI / 180;

/**
 * The orbit view's rings (rendering.md §8): a flat band from `innerRadius` to `outerRadius`
 * globe radii, inside the globe's tilted frame (globe.tsx), turned by the rings' own tilt. One
 * draw. three's `RingGeometry` lies in the X/Y plane; turning it a quarter turn about X lays it
 * in the equatorial X/Z plane.
 */
export function GlobeRings({
  rings,
  sun,
}: {
  rings: NonNullable<PlanetAppearance['rings']>;
  sun: GlobeSun;
}) {
  const inner = rings.innerRadius ?? PLANET_RINGS_INNER_RADII;
  const outer = Math.max(inner + 0.05, rings.outerRadius ?? PLANET_RINGS_OUTER_RADII);
  const geometry = useMemo(
    () => new RingGeometry(inner, outer, GLOBE_RING_SEGMENTS, 1),
    [inner, outer],
  );
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  // A new object when anything changes: React Three Fiber copies its values into the material.
  const uniforms = useMemo(
    () => ({
      uSpan: { value: [inner, outer] },
      uColor: { value: hexToLinear(rings.color ?? PLANET_RINGS_COLOR) },
      uOpacity: { value: rings.opacity ?? PLANET_RINGS_OPACITY },
      uSunDir: { value: sun.direction },
      uSunColor: { value: sun.color },
      uAmbient: { value: GLOBE_AMBIENT },
      uExposure: { value: GLOBE_EXPOSURE },
      uWrap: { value: GLOBE_TERMINATOR_WRAP },
    }),
    [inner, outer, rings.color, rings.opacity, sun],
  );
  return (
    <group rotation-x={(rings.tiltDeg ?? 0) * DEG}>
      <mesh geometry={geometry} rotation-x={-Math.PI / 2} renderOrder={2}>
        <shaderMaterial
          vertexShader={RING_VERTEX}
          fragmentShader={RING_FRAGMENT}
          uniforms={uniforms}
          side={DoubleSide}
          transparent
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
