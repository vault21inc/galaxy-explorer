import type { GalaxyObject, SpoilerPolicy } from '@ge/domain';
import { hexToLinear } from '../color.ts';
import { labelText } from '../labels/label-text.ts';
import { bodyState } from '../bodies/body-buffers.ts';
import { BODY_STATES } from '../bodies/body-buffers.ts';
import type { DrawnObject } from '../scene-index.ts';
import {
  REDACTION_COLOR,
  SYSTEM_GLYPH_MAX_PLANETS,
  SYSTEM_STAR_MAX_PX,
  SYSTEM_STAR_MIN_PX,
} from '../tuning.ts';
import { angleOf, type GlyphBuffers } from './use-glyph-quads.ts';
import { systemGlyphCell } from './system-glyph-atlas.ts';
import { viewOpenedBy } from '@/state/opens-view.ts';

/** What a system's glyph shows, before it's packed for the GPU. Pure and unit-tested. */
export interface SystemGlyph {
  /** Star colors, largest first: 1 to 3 of them. */
  stars: { color: string; sizeShare: number }[];
  planets: number;
}

/**
 * The glyph for a system (D-28, D-29) under the spoiler policy:
 * - a hidden spoiler system is one grey star with no rings, giving nothing away;
 * - otherwise its visible stars (hidden spoiler stars are left out), or, with none, one star in
 *   the system's own color; and its planets, counting spoiler planets only when spoilers show.
 */
export function systemGlyph(object: GalaxyObject, policy: SpoilerPolicy): SystemGlyph {
  if (bodyState(object, policy) === 'redacted') {
    return { stars: [{ color: REDACTION_COLOR, sizeShare: 1 }], planets: 0 };
  }
  const stars = object.stars
    .filter((star) => !star.isSpoiler || policy.showAll)
    .map(({ color, sizeShare }) => ({ color, sizeShare }));
  const planets = object.planetCount + (policy.showAll ? object.spoilerPlanetCount : 0);
  return {
    stars:
      stars.length > 0
        ? stars
        : [{ color: object.appearance.color ?? REDACTION_COLOR, sizeShare: 1 }],
    planets: Math.min(planets, SYSTEM_GLYPH_MAX_PLANETS),
  };
}

export function buildSystemGlyphBuffers(
  objects: readonly GalaxyObject[],
  policy: SpoilerPolicy,
  renderer: string,
): GlyphBuffers {
  const count = objects.length;
  const centers = new Float32Array(count * 3);
  const radii = new Float32Array(count);
  const cells = new Float32Array(count * 2);
  const rotations = new Float32Array(count);
  const states = new Float32Array(count);
  // Three star colors per system, each already scaled by its size share (a smaller star is a
  // dimmer one), and the color of its rings.
  const starColors = [0, 1, 2].map(() => new Float32Array(count * 3));
  const ringColors = new Float32Array(count * 3);
  const ids: string[] = [];
  const drawn: DrawnObject[] = [];

  objects.forEach((object, i) => {
    const state = bodyState(object, policy);
    const glyph = systemGlyph(object, policy);
    const radius = state === 'redacted' ? 0 : (object.size ?? 0);
    ids.push(object.id);
    centers.set(object.position, i * 3);
    radii[i] = radius;
    cells.set(systemGlyphCell(glyph.stars.length, glyph.planets), i * 2);
    rotations[i] = angleOf(object.id);
    states[i] = BODY_STATES[state];
    glyph.stars.forEach((star, s) => {
      const [r, g, b] = hexToLinear(star.color);
      const brightness = 0.55 + 0.45 * star.sizeShare;
      starColors[s]?.set([r * brightness, g * brightness, b * brightness], i * 3);
    });
    // Rings: the main star's color, paled toward white and dimmed, so they read as orbits.
    const [r, g, b] = hexToLinear(glyph.stars[0]?.color ?? REDACTION_COLOR);
    ringColors.set([(r + 0.6) * 0.55, (g + 0.6) * 0.55, (b + 0.6) * 0.55], i * 3);
    const color = glyph.stars[0]?.color ?? REDACTION_COLOR;
    drawn.push({
      id: object.id,
      renderer,
      center: object.position,
      radius,
      minRadiusPx: SYSTEM_STAR_MIN_PX,
      maxRadiusPx: SYSTEM_STAR_MAX_PX,
      state,
      color,
      pickPriority: 1,
      opensView: viewOpenedBy(object) !== null,
      label: labelText(object, policy),
      labelPriority: object.appearance.labelPriority ?? 0,
    });
  });

  return {
    ids,
    centers,
    drawn,
    attributes: [
      { name: 'aRadius', array: radii, itemSize: 1 },
      { name: 'aCell', array: cells, itemSize: 2 },
      { name: 'aRotation', array: rotations, itemSize: 1 },
      { name: 'aState', array: states, itemSize: 1 },
      { name: 'aStar1', array: starColors[0] ?? new Float32Array(count * 3), itemSize: 3 },
      { name: 'aStar2', array: starColors[1] ?? new Float32Array(count * 3), itemSize: 3 },
      { name: 'aStar3', array: starColors[2] ?? new Float32Array(count * 3), itemSize: 3 },
      { name: 'aRing', array: ringColors, itemSize: 3 },
    ],
  };
}
