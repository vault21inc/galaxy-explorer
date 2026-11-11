import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { SphereGeometry, Vector2 } from 'three';
import { useThree } from '@react-three/fiber';
import { useAppearancePreview, useRateLimited } from '@/state/appearance-preview.ts';
import { useSpoilerPolicy } from '@/state/spoilers.ts';
import { buildBodyBuffers } from '../bodies/body-buffers.ts';
import { SPHERE_VERTEX_GLSL, useInstancedSpheres } from '../bodies/use-instanced-spheres.ts';
import type { RendererProps } from '../renderer-types.ts';
import { LIGHTING_GLSL, lightUniforms } from '../stars/system-lights.ts';
import { useLitUniforms } from '../stars/use-lit-uniforms.ts';
import { systemPlanetTextures } from '../bake/planet/planet-texture-array.ts';
import { loadUploadedSurface, uploadedSurface } from '../bake/planet/uploaded-surfaces.ts';
import {
  PLANET_SEGMENTS,
  SYSTEM_PLANET_MAX_PX,
  SYSTEM_PLANET_MIN_PX,
  PLANET_BAKE_DEBOUNCE_MS,
  SYSTEM_PLANET_AMBIENT,
  SYSTEM_PLANET_EXPOSURE,
  SYSTEM_PLANET_INITIAL_LAYERS,
  SYSTEM_PLANET_TEXTURE_PX,
} from '../tuning.ts';
import { PlanetRings } from './planet-rings.tsx';
import { planetSurfaces, surfaceUploadUrl } from './planet-surfaces.ts';

export const PLANET_BODIES = 'planet-bodies';

/**
 * A system's planets (rendering.md §7): spheres of 32 × 16 segments painted with their baked
 * surfaces (M6-T2), lit by the system's stars (system-lights.ts), every planet in one draw
 * call, and their rings in one more.
 *
 * Each planet's surface is one 256 × 128 layer of a shared array texture (planet-texture-
 * array.ts), picked per instance by `aLayer`, so the planets still draw in one call.
 *
 * Like every body they keep a minimum on-screen size (SYSTEM_PLANET_MIN_PX), so a planet seen
 * from the edge of a wide system is still a dot to point at.
 */
