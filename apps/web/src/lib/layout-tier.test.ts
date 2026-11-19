import { describe, expect, it } from 'vitest';
import css from '../index.css?raw';
import { LAYOUT_QUERIES } from './layout-tier.ts';

/**
 * The tiers are written twice: as constants for the hooks, and as Tailwind variants in
 * index.css, which can't import them. This holds the two to the same queries.
 */
describe('layout tiers', () => {
  const declared = new Map(
    [...css.matchAll(/@custom-variant ([\w-]+) \(@media (.+)\);/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );

  it.each(Object.entries(LAYOUT_QUERIES))('index.css declares `%s:` as %s', (name, query) => {
    expect(declared.get(name)).toBe(query);
  });

  it('declares no tier variant the constants lack', () => {
    const tiers = [...declared.keys()].filter((name) => name !== 'dark');
    expect(tiers.toSorted()).toEqual(Object.keys(LAYOUT_QUERIES).toSorted());
  });
});
