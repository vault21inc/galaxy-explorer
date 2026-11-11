import { describe, expect, it } from 'vitest';
import { IconKey, iconKey, parseIconKey } from '../src/index.ts';

/** Icon keys (M6-T4, D-32). */

describe('icon keys', () => {
  it('name a set and an icon; a key without a set is Lucide’s', () => {
    expect(parseIconKey('game-icons:crossed-swords')).toEqual({
      set: 'game-icons',
      name: 'crossed-swords',
    });
    expect(parseIconKey('lucide:flag')).toEqual({ set: 'lucide', name: 'flag' });
    expect(parseIconKey('swords')).toEqual({ set: 'lucide', name: 'swords' });
    expect(iconKey('game-icons', 'skull')).toBe('game-icons:skull');
  });

  it('accept only set:name keys of lowercase words', () => {
    for (const ok of ['flag', 'lucide:flag', 'game-icons:crossed-swords', 'building-2']) {
      expect(IconKey.safeParse(ok).success, ok).toBe(true);
    }
    for (const bad of ['', 'Flag', 'other:flag', 'game-icons:', '<svg>', 'a b', 'lucide:flag:x']) {
      expect(IconKey.safeParse(bad).success, bad).toBe(false);
    }
  });
});
