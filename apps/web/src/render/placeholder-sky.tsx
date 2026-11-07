import { useMemo } from 'react';
import { generateSkyPoints } from './sky-points.ts';
import {
  SKY_RADIUS,
  SKY_SEED,
  SKY_STAR_COUNT,
  SKY_STAR_MIN_BRIGHTNESS,
  SKY_STAR_SIZE_PX,
} from './tuning.ts';

/**
 * A placeholder sky of 5,000 stars, drawn as one `<points>` object: one draw call for all of
 * them (rendering.md §1, concept 5). M2 replaces it with the baked galaxy background.
 *
 * The geometry and material are declared in JSX, so React Three Fiber disposes of them when
 * this unmounts (rendering.md §13).
 */
export function PlaceholderSky() {
  const { positions, colors } = useMemo(
    () =>
      generateSkyPoints({
        count: SKY_STAR_COUNT,
        radius: SKY_RADIUS,
        minBrightness: SKY_STAR_MIN_BRIGHTNESS,
        seed: SKY_SEED,
      }),
    [],
  );

  return (
    <points>
      <bufferGeometry>
        {/* `attach` puts each buffer on the geometry as its `position` and `color` attribute;
            the 3 means three numbers per star. */}
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[colors, 3]} />
      </bufferGeometry>
      {/* sizeAttenuation=false keeps each star the same size on screen at any distance. three.js
          multiplies `size` by the pixel ratio, so it's in CSS pixels. */}
      <pointsMaterial size={SKY_STAR_SIZE_PX} sizeAttenuation={false} vertexColors />
    </points>
  );
}
