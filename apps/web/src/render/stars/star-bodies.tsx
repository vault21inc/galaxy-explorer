import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { AdditiveBlending, IcosahedronGeometry } from 'three';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { bake } from '../bake/bake.ts';
import { bakeCache } from '../bake/bake-cache.ts';
import { buildBodyBuffers } from '../bodies/body-buffers.ts';
import { SPHERE_VERTEX_GLSL, useInstancedSpheres } from '../bodies/use-instanced-spheres.ts';
import { CLAMP_RADIUS_GLSL, useGlyphQuads } from '../glyphs/use-glyph-quads.ts';
import type { RendererProps } from '../renderer-types.ts';
import { movePreview, onMovePreview } from '../scene-index.ts';
import {
  STAR_GLOW_INTENSITY,
  STAR_GLOW_MIN_PX,
  STAR_GLOW_RADII,
  STAR_GRANULATION_CONTRAST,
  STAR_GRANULATION_PX,
  STAR_LIMB_BRIGHTNESS,
  STAR_SPHERE_DETAIL,
  SYSTEM_MAX_LIGHTS,
  STAR_BODY_MAX_PX,
  STAR_BODY_MIN_PX,
} from '../tuning.ts';
import { granulationDefinition, granulationKey } from './granulation-bake.ts';
import { publishLights, type SystemLight } from './system-lights.ts';

export const STAR_BODIES = 'star-bodies';
const STAR_GLOWS = 'star-glows';

/**
 * A system's stars (rendering.md §7, D-29), all of them in two draw calls:
 * - **the sphere**, in its blackbody color (resolveAppearance), its surface broken into
 *   granulation cells from a texture baked once (granulation-bake.ts) and darker toward its
 *   edge (limb darkening);
 * - **the glow**, a camera-facing disc around each star, added onto what's behind it;
 *
 * and they light the system: the largest SYSTEM_MAX_LIGHTS stars are published as the lights
 * the planet and belt shaders read (system-lights.ts), following a star while it's dragged.
 */
const SPHERE_VERTEX_SHADER = /* glsl */ `
  ${SPHERE_VERTEX_GLSL}
  void main() {
    placeOnSphere();
  }
`;

