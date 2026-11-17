import { describe, expect, it } from 'vitest';
import { homeUniverseFor } from './home-universe.ts';

const universes = [{ slug: 'milky-way' }, { slug: 'example-universe' }];
const visitor = { homeUniverse: 'milky-way', accounts: true, signedOut: true, universes };

describe('homeUniverseFor (D-51)', () => {
  it('opens the home universe for a signed-out visitor who can read it', () => {
    expect(homeUniverseFor(visitor)).toBe('milky-way');
  });

  it('lists the universes when none is set', () => {
    expect(homeUniverseFor({ ...visitor, homeUniverse: null })).toBeNull();
    expect(homeUniverseFor({ ...visitor, homeUniverse: undefined })).toBeNull();
  });

  it('lists them for anyone signed in, or still loading, and on a site without accounts', () => {
    expect(homeUniverseFor({ ...visitor, signedOut: false })).toBeNull();
    expect(homeUniverseFor({ ...visitor, accounts: false })).toBeNull();
  });

  it('lists them when the home universe isn’t one the visitor can open (private, or gone)', () => {
    expect(homeUniverseFor({ ...visitor, universes: [{ slug: 'example-universe' }] })).toBeNull();
  });
});
