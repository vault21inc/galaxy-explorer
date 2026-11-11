import { describe, expect, it } from 'vitest';
import { shownWhere, type LocationRef, type ObjectRef } from '@/panels/relations/shown-where.ts';

/** Which view shows an event, and what's selected there (M6-T6). */

const objects: Record<string, ObjectRef> = {
  planet: { baseType: 'planet', parentId: 'system' },
  system: { baseType: 'system', parentId: null },
  station: { baseType: 'station', parentId: 'system' },
};
const locations: Record<string, LocationRef> = {
  hive: { mode: 'surface', objectId: 'planet', placeId: null },
};
const lookups = {
  location: (id: string) => Promise.resolve(locations[id] ?? null),
  object: (id: string) => {
    const object = objects[id];
    return object ? Promise.resolve(object) : Promise.reject(new Error(id));
  },
};
const at = (location: Partial<LocationRef>) =>
  shownWhere('event', { mode: 'surface', objectId: null, placeId: null, ...location }, lookups);

describe('shownWhere', () => {
  it('opens a body’s orbit view for a pin on it or at it', async () => {
    expect(await at({ objectId: 'planet' })).toEqual({ objectId: 'planet', select: 'event' });
    expect(await at({ mode: 'object', objectId: 'planet' })).toEqual({
      objectId: 'planet',
      select: 'event',
    });
  });

  it('opens the galaxy view for a marker at a top-level object, or in deep space', async () => {
    expect(await at({ mode: 'object', objectId: 'system' })).toEqual({
      objectId: null,
      select: 'event',
    });
    expect(await at({ mode: 'space' })).toEqual({ objectId: null, select: 'event' });
  });

  it('opens a system view for a marker in its space', async () => {
    expect(await at({ mode: 'space', objectId: 'system' })).toEqual({
      objectId: 'system',
      select: 'event',
    });
  });

  it('selects the object for an event at one nothing draws it beside', async () => {
    expect(await at({ mode: 'object', objectId: 'station' })).toEqual({
      objectId: 'station',
      select: 'station',
    });
  });

  it('follows a place to where it is, selecting the event', async () => {
    expect(await at({ mode: 'place', placeId: 'hive' })).toEqual({
      objectId: 'planet',
      select: 'event',
    });
    expect(await at({ mode: 'place', placeId: 'gone' })).toEqual({
      objectId: null,
      select: 'event',
    });
  });
});
