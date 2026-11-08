import type { ResolvedGalaxySettings } from '@ge/domain';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { AdditiveBlending, type ShaderMaterial } from 'three';
import { hexToLinear, mixRgb } from '../color.ts';
import { GALAXY_GLOW_MAX_PX, GALAXY_GLOWS } from '../tuning.ts';
import { worldPerPxAt1 } from '../screen-scale.ts';

/**
 * Soft light over the galaxy's core (rendering.md §6): a few camera-facing squares ("billboards")
 * with a smooth radial falloff, all in one draw call.
 *
 * Every vertex carries its glow's center and a corner (±1, ±1). The vertex shader moves the
 * center into view space, where the camera looks down -Z, and pushes each corner out along
 * view-space X and Y: the square always faces the camera. Its radius is the glow's world radius,
 * capped at GALAXY_GLOW_MAX_PX on screen, so zooming into the core never fills the screen with
 * blended pixels (rendering.md §1, concept 7).
 */
const VERTEX_SHADER = /* glsl */ `
  uniform float uWorldPerPxAt1;
  uniform float uMaxPx;
  attribute vec2 aCorner;
  attribute float aRadiusLy;
  attribute vec3 aColor;
  varying vec2 vCorner;
  varying vec3 vColor;
  void main() {
    vec4 center = modelViewMatrix * vec4(position, 1.0);
    float radius = min(aRadiusLy, uMaxPx * uWorldPerPxAt1 * max(-center.z, 1e-3));
    center.xy += aCorner * radius;
    vCorner = aCorner;
    vColor = aColor;
    gl_Position = projectionMatrix * center;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vCorner;
  varying vec3 vColor;
  void main() {
    float d2 = dot(vCorner, vCorner);
    // A Gaussian falloff, eased to exactly zero at the edge so the square never shows.
    float strength = exp(-4.0 * d2) * (1.0 - smoothstep(0.6, 1.0, d2));
    gl_FragColor = vec4(vColor * strength, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Four corners per glow, as two triangles. */
const CORNERS = [-1, -1, 1, -1, 1, 1, -1, 1];
const QUAD_INDICES = [0, 1, 2, 0, 2, 3];

function glowBuffers(settings: ResolvedGalaxySettings) {
  const core = hexToLinear(settings.colors.core);
  const arm = hexToLinear(settings.colors.arm);
  const glows = GALAXY_GLOWS.map((glow, index) => ({
    radiusLy: glow.radiusBulges * settings.bulgeRadiusLy,
    // The wider halo leans toward the arm color.
    color: mixRgb(core, arm, index / Math.max(GALAXY_GLOWS.length, 2)).map(
      (channel) => channel * glow.intensity,
    ),
  }));
  const vertexCount = glows.length * 4;
  const positions = new Float32Array(vertexCount * 3); // all at the galaxy's center
  const corners = new Float32Array(vertexCount * 2);
  const radii = new Float32Array(vertexCount);
  const colors = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  glows.forEach((glow, g) => {
    for (let v = 0; v < 4; v++) {
      const i = g * 4 + v;
      corners.set(CORNERS.slice(v * 2, v * 2 + 2), i * 2);
      radii[i] = glow.radiusLy;
      colors.set(glow.color, i * 3);
    }
    indices.push(...QUAD_INDICES.map((index) => index + g * 4));
  });
  return { positions, corners, radii, colors, indices: new Uint16Array(indices) };
}

export function CoreGlow({ settings }: { settings: ResolvedGalaxySettings }) {
  const buffers = useMemo(() => glowBuffers(settings), [settings]);
  const uniforms = useMemo(
    () => ({ uWorldPerPxAt1: { value: 1 }, uMaxPx: { value: GALAXY_GLOW_MAX_PX } }),
    [],
  );
  const material = useRef<ShaderMaterial>(null);
  useFrame(({ camera, size }) => {
    const scale = material.current?.uniforms.uWorldPerPxAt1;
    if (scale) scale.value = worldPerPxAt1(camera, size.height);
  });

  return (
    // The squares grow in the shader, so three.js's bounds (all at the center) are wrong:
    // turn off frustum culling rather than have the glow vanish at the screen's edge.
    <mesh renderOrder={2} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="index" args={[buffers.indices, 1]} />
        <bufferAttribute attach="attributes-position" args={[buffers.positions, 3]} />
        <bufferAttribute attach="attributes-aCorner" args={[buffers.corners, 2]} />
        <bufferAttribute attach="attributes-aRadiusLy" args={[buffers.radii, 1]} />
        <bufferAttribute attach="attributes-aColor" args={[buffers.colors, 3]} />
      </bufferGeometry>
      <shaderMaterial
        ref={material}
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}
