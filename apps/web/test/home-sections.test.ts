import { describe, expect, it } from 'vitest';
import type { Universe } from '../src/api/containers.ts';
import { homeSections } from '../src/lib/home-sections.ts';

const universe = (slug: string, fields: Partial<Universe>): Universe =>
  ({ id: slug, slug, owner: null, visibility: 'public', access: 'read', ...fields }) as Universe;

describe('homeSections (M8-T11, ux.md §13)', () => {
  it('puts the reader’s own first, then those shared with them, then the public rest', () => {
    const mine = universe('mine', { owner: 'aemos', visibility: 'private', access: 'own' });
    const shared = universe('shared', { owner: 'gideon', visibility: 'private', access: 'read' });
    const editing = universe('editing', { owner: 'gideon', visibility: 'public', access: 'edit' });
    const open = universe('open', { owner: 'gideon' });
    const installation = universe('installation', {});
    const {
      yours,
      shared: sharedList,
      rest,
    } = homeSections([mine, shared, editing, open, installation], 'aemos');
    expect(yours).toEqual([mine]);
    expect(sharedList).toEqual([shared, editing]);
    expect(rest).toEqual([open, installation]);
  });
});