const SPHERE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uGranulation;
  varying vec3 vColor;
  varying float vState;
  varying vec3 vWorldNormal;
  varying vec3 vViewNormal;
  const float PI = 3.141592653589793;
  void main() {
    if (vState > 1.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
    if (vState > 0.5 && vState < 1.5) {
      // A hidden spoiler: a flat disc in the redaction color, no surface to give it away.
      gl_FragColor = vec4(vColor, 1.0);
      #include <colorspace_fragment>
      return;
    }
    // The equirectangular texture's coordinates for this surface direction: longitude across,
    // latitude up, as the bake laid them out.
    vec3 n = normalize(vWorldNormal);
    vec2 uv = vec2(atan(n.z, n.x) / (2.0 * PI) + 0.5, asin(clamp(n.y, -1.0, 1.0)) / PI + 0.5);
    float cells = texture2D(uGranulation, uv).r;
    float surface = 1.0 + ${STAR_GRANULATION_CONTRAST.toFixed(3)} * (2.0 * cells - 1.0);
    // 'facing' is 1 at the middle of the disc and 0 at its edge.
    float facing = clamp(normalize(vViewNormal).z, 0.0, 1.0);
    float limb = mix(${STAR_LIMB_BRIGHTNESS.toFixed(3)}, 1.0, sqrt(facing));
    // A star is far brighter than anything it lights: its middle washes toward white.
    vec3 color = mix(vColor, vec3(1.0), 0.35 * facing) * surface * limb * 1.15;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const GLOW_VERTEX_SHADER = /* glsl */ `
  ${CLAMP_RADIUS_GLSL}
  attribute vec3 aCenter;
  attribute float aRadius;
  attribute vec3 aColor;
  varying vec2 vCorner;
  varying vec3 vColor;
  void main() {
    vec4 centerView = modelViewMatrix * vec4(aCenter, 1.0);
    // A billboard: the quad's corners are offset in view space, so it always faces the camera.
    centerView.xy += position.xy * clampedRadius(centerView, aRadius, ${STAR_GLOW_MIN_PX.toFixed(1)}, 1e6);
    vCorner = position.xy;
    vColor = aColor;
    gl_Position = projectionMatrix * centerView;
  }
`;

const GLOW_FRAGMENT_SHADER = /* glsl */ `
  varying vec2 vCorner;
  varying vec3 vColor;
  void main() {
    // Bright near the star, fading smoothly to exactly nothing at the quad's inscribed circle.
    float d = length(vCorner);
    // A tight core and a faint wide halo.
    float glow = exp(-d * d * 14.0) + 0.18 * exp(-d * 4.0);
    glow *= 1.0 - smoothstep(0.75, 1.0, d);
    gl_FragColor = vec4(vColor * glow * ${STAR_GLOW_INTENSITY.toFixed(3)}, 1.0);
    #include <colorspace_fragment>
  }
`;

export function StarBodies({ objects }: RendererProps) {
  const gl = useThree((state) => state.gl);
  const invalidate = useThree((state) => state.invalidate);
  const policy = useSpoilerPolicy();
  const buffers = useMemo(
    () =>
      buildBodyBuffers(objects, policy, STAR_BODIES, {
        minRadiusPx: STAR_BODY_MIN_PX,
        maxRadiusPx: STAR_BODY_MAX_PX,
      }),
    [objects, policy],
  );
  const { geometry, mesh, material } = useInstancedSpheres(
    STAR_BODIES,
    buffers,
    () => new IcosahedronGeometry(1, STAR_SPHERE_DETAIL),
  );

  // The glow quads: the same centers and colors, a radius of STAR_GLOW_RADII × glow star radii.
  const glowBuffers = useMemo(() => {
    const radii = new Float32Array(buffers.ids.length);
    const colors = buffers.colors.slice();
    objects.forEach((object, index) => {
      const glow = object.appearance.star?.glow ?? 1;
      radii[index] = (buffers.radii[index] ?? 0) * STAR_GLOW_RADII * glow;
      // A hidden spoiler star has no glow: added black is nothing.
      if (buffers.drawn[index]?.state === 'redacted') colors.fill(0, index * 3, index * 3 + 3);
    });
    return {
      ids: buffers.ids,
      centers: buffers.centers.slice(),
      attributes: [
        { name: 'aRadius', array: radii, itemSize: 1 },
        { name: 'aColor', array: colors, itemSize: 3 },
      ],
      // The glow isn't something to pick, label or ring: the star is.
      drawn: [],
    };
  }, [objects, buffers]);
  const {
    geometry: glowGeometry,
    mesh: glowMesh,
    material: glowMaterial,
  } = useGlyphQuads(STAR_GLOWS, glowBuffers);

  // The lights: the largest visible stars, where they're shown now (a drag moves them).
  useEffect(() => {
    const lit = buffers.ids
      .map((id, index) => ({ id, index, radius: buffers.radii[index] ?? 0 }))
      .filter((star) => buffers.drawn[star.index]?.state !== 'redacted')
      .sort((a, b) => b.radius - a.radius)
      .slice(0, SYSTEM_MAX_LIGHTS);
    const apply = () => {
      const preview = movePreview();
      publishLights(
        lit.map(({ id, index }): SystemLight => {
          const [dx, dy, dz] = preview?.ids.has(id) ? preview.delta : [0, 0, 0];
          return {
            position: [
              (buffers.centers[index * 3] ?? 0) + dx,
              (buffers.centers[index * 3 + 1] ?? 0) + dy,
              (buffers.centers[index * 3 + 2] ?? 0) + dz,
            ],
            color: [
              buffers.colors[index * 3] ?? 1,
              buffers.colors[index * 3 + 1] ?? 1,
              buffers.colors[index * 3 + 2] ?? 1,
            ],
          };
        }),
      );
      invalidate();
    };
    apply();
    const stop = onMovePreview(apply);
    return () => {
      stop();
      publishLights(null);
    };
  }, [buffers, invalidate]);

  const sphereUniforms = useMemo(() => {
    const granulation = bakeCache.get(granulationKey(STAR_GRANULATION_PX), () =>
      bake(gl, granulationDefinition, STAR_GRANULATION_PX, STAR_GRANULATION_PX / 2),
    );
    return {
      uGranulation: { value: granulation.texture },
      uWorldPerPxAt1: { value: 1 },
      uMinRadiusPx: { value: STAR_BODY_MIN_PX },
      uMaxRadiusPx: { value: STAR_BODY_MAX_PX },
    };
  }, [gl]);
  const glowUniforms = useMemo(
    () => ({ uWorldPerPxAt1: { value: 1 }, uOpacity: { value: 1 } }),
    [],
  );

  if (buffers.ids.length === 0) return null;
  return (
    <>
      <mesh ref={mesh} geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          ref={material}
          vertexShader={SPHERE_VERTEX_SHADER}
          fragmentShader={SPHERE_FRAGMENT_SHADER}
          uniforms={sphereUniforms}
        />
      </mesh>
      {/* After the opaque bodies, added onto them; it never hides what's behind it. */}
      <mesh ref={glowMesh} geometry={glowGeometry} frustumCulled={false} renderOrder={4}>
        <shaderMaterial
          ref={glowMaterial}
          vertexShader={GLOW_VERTEX_SHADER}
          fragmentShader={GLOW_FRAGMENT_SHADER}
          uniforms={glowUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </>
  );
}
