import { resolveGalaxySettings } from '@ge/domain/galaxy';
import { describe, expect, it } from 'vitest';
import { generateGalaxyPoints } from '../src/render/galaxy/galaxy-points.ts';

/** FNV-1a over the float bits: any change to any coordinate changes the hash. */
function hashFloats(values: Float32Array): string {
  const words = new Uint32Array(values.buffer, values.byteOffset, values.length);
  let hash = 0x811c9dc5;
  for (const word of words) {
    hash ^= word;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

const firstThousand = (seed: number) =>
  hashFloats(generateGalaxyPoints(resolveGalaxySettings({ seed }), 1_000).positions);

describe('generateGalaxyPoints', () => {
  it('gives the same first 1,000 points for the same seed', () => {
    expect(firstThousand(7)).toBe(firstThousand(7));
    // Pinned, so an unintended change to the sampler or the generator shows up here. If you
    // change them on purpose, update this value (and expect the stress map's look to shift).
    expect(firstThousand(7)).toMatchInlineSnapshot(`"c11c003b"`);
  });

  it('gives different points for a different seed', () => {
    expect(firstThousand(8)).not.toBe(firstThousand(7));
  });

  it('fills every buffer with finite values', () => {
    const points = generateGalaxyPoints(resolveGalaxySettings({ seed: 3 }), 2_000);
    expect(points.positions).toHaveLength(6_000);
    expect(points.colors).toHaveLength(6_000);
    expect(points.sizesLy).toHaveLength(2_000);
    for (const buffer of [points.positions, points.colors, points.sizesLy]) {
      expect(buffer.every(Number.isFinite)).toBe(true);
    }
    expect(points.colors.every((channel) => channel >= 0 && channel <= 1)).toBe(true);
  });
});
