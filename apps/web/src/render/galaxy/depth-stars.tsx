import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, type ShaderMaterial } from 'three';
import { GALAXY_STAR_MAX_PX, GALAXY_STAR_MIN_PX } from '../tuning.ts';
import type { GalaxyPoints } from './galaxy-points.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';

/**
 * The depth stars (rendering.md §6): up to 20,000 points in one draw call, giving the flat
 * disc thickness and parallax as the camera turns.
 *
 * Each star has a real size in light-years, so nearer stars look bigger (perspective), but its
 * on-screen size is clamped between GALAXY_STAR_MIN_PX and GALAXY_STAR_MAX_PX. Stars that
 * would be smaller than a pixel fade instead of shrinking, which looks like distance rather
 * than flicker.
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uWorldPerPxAt1;
  uniform float uPixelRatio;
  uniform float uMinPx;
  uniform float uMaxPx;
  attribute float aSizeLy;
  varying vec3 vColor;
  varying float vFade;
  void main() {
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    // The camera looks down -Z in view space, so -z is the distance in front of it.
    float sizePx = aSizeLy / (uWorldPerPxAt1 * max(-viewPosition.z, 1e-3));
    vFade = clamp(sizePx / uMinPx, 0.0, 1.0);
    vColor = color;
    // gl_PointSize is in device pixels, so scale CSS pixels by the pixel ratio.
    gl_PointSize = clamp(sizePx, uMinPx, uMaxPx) * uPixelRatio;
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec3 vColor;
  varying float vFade;
  void main() {
    // gl_PointCoord runs 0–1 across the point's square; make it a soft round dot.
    vec2 offset = gl_PointCoord * 2.0 - 1.0;
    float distanceSquared = dot(offset, offset);
    if (distanceSquared > 1.0) discard;
    gl_FragColor = vec4(vColor, (1.0 - distanceSquared) * vFade);
    #include <colorspace_fragment>
  }
`;

export function DepthStars({ points }: { points: GalaxyPoints }) {
  const uniforms = useMemo(
    () => ({
      uWorldPerPxAt1: { value: 1 },
      uPixelRatio: { value: 1 },
      uMinPx: { value: GALAXY_STAR_MIN_PX },
      uMaxPx: { value: GALAXY_STAR_MAX_PX },
    }),
    [],
  );

  const material = useRef<ShaderMaterial>(null);

  // Only numbers are written here, nothing is allocated (rendering.md §2, rule 4).
  useFrame(({ camera, size, viewport }) => {
    const current = material.current?.uniforms;
    if (!current?.uWorldPerPxAt1 || !current.uPixelRatio) return;
    current.uWorldPerPxAt1.value = worldPerPxAt1(camera, size.height);
    current.uPixelRatio.value = viewport.dpr;
  });

  return (
    // The parent keys this by the settings, so new stars build new GPU buffers (and bounds)
    // instead of patching old ones.
    <points renderOrder={3}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[points.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[points.colors, 3]} />
        <bufferAttribute attach="attributes-aSizeLy" args={[points.sizesLy, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        vertexColors
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
