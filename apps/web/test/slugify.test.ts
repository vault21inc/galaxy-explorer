import { Slug } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { slugify } from '../src/lib/slugify.ts';

describe('slugify', () => {
  it.each([
    ['Warhammer 40,000', 'warhammer-40000'],
    ['  The Present Era  ', 'the-present-era'],
    ['Été à Montréal', 'ete-a-montreal'],
    ["Rogue Trader's Reach", 'rogue-traders-reach'],
    ['--Gudrun--System--', 'gudrun-system'],
  ])('%s → %s', (name, slug) => {
    expect(slugify(name)).toBe(slug);
    expect(Slug.safeParse(slugify(name)).success).toBe(true);
  });

  it('returns an empty string when nothing usable is left', () => {
    expect(slugify('!!!')).toBe('');
  });

  it('never ends in a hyphen after truncating', () => {
    expect(slugify('abc def', 4)).toBe('abc');
  });
});
