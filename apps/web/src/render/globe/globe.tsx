import { planetDefaults, type Sunlight, type ViewObject, type ViewPin } from '@ge/domain';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import { AdditiveBlending, BackSide, SphereGeometry, Vector3, type Group, type Mesh } from 'three';
import { useAppearancePreview, useRateLimited, withPreview } from '@/state/appearance-preview.ts';
import { useAmbientMotion } from '@/state/quality.ts';
import { hexToLinear } from '../color.ts';
import { paceFrames } from '../frame-pacing.ts';
import { publishLights } from '../stars/system-lights.ts';
import {
  AMBIENT_MOTION_FPS,
  GLOBE_AMBIENT,
  GLOBE_ATMOSPHERE_SEGMENTS,
  GLOBE_CLOUD_DRIFT_DEG_PER_S,
  GLOBE_CLOUD_OPACITY,
  GLOBE_CLOUD_RADIUS,
  GLOBE_CLOUD_SEGMENTS,
  GLOBE_EXPOSURE,
  GLOBE_HAZE_STRENGTH,
  GLOBE_LIGHTS_GAIN,
  GLOBE_NIGHT_FULL,
  GLOBE_NIGHT_NONE,
  GLOBE_SEGMENTS,
  GLOBE_SPECULAR_POWER,
  GLOBE_SPECULAR_STRENGTH,
  GLOBE_SPIN_DEG_PER_S,
  GLOBE_TERMINATOR_WRAP,
  PLANET_BAKE_DEBOUNCE_MS,
} from '../tuning.ts';
import { Pins } from '../pins/pins.tsx';
import { GlobeRings } from './globe-rings.tsx';
import {
  ATMOSPHERE_FRAGMENT,
  CLOUD_FRAGMENT,
  GLOBE_FRAGMENT,
  GLOBE_VERTEX,
} from './globe-shaders.ts';
import { publishGlobe } from './globe-state.ts';
import { globeSun } from './globe-sun.ts';
import { useGlobeTextures } from './use-globe-textures.ts';

const DEG = Math.PI / 180;
/** A star this many radii away lights the moons as the sun lights the globe: in parallel. */
const SUN_DISTANCE_RADII = 10_000;
/** After a pause, the spin carries on from where it was rather than jumping ahead. */
const MAX_STEP_S = 0.1;

/**
 * The orbit view's globe (rendering.md §8, M6-T3), at the origin with radius 1, in up to four
 * draws: the surface, its clouds, its atmosphere and its rings, all inside one group turned by
 * the planet's axial tilt (a turn about X, as in the system view: the north pole leans from +Y
 * toward +Z). Unsaved edits from the form show live, re-baked at most every 150 ms.
 *
 * Ambient motion (quality settings) turns the surface about its own axis and the clouds a
 * little faster; it asks for a frame AMBIENT_MOTION_FPS times a second and nothing more, and
 * when it's off nothing moves and nothing is drawn.
 */