const VERTEX_SHADER = /* glsl */ `
  ${SPHERE_VERTEX_GLSL}
  attribute float aLayer;
  attribute float aTiltRad;
  varying vec2 vUv;
  varying float vLayer;
  void main() {
    // Axial tilt: the planet's north pole leans from +Y toward +Z by aTiltRad, a turn about
    // the X axis. A mat3 is built from its columns: where X, Y and Z end up.
    float c = cos(aTiltRad);
    float s = sin(aTiltRad);
    placeOnSphereRotated(mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c));
    vUv = uv;
    vLayer = aLayer;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  ${LIGHTING_GLSL}
  uniform sampler2DArray uSurfaces;
  uniform vec2 uSurfaceSize;
  uniform float uExposure;
  varying vec3 vColor;
  varying float vState;
  varying vec3 vWorldNormal;
  varying vec3 vWorldPosition;
  varying vec3 vViewNormal;
  varying vec2 vUv;
  varying float vLayer;
  void main() {
    if (vState > 1.5 && mod(floor(gl_FragCoord.x) + floor(gl_FragCoord.y), 2.0) < 1.0) discard;
    if (vState > 0.5 && vState < 1.5) {
      gl_FragColor = vec4(vColor, 1.0);
      #include <colorspace_fragment>
      return;
    }
    // The bake puts its first and last columns exactly on the ±180° meridian (planet-surface-
    // bake.ts), so u = 0 and u = 1 land on those texel centers rather than on the texture's
    // edges; the same for the poles and the rows.
    vec2 st = (vUv * (uSurfaceSize - 1.0) + 0.5) / uSurfaceSize;
    // The bake stores sRGB, which spends its 8 bits where the eye notices; lighting needs
    // linear light. The layer index is rounded: it's interpolated like any varying.
    vec3 albedo = sRGBTransferEOTF(texture(uSurfaces, vec3(st, floor(vLayer + 0.5)))).rgb;
    vec3 lit = albedo * starlight(vWorldPosition, normalize(vWorldNormal));
    // A thin bright rim on the lit side, as a hint of atmosphere: strongest at the silhouette.
    float facing = clamp(normalize(vViewNormal).z, 0.0, 1.0);
    lit += albedo * pow(1.0 - facing, 4.0) * 0.25 * min(length(lit), 1.0);
    // Exposure (tuning.ts SYSTEM_PLANET_EXPOSURE): about ×uExposure for dark surfaces, easing
    // toward white for bright ones, per channel.
    lit = 1.0 - exp(-uExposure * lit);
    gl_FragColor = vec4(lit, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Which layer and bake each drawn planet uses, for the test hooks. */
const drawnSurfaces = new Map<string, { layer: number; key: string }>();
export function planetSurfaceOf(id: string): { layer: number; key: string } | null {
  return drawnSurfaces.get(id) ?? null;
}

export function PlanetBodies({ objects }: RendererProps) {
  const invalidate = useThree((state) => state.invalidate);
  const gl = useThree((state) => state.gl);
  const policy = useSpoilerPolicy();
  const buffers = useMemo(
    () =>
      buildBodyBuffers(objects, policy, PLANET_BODIES, {
        minRadiusPx: SYSTEM_PLANET_MIN_PX,
        maxRadiusPx: SYSTEM_PLANET_MAX_PX,
      }),
    [objects, policy],
  );
  // Unsaved edits from the form, re-baked at most every PLANET_BAKE_DEBOUNCE_MS (rendering.md §9).
  const previews = useRateLimited(
    useAppearancePreview((state) => state.values),
    PLANET_BAKE_DEBOUNCE_MS,
  );
  // Uploaded maps load in the background; until one arrives its planet shows its generated
  // surface, and `loaded` is bumped to re-bake it.
  const [loaded, setLoaded] = useState(0);
  useEffect(() => {
    let active = true;
    for (const object of objects) {
      const url = surfaceUploadUrl(object, object.appearance.planet?.texture, policy);
      if (url === null || uploadedSurface(url)) continue;
      loadUploadedSurface(url).then(
        () => {
          if (active) setLoaded((value) => value + 1);
        },
        (error: unknown) => {
          console.warn(error);
        },
      );
    }
    return () => {
      active = false;
    };
  }, [objects, policy]);
  const surfaces = useMemo(
    () =>
      planetSurfaces(objects, buffers, SYSTEM_PLANET_TEXTURE_PX, policy, uploadedSurface, previews),
    // `loaded` stands for what uploadedSurface returns.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [objects, buffers, policy, previews, loaded],
  );
  const { geometry, mesh, material } = useInstancedSpheres(
    PLANET_BODIES,
    buffers,
    () => new SphereGeometry(1, PLANET_SEGMENTS, PLANET_SEGMENTS / 2),
    [
      {
        name: 'aLayer',
        array: new Float32Array(buffers.ids.map((_, index) => index)),
        itemSize: 1,
      },
      { name: 'aTiltRad', array: surfaces.tiltsRad, itemSize: 1 },
    ],
  );

  // Kept for the page's life, not disposed with the view (planet-texture-array.ts).
  const textures = systemPlanetTextures(
    SYSTEM_PLANET_TEXTURE_PX.width,
    SYSTEM_PLANET_TEXTURE_PX.height,
    SYSTEM_PLANET_INITIAL_LAYERS,
  );
  const uniforms = useMemo(
    () => ({
      ...lightUniforms(),
      uAmbient: { value: SYSTEM_PLANET_AMBIENT },
      uExposure: { value: SYSTEM_PLANET_EXPOSURE },
      uWorldPerPxAt1: { value: 1 },
      uMinRadiusPx: { value: SYSTEM_PLANET_MIN_PX },
      uMaxRadiusPx: { value: SYSTEM_PLANET_MAX_PX },
      uSurfaces: textures.uniform,
      uSurfaceSize: {
        value: new Vector2(SYSTEM_PLANET_TEXTURE_PX.width, SYSTEM_PLANET_TEXTURE_PX.height),
      },
    }),
    [textures],
  );

  // Bake before the next frame draws, so a planet never shows a blank or stale surface.
  useLayoutEffect(() => {
    textures.update(gl, surfaces.layers);
    // Through the material: React Three Fiber copied the uniform objects into it (see
    // use-lit-uniforms.ts), and a stack that grew has a new texture.
    textures.bindTo(material.current, 'uSurfaces');
    // A previewed tilt changes the attribute without rebuilding the geometry.
    const tilt = geometry.getAttribute('aTiltRad');
    if (tilt.array instanceof Float32Array && tilt.array !== surfaces.tiltsRad) {
      tilt.array.set(surfaces.tiltsRad);
      tilt.needsUpdate = true;
    }
    drawnSurfaces.clear();
    buffers.ids.forEach((id, layer) => {
      drawnSurfaces.set(id, { layer, key: textures.keys[layer] ?? '' });
    });
    invalidate();
  }, [gl, textures, surfaces, buffers, geometry, material, invalidate]);
  useLitUniforms(PLANET_BODIES, material, invalidate);
  useEffect(
    () => () => {
      drawnSurfaces.clear();
    },
    [],
  );

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
