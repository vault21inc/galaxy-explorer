import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { apiOn } from './contract/harness.ts';

/** Objects that orbit one star of a binary (D-29, M5-T4), over HTTP. */

describe('orbit centers', () => {
  it('must name a star beside the object, and deleting the star clears them', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url);
      try {
        const universe = (
          await api.expect(201, 'POST', '/universes', { slug: 'binary', name: rt.plain('Binary') })
        ).body.data as { id: string };
        const map = (
          await api.expect(201, 'POST', `/universes/${universe.id}/maps`, {
            slug: 'main',
            name: rt.plain('Main'),
          })
        ).body.data as { id: string };
        const create = async (name: string, baseType: string, extra: object = {}) =>
          (
            (
              await api.expect(201, 'POST', `/maps/${map.id}/objects`, {
                name: rt.plain(name),
                baseType,
                ...extra,
              })
            ).body.data as { id: string }
          ).id;
        const centauri = await create('Alpha Centauri', 'system', { explorable: true });
        const a = await create('A', 'star', { parentId: centauri, x: -1 });
        const b = await create('B', 'star', { parentId: centauri, x: 1 });
        const planet = await create('Bb', 'planet', { parentId: centauri, x: 2, orbitCenterId: b });

        // Another system's star, a planet, or the object itself: 422, about the field.
        const sol = await create('Sol', 'system');
        const sun = await create('Sun', 'star', { parentId: sol });
        const rejected = await api.expect(422, 'POST', `/maps/${map.id}/objects`, {
          name: rt.plain('Stray'),
          baseType: 'planet',
          parentId: centauri,
          orbitCenterId: sun,
        });
        expect(JSON.stringify(rejected.body)).toContain('orbitCenterId');
        await api.expect(422, 'POST', `/maps/${map.id}/objects`, {
          name: rt.plain('Moonish'),
          baseType: 'station',
          parentId: centauri,
          orbitCenterId: planet,
        });

        // The system view says what each child orbits.
        const view = (await api.expect(200, 'GET', `/objects/${centauri}/views/system`)).body
          .data as { children: { id: string; orbitCenterId: string | null }[] };
        const orbit = (id: string) => view.children.find((child) => child.id === id)?.orbitCenterId;
        expect([orbit(a), orbit(b), orbit(planet)]).toEqual([null, null, b]);

        // Deleting B leaves the planet orbiting the system's center.
        await api.expect(204, 'DELETE', `/objects/${b}`, { version: 1 });
        const after = (await api.expect(200, 'GET', `/objects/${planet}`)).body.data as {
          orbitCenterId: string | null;
        };
        expect(after.orbitCenterId).toBeNull();
      } finally {
        await api.close();
      }
    }));
});
