import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { ShaderMaterial } from 'three';
import { generateSkyPoints } from './sky-points.ts';
import { SKY_SEED, SKY_STAR_COUNT, SKY_STAR_MIN_BRIGHTNESS, SKY_STAR_SIZE_PX } from './tuning.ts';

/**
 * The distant starfield behind every view (rendering.md §6): 5,000 points in one draw call.
 *
 * The stars are directions, not positions. The vertex shader turns each direction with the
 * camera but ignores where the camera is, so the stars are infinitely far away: they never
 * move when the camera pans or zooms, only when it turns, and they work the same in a galaxy
 * 100,000 light-years wide and around a planet one unit wide.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uSizePx;
  uniform float uPixelRatio;
  varying vec3 vColor;
  void main() {
    vColor = color;
    // mat3(viewMatrix) is the camera's rotation alone, without its position. A w of 0 makes
    // the projection treat the vector as a direction, a point at infinity.
    vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 0.0);
    // A point at infinity lies beyond the far plane and would be clipped. Depth doesn't matter
    // here (the sky is drawn first, without depth testing), so put it mid-range instead.
    // Stars behind the camera keep a negative w and are still dropped.
    gl_Position = vec4(clip.xy, 0.0, clip.w);
    gl_PointSize = uSizePx * uPixelRatio;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  void main() {
    gl_FragColor = vec4(vColor, 1.0);
    #include <colorspace_fragment>
  }
`;

export function Sky() {
  const { positions, colors } = useMemo(
    () =>
      generateSkyPoints({
        count: SKY_STAR_COUNT,
        radius: 1,
        minBrightness: SKY_STAR_MIN_BRIGHTNESS,
        seed: SKY_SEED,
      }),
    [],
  );
  const uniforms = useMemo(
    () => ({ uSizePx: { value: SKY_STAR_SIZE_PX }, uPixelRatio: { value: 1 } }),
    [],
  );

  const material = useRef<ShaderMaterial>(null);

  // The pixel ratio drops while the camera moves (AdaptiveDpr); keep stars the same CSS size.
  useFrame(({ viewport }) => {
    const pixelRatio = material.current?.uniforms.uPixelRatio;
    if (pixelRatio) pixelRatio.value = viewport.dpr;
  });

  return (
    // renderOrder -1 draws the sky before everything else; without depth testing, whatever
    // follows simply covers it. The points are directions, so their bounds mean nothing to
    // three.js's culling: turn it off.
    <points renderOrder={-1} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      {/* Declared in JSX, so R3F disposes it on unmount (rendering.md §13). */}
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        vertexColors
        depthTest={false}
        depthWrite={false}
      />
    </points>
  );
}
