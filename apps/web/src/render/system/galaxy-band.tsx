import { useEffect, useMemo } from 'react';
import { AdditiveBlending, BackSide, SphereGeometry } from 'three';
import { hexToLinear } from '../color.ts';
import {
  GALAXY_BAND_COLOR,
  GALAXY_BAND_INTENSITY,
  GALAXY_BAND_TILT_DEG,
  GALAXY_BAND_TURN_DEG,
  GALAXY_BAND_WIDTH_DEG,
} from '../tuning.ts';

const DEG = Math.PI / 180;

/**
 * The system view's backdrop besides the sky (rendering.md §7): a dim band across the sky
 * where the galaxy's disc runs, as you'd see it from a planet inside the disc, like the Milky
 * Way from Earth. One draw call.
 *
 * It's a sphere drawn around the camera at infinity, as the sky is (sky.tsx): only the camera's
 * turning moves it. For each pixel, the shader takes its direction and measures how far it is
 * from the band's great circle (a plane tilted GALAXY_BAND_TILT_DEG from the system's plane);
 * brightness falls off with that angle, broken up by a few octaves of cheap noise so it reads
 * as dust lanes and star clouds rather than a smooth stripe. The noise is a sum of sines, not
 * a texture lookup per octave, because the band is faint and covers few pixels' worth of detail.
 */
const VERTEX_SHADER = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = position;
    vec4 clip = projectionMatrix * vec4(mat3(viewMatrix) * position, 0.0);
    // At infinity, like the sky: not clipped by the far plane, drawn first, behind everything.
    gl_Position = vec4(clip.xy, 0.0, clip.w);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uBandNormal;
  varying vec3 vDirection;
  float lumpy(vec3 d) {
    return 0.55
      + 0.25 * sin(d.x * 7.0 + sin(d.z * 5.0) * 1.7)
      + 0.15 * sin(d.z * 13.0 + d.y * 11.0)
      + 0.08 * sin(d.x * 29.0 - d.z * 23.0);
  }
  void main() {
    vec3 d = normalize(vDirection);
    // Angle from the band's middle circle: asin of the component along the band's normal.
    float angle = asin(clamp(dot(d, uBandNormal), -1.0, 1.0));
    float width = ${(GALAXY_BAND_WIDTH_DEG * DEG).toFixed(5)};
    float band = exp(-(angle * angle) / (width * width));
    // A narrower dark lane down the middle, as the Milky Way's dust has.
    band *= 1.0 - 0.45 * exp(-(angle * angle) / (width * width * 0.08));
    gl_FragColor = vec4(uColor * band * lumpy(d), 1.0);
    #include <colorspace_fragment>
  }
`;

export function GalaxyBand() {
  const geometry = useMemo(() => new SphereGeometry(1, 48, 24), []);
  useEffect(
    () => () => {
      geometry.dispose();
    },
    [geometry],
  );
  const uniforms = useMemo(() => {
    const tilt = GALAXY_BAND_TILT_DEG * DEG;
    const turn = GALAXY_BAND_TURN_DEG * DEG;
    const [r, g, b] = hexToLinear(GALAXY_BAND_COLOR);
    return {
      uColor: {
        value: [r * GALAXY_BAND_INTENSITY, g * GALAXY_BAND_INTENSITY, b * GALAXY_BAND_INTENSITY],
      },
      // The system plane's normal (+Y), tilted about the X axis, then turned about Y.
      uBandNormal: {
        value: [Math.sin(tilt) * Math.sin(turn), Math.cos(tilt), Math.sin(tilt) * Math.cos(turn)],
      },
    };
  }, []);
  return (
    // In the opaque pass, just after the sky (-1) and before everything else: additive, so the
    // sky's stars show through it, and without depth, so everything drawn later covers it.
    <mesh geometry={geometry} renderOrder={-0.5} frustumCulled={false}>
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={uniforms}
        depthTest={false}
        depthWrite={false}
        blending={AdditiveBlending}
        // Seen from inside the sphere.
        side={BackSide}
      />
    </mesh>
  );
}
