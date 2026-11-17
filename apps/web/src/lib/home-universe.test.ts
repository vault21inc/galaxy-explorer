import { describe, expect, it } from 'vitest';
import { homeUniverseFor } from './home-universe.ts';

const universes = [{ slug: 'milky-way' }, { slug: 'example-universe' }];
const visitor = {
  homeUniverse: 'milky-way',
  homePath: null,
  accounts: true,
  signedOut: true,
  universes,
};

describe('homeUniverseFor (D-51)', () => {
  it('opens the home universe for a signed-out visitor who can read it', () => {
    expect(homeUniverseFor(visitor)).toBe('/u/milky-way');
  });

  it('opens the path into it the server names: a view, a selection, a camera', () => {
    const homePath = '/u/milky-way/present-day/view/sol?select=earth&cam=1,2,3,0,0,0';
    expect(homeUniverseFor({ ...visitor, homePath })).toBe(homePath);
    // A path into another universe isn't the home universe's: its own address instead.
    expect(homeUniverseFor({ ...visitor, homePath: '/u/example-universe/main' })).toBe(
      '/u/milky-way',
    );
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