export function Globe({
  subject,
  sunlight,
  pins,
  universeId,
}: {
  subject: ViewObject;
  sunlight: Sunlight | null;
  /** Places and events on it (M6-T4), drawn on the surface and turning with it. */
  pins: readonly ViewPin[];
  universeId: string;
}) {
  const invalidate = useThree((state) => state.invalidate);
  const previews = useRateLimited(
    useAppearancePreview((state) => state.values),
    PLANET_BAKE_DEBOUNCE_MS,
  );
  const planet = useMemo(
    () => withPreview(subject.appearance, previews.get(subject.id)).planet,
    [subject, previews],
  );
  const textures = useGlobeTextures(subject, planet);
  const sun = useMemo(() => globeSun(sunlight), [sunlight]);
  const defaults = planetDefaults(textures.surface.preset);
  const atmosphere = { ...defaults.atmosphere, ...planet?.atmosphere };
  const clouds = textures.surface.clouds;
  const lights = textures.surface.lights;
  const rings = planet?.rings?.enabled ? planet.rings : null;
  const tiltRad = (planet?.axialTiltDeg ?? 0) * DEG;

  // The moons and stations are lit by the same star, through the system view's light uniforms.
  useEffect(() => {
    const [x, y, z] = sun.direction;
    const far = SUN_DISTANCE_RADII;
    publishLights([{ position: [x * far, y * far, z * far], color: sun.color }]);
    return () => {
      publishLights(null);
    };
  }, [sun]);

  const geometries = useMemo(
    () => ({
      surface: new SphereGeometry(1, ...GLOBE_SEGMENTS),
      clouds: new SphereGeometry(GLOBE_CLOUD_RADIUS, ...GLOBE_CLOUD_SEGMENTS),
    }),
    [],
  );
  const shellRadius = 1 + (atmosphere.thickness ?? 0.08);
  const shell = useMemo(
    () => new SphereGeometry(shellRadius, ...GLOBE_ATMOSPHERE_SEGMENTS),
    [shellRadius],
  );
  useEffect(
    () => () => {
      geometries.surface.dispose();
      geometries.clouds.dispose();
    },
    [geometries],
  );
  useEffect(
    () => () => {
      shell.dispose();
    },
    [shell],
  );

  // New uniform objects when anything changes: React Three Fiber copies their values into
  // the materials (use-lit-uniforms.ts), so writing to these later would reach nothing.
  const atmosphereColor = atmosphere.enabled ? hexToLinear(atmosphere.color ?? '#9cc8ff') : null;
  const atmosphereKey = atmosphereColor?.join(',') ?? '';
  const surfaceUniforms = useMemo(() => {
    const lightColor = lights ? hexToLinear(lights.color) : [0, 0, 0];
    const gain = (lights?.intensity ?? 0) * GLOBE_LIGHTS_GAIN;
    return {
      uAlbedo: { value: textures.albedo },
      uLayers: { value: textures.layers },
      uUploaded: { value: textures.uploaded ? 1 : 0 },
      uBakeSize: { value: textures.bakeSize },
      uSunDir: { value: sun.direction },
      uSunColor: { value: sun.color },
      uAmbient: { value: GLOBE_AMBIENT },
      uExposure: { value: GLOBE_EXPOSURE },
      uWrap: { value: GLOBE_TERMINATOR_WRAP },
      uSpecularPower: { value: GLOBE_SPECULAR_POWER },
      uSpecularStrength: { value: GLOBE_SPECULAR_STRENGTH },
      uLightsColor: { value: lightColor.map((channel) => channel * gain) },
      uNightRange: { value: [GLOBE_NIGHT_FULL, GLOBE_NIGHT_NONE] },
      uHazeColor: {
        value: atmosphereColor
          ? atmosphereColor.map((channel) => channel * GLOBE_HAZE_STRENGTH)
          : [0, 0, 0],
      },
    };
    // `atmosphereKey` stands for the color's value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textures, sun, lights, atmosphereKey]);
  const cloudUniforms = useMemo(
    () => ({
      uLayers: { value: textures.layers },
      uBakeSize: { value: textures.bakeSize },
      uCloudColor: { value: hexToLinear(clouds?.color ?? '#ffffff') },
      uOpacity: { value: GLOBE_CLOUD_OPACITY },
      uSunDir: { value: sun.direction },
      uSunColor: { value: sun.color },
      uAmbient: { value: GLOBE_AMBIENT },
      uExposure: { value: GLOBE_EXPOSURE },
      uWrap: { value: GLOBE_TERMINATOR_WRAP },
    }),
    [textures, clouds, sun],
  );
  const atmosphereUniforms = useMemo(
    () => ({ uColor: { value: atmosphereColor ?? [0, 0, 0] }, uSunDir: { value: sun.direction } }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [atmosphereKey, sun],
  );

  // Ambient motion (rendering.md §8): the timer is the clock. Each tick turns the globe by the
  // time since the last one and asks for a frame; frames only draw the angle. Were frames to
  // turn it themselves, every frame would move the pins, whose new places ask for another
  // frame, and the globe would draw at the display's rate (240 a second on a fast monitor)
  // instead of 30. The timer also tells the frame-rate guard these frames come on purpose.
  const motion = useAmbientMotion();
  const surface = useRef<Group>(null);
  const cloudMesh = useRef<Mesh>(null);
  const spin = useRef({ angleRad: 0 });
  useEffect(() => {
    if (!motion) return;
    const intervalMs = 1_000 / AMBIENT_MOTION_FPS;
    const release = paceFrames(intervalMs);
    let lastMs = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const stepS = Math.min((now - lastMs) / 1_000, MAX_STEP_S);
      lastMs = now;
      spin.current.angleRad += stepS * GLOBE_SPIN_DEG_PER_S * DEG;
      invalidate();
    }, intervalMs);
    return () => {
      clearInterval(timer);
      release();
    };
  }, [motion, invalidate]);
  useFrame(() => {
    const state = spin.current;
    if (surface.current) surface.current.rotation.y = state.angleRad;
    if (cloudMesh.current) {
      const driftRad = (state.angleRad / GLOBE_SPIN_DEG_PER_S) * GLOBE_CLOUD_DRIFT_DEG_PER_S;
      cloudMesh.current.rotation.y = state.angleRad + driftRad;
    }
  });

  useEffect(() => {
    publishGlobe({
      subjectId: subject.id,
      albedoKey: textures.albedoKey,
      layersKey: textures.layersKey,
      uploaded: textures.uploaded,
      tiltDeg: planet?.axialTiltDeg ?? 0,
      clouds: clouds !== null,
      atmosphere: atmosphereColor !== null,
      rings: rings !== null,
      sunFromStar: sun.fromStar,
      spinDeg: () => spin.current.angleRad / DEG,
      toWorld: (point) => {
        const group = surface.current;
        if (!group) return [...point];
        group.updateWorldMatrix(true, false);
        const world = new Vector3(...point).applyMatrix4(group.matrixWorld);
        return [world.x, world.y, world.z];
      },
      toGlobe: (point) => {
        const group = surface.current;
        if (!group) return [...point];
        group.updateWorldMatrix(true, false);
        const local = group.worldToLocal(new Vector3(...point));
        return [local.x, local.y, local.z];
      },
    });
    invalidate();
    return () => {
      publishGlobe(null);
    };
  });

  return (
    <group rotation-x={tiltRad}>
      {/* The surface and its pins turn together about the globe's axis. */}
      <group ref={surface}>
        <mesh geometry={geometries.surface}>
          <shaderMaterial
            vertexShader={GLOBE_VERTEX}
            fragmentShader={GLOBE_FRAGMENT}
            uniforms={surfaceUniforms}
          />
        </mesh>
        <Pins pins={pins} universeId={universeId} />
      </group>
      {clouds && (
        <mesh ref={cloudMesh} geometry={geometries.clouds} renderOrder={1}>
          <shaderMaterial
            vertexShader={GLOBE_VERTEX}
            fragmentShader={CLOUD_FRAGMENT}
            uniforms={cloudUniforms}
            transparent
            depthWrite={false}
          />
        </mesh>
      )}
      {rings && <GlobeRings rings={rings} sun={sun} />}
      {atmosphereColor && (
        <mesh geometry={shell} renderOrder={3}>
          <shaderMaterial
            vertexShader={GLOBE_VERTEX}
            fragmentShader={ATMOSPHERE_FRAGMENT}
            uniforms={atmosphereUniforms}
            side={BackSide}
            blending={AdditiveBlending}
            transparent
            depthWrite={false}
          />
        </mesh>
      )}
    </group>
  );
}
