import { describe, expect, it } from 'vitest';
import type { Universe } from '../src/api/containers.ts';
import { homeSections } from '../src/lib/home-sections.ts';

const universe = (slug: string, fields: Partial<Universe>): Universe =>
  ({
    id: slug,
    slug,
    owner: null,
    visibility: 'public',
    access: 'read',
    role: null,
    ...fields,
  }) as Universe;

describe('homeSections (M8-T11, ux.md §13)', () => {
  it('puts the reader’s own first, then those shared with them, then the public rest', () => {
    const mine = universe('mine', { owner: 'aemos', visibility: 'private', access: 'own' });
    const shared = universe('shared', {
      owner: 'gideon',
      visibility: 'private',
      access: 'read',
      role: 'viewer',
    });
    const editing = universe('editing', {
      owner: 'gideon',
      visibility: 'public',
      access: 'edit',
      role: 'editor',
    });
    const open = universe('open', { owner: 'gideon' });
    const installation = universe('installation', {});
    const {
      yours,
      shared: sharedList,
      others,
      rest,
    } = homeSections([mine, shared, editing, open, installation], 'aemos');
    expect(yours).toEqual([mine]);
    expect(sharedList).toEqual([shared, editing]);
    expect(others).toEqual([]);
    expect(rest).toEqual([open, installation]);
  });

  it('lists what an admin reaches only as an admin apart from what’s shared with them (D-50)', () => {
    const theirs = universe('theirs', { owner: 'gideon', visibility: 'private', access: 'edit' });
    const linked = universe('linked', { owner: 'gideon', visibility: 'link', access: 'edit' });
    const open = universe('open', { owner: 'gideon', access: 'edit' });
    const shared = universe('shared', {
      owner: 'gideon',
      visibility: 'private',
      access: 'edit',
      role: 'viewer',
    });
    const installation = universe('installation', { visibility: 'private', access: 'own' });
    const sections = homeSections([theirs, linked, open, shared, installation], 'aemos');
    expect(sections.others).toEqual([theirs, linked]);
    // Shared with them as a viewer: still shared, though being an admin lets them edit it.
    expect(sections.shared).toEqual([shared, installation]);
    // A public one stays with the public rest.
    expect(sections.rest).toEqual([open]);
  });
});
