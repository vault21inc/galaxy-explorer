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

describe('the orbit view’s sunlight (M6-T3)', () => {
  it('points from the body to the star it orbits, else the largest; moons share their planet’s', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url);
      try {
        const universe = (
          await api.expect(201, 'POST', '/universes', { slug: 'sun', name: rt.plain('Sun') })
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
        const sunlight = async (id: string) =>
          (
            (await api.expect(200, 'GET', `/objects/${id}/views/orbit`)).body.data as {
              sunlight: { direction: number[]; color: string } | null;
            }
          ).sunlight;
        const closeTo = (actual: number[] | undefined, expected: number[]) => {
          expected.forEach((value, axis) => {
            expect(actual?.[axis]).toBeCloseTo(value, 9);
          });
        };

        const system = await create('Pair', 'system', { explorable: true });
        // The large star at the center, a small one off to the side.
        await create('Big', 'star', { parentId: system, appearance: { scale: { system: 2 } } });
        const small = await create('Small', 'star', {
          parentId: system,
          z: 10,
          appearance: { star: { temperatureK: 3_000 } },
        });
        const planet = await create('World', 'planet', {
          parentId: system,
          x: 4,
          explorable: true,
        });
        const moon = await create('Moon', 'moon', { parentId: planet, x: 3, explorable: true });

        // Toward the largest star, at the center: −X from the planet.
        const lit = await sunlight(planet);
        closeTo(lit?.direction, [-1, 0, 0]);
        expect(lit?.color).toMatch(/^#[0-9a-f]{6}$/);
        // The moon's light comes from where its planet's does.
        closeTo((await sunlight(moon))?.direction, [-1, 0, 0]);

        // Orbiting the small star instead: toward it, in its redder color.
        await api.expect(200, 'PATCH', `/objects/${planet}`, {
          version: 1,
          orbitCenterId: small,
        });
        const around = await sunlight(planet);
        closeTo(around?.direction, [-4 / Math.hypot(4, 10), 0, 10 / Math.hypot(4, 10)]);
        expect(around?.color).not.toBe(lit?.color);

        // A rogue planet has no sun.
        const rogue = await create('Rogue', 'planet', { explorable: true });
        expect(await sunlight(rogue)).toBeNull();
      } finally {
        await api.close();
      }
    }));
});
