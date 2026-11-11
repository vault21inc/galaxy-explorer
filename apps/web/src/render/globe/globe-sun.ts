import type { Sunlight } from '@ge/domain';
import { hexToLinear } from '../color.ts';
import { ORBIT_DEFAULT_SUN_COLOR, ORBIT_DEFAULT_SUN_DIRECTION } from '../tuning.ts';

/** The orbit view's light, ready for the shaders: a unit direction and a linear color. */
export interface GlobeSun {
  direction: [number, number, number];
  color: [number, number, number];
  /** It comes from a real star, rather than the default for a body outside any system. */
  fromStar: boolean;
}

/**
 * The light on a globe (M6-T3): the payload's sunlight, from the star the body orbits, or a
 * dim default for a rogue planet (ORBIT_DEFAULT_SUN_*).
 */
export function globeSun(sunlight: Sunlight | null): GlobeSun {
  if (!sunlight) {
    return {
      direction: normalized(ORBIT_DEFAULT_SUN_DIRECTION),
      color: [...ORBIT_DEFAULT_SUN_COLOR],
      fromStar: false,
    };
  }
  return {
    direction: normalized(sunlight.direction),
    color: hexToLinear(sunlight.color),
    fromStar: true,
  };
}

function normalized([x, y, z]: readonly [number, number, number]): [number, number, number] {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}
