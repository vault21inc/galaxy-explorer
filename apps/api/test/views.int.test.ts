import { schema } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedDemo } from '../src/seeds/demo.ts';
import { apiOn, type Api } from './contract/harness.ts';

/**
 * The view payloads (M1-T9). The snapshot covers the demo seed (M1-T11); the targeted tests use
 * a small fixture built with one batch request, so each case is easy to see.
 */

const run = (fn: (api: Api) => Promise<void>) =>
  withTestDb(async (_db, url) => {
    const api = await apiOn(url);
    try {
      await fn(api);
    } finally {
      await api.close();
    }
  });

async function buildFixture(api: Api) {
  const universeId = (
    await api.expect(201, 'POST', '/universes', { slug: 'w', name: rt.plain('W') })
  ).body.data.id as string;
  const mapId = (
    await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
      slug: 'm41',
      name: rt.plain('M41'),
      galaxySettings: { arms: 2 },
    })
  ).body.data.id as string;
  const sectorTypeId = (
    await api.expect(201, 'POST', `/universes/${universeId}/group-types`, {
      name: 'Sector',
      layer: 'Administrative',
      defaultColor: '#c8a24a',
    })
  ).body.data.id as string;
  const hiveId = (
    await api.expect(201, 'POST', `/universes/${universeId}/object-subtypes`, {
      baseType: 'planet',
      name: 'Hive World',
      defaultAppearance: { color: '#aa8844', scale: { galaxy: 2, system: 3 } },
    })
  ).body.data.id as string;
  const object = (name: string, baseType: string, extra: object = {}) => ({
    op: 'create',
    kind: 'celestial_object',
    mapId,
    data: { name: rt.plain(name), baseType, ...extra },
  });
  const built = await api.expect(200, 'POST', '/batch', {
    description: 'Fixture',
    operations: [
      object('Gudrun', 'system', { explorable: true, x: 100, y: 0, z: 50 }), // 0
      object('Gudrun Prime', 'star', { parentId: '$op:0' }), // 1
      object('Gudrun I', 'planet', {
        parentId: '$op:0',
        explorable: true,
        x: 5,
        subtypeId: hiveId,
        appearance: { scale: { system: 0.5 } },
      }), // 2
      object('Gudrun II', 'planet', { parentId: '$op:0', x: 9 }), // 3
      object('Gudrun I-a', 'moon', { parentId: '$op:2', x: 3 }), // 4
      object('Eye of Night', 'nebula', { x: -500, appearance: { region: { radius: 800 } } }), // 5
      {
        op: 'create',
        kind: 'celestial_object',
        mapId,
        data: { name: rt.md('The ||hidden|| star'), baseType: 'system', x: 900 },
      }, // 6
      object('Secret System', 'system', { x: 50 }), // 7
      object('Rogue', 'planet', { explorable: true, x: -200 }), // 8
      {
        op: 'create',
        kind: 'group',
        mapId,
        data: { name: rt.plain('Helican'), groupTypeId: sectorTypeId },
      }, // 9
      {
        op: 'addMembers',
        id: '$op:9',
        data: [{ objectId: '$op:0' }, { objectId: '$op:7', isSpoiler: true }],
      }, // 10
      { op: 'create', kind: 'place', mapId, data: { name: rt.plain('Hive Primus') } }, // 11
      {
        op: 'setLocation',
        id: '$op:11',
        data: { mode: 'surface', objectId: '$op:2', latDeg: 10, lonDeg: 20 },
      }, // 12
      {
        op: 'create',
        kind: 'event',
        mapId,
        data: { name: rt.plain('Siege of Hive Primus'), dateText: '240.M41' },
      }, // 13
      { op: 'setLocation', id: '$op:13', data: { mode: 'place', placeId: '$op:11' } }, // 14
      {
        op: 'create',
        kind: 'event',
        mapId,
        data: { name: rt.plain('Orbital duel'), isSpoiler: true },
      }, // 15
      { op: 'setLocation', id: '$op:15', data: { mode: 'object', objectId: '$op:2' } }, // 16
      { op: 'create', kind: 'place', mapId, data: { name: rt.plain('Hidden Vault') } }, // 17
      {
        op: 'setLocation',
        id: '$op:17',
        data: { mode: 'surface', objectId: '$op:2', latDeg: -45, lonDeg: 100, isSpoiler: true },
      }, // 18
      object('Draft System', 'system', { x: 1 }), // 19
    ],
  });
  const ids = (built.body.data.results as { id: string }[]).map((result) => result.id);
  // One draft: readers who don't ask for drafts never see it.
  await api.expect(200, 'PATCH', `/objects/${ids[19] ?? ''}`, { version: 1, status: 'draft' });
  return { universeId, mapId, ids, hiveId, sectorTypeId };
}

/** Replaces ids with stable labels, so the snapshot doesn't change between runs. */
function stable(value: unknown, ids = new Map<string, string>()): unknown {
  if (typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-7/.test(value)) {
    if (!ids.has(value)) ids.set(value, `<id ${String(ids.size)}>`);
    return ids.get(value);
  }
  if (Array.isArray(value)) return value.map((item) => stable(item, ids));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, field]) => [key, stable(field, ids)]),
    );
  }
  return value;
}

describe('view payloads', () => {
  it('match the snapshot for the demo seed (galaxy, system and orbit)', () =>
    withTestDb(async (db, url) => {
      const { mapId } = await seedDemo(db);
      const api = await apiOn(url);
      try {
        const objectId = async (key: string) => {
          const rows = await db
            .select({ id: schema.entities.id })
            .from(schema.entities)
            .where(eq(schema.entities.externalKey, key));
          return rows[0]?.id ?? '';
        };
        const galaxy = (await api.expect(200, 'GET', `/maps/${mapId}/views/galaxy`)).body.data;
        const system = (
          await api.expect(200, 'GET', `/objects/${await objectId('demo-aster')}/views/system`)
        ).body.data;
        const orbit = (
          await api.expect(200, 'GET', `/objects/${await objectId('demo-aster-ii')}/views/orbit`)
        ).body.data;
        expect(stable({ galaxy, system, orbit })).toMatchSnapshot();
      } finally {
        await api.close();
      }
    }));

  it('galaxy: top-level objects only, resolved appearance, groups and group types', () =>
    run(async (api) => {
      const f = await buildFixture(api);
      const galaxy = (await api.expect(200, 'GET', `/maps/${f.mapId}/views/galaxy`)).body.data;
      const names = galaxy.objects.map((object: any) => object.namePlain);
      expect(names).toEqual([
        'Gudrun',
        'Eye of Night',
        'The hidden star',
        'Secret System',
        'Rogue',
      ]);
      expect(names).not.toContain('Draft System');
      const gudrun = galaxy.objects[0];
      expect(gudrun).toMatchObject({
        position: [100, 0, 50],
        explorable: true,
        size: 120,
        appearance: { color: '#ffe6a8', labelPriority: 5 },
      });
      expect(gudrun).not.toHaveProperty('name');
      expect(galaxy.objects[1]).toMatchObject({
        baseType: 'nebula',
        size: null,
        appearance: { region: { radius: 800, shape: 'sphere' } },
      });
      expect(galaxy.objects[2]).toMatchObject({
        namePlain: 'The hidden star',
        nameRedacted: 'The ▇▇▇▇▇▇ star',
        nameSpoiler: false,
      });
      expect(galaxy.groups).toEqual([
        expect.objectContaining({
          namePlain: 'Helican',
          members: [
            { objectId: f.ids[0], isSpoiler: false },
            { objectId: f.ids[7], isSpoiler: true },
          ],
        }),
      ]);
      expect(galaxy.groupTypes).toEqual([
        expect.objectContaining({ name: 'Sector', defaultColor: '#c8a24a' }),
      ]);
      expect(galaxy.routes).toEqual([]);

      const withDrafts = (
        await api.expect(200, 'GET', `/maps/${f.mapId}/views/galaxy?includeDrafts=true`)
      ).body.data;
      expect(withDrafts.objects.map((object: any) => object.namePlain)).toContain('Draft System');
    }));

  it('galaxy: each system says what its glyph shows (D-28, D-29)', () =>
    run(async (api) => {
      const universeId = (
        await api.expect(201, 'POST', '/universes', { slug: 'g', name: rt.plain('G') })
      ).body.data.id as string;
      const mapId = (
        await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
          slug: 'm',
          name: rt.plain('M'),
        })
      ).body.data.id as string;
      const child = (name: string, baseType: string, extra: object = {}) => ({
        op: 'create',
        kind: 'celestial_object',
        mapId,
        data: { name: rt.plain(name), baseType, parentId: '$op:0', ...extra },
      });
      await api.expect(200, 'POST', '/batch', {
        description: 'A busy system',
        operations: [
          {
            op: 'create',
            kind: 'celestial_object',
            mapId,
            data: { name: rt.plain('Alpha'), baseType: 'system' },
          },
          child('A', 'star', { appearance: { color: '#ffeeaa', scale: { system: 1.2 } } }),
          child('B', 'star', { appearance: { color: '#ff8844', scale: { system: 0.6 } } }),
          child('C', 'star', { appearance: { color: '#ff4422', scale: { system: 0.3 } } }),
          child('D', 'star', { appearance: { color: '#ffffff', scale: { system: 0.1 } } }),
          child('I', 'planet'),
          child('II', 'planet'),
          child('III', 'planet', { isSpoiler: true }),
          child('IV', 'planet', { status: 'draft' }),
          child('Belt', 'asteroid_belt'),
          {
            op: 'create',
            kind: 'celestial_object',
            mapId,
            data: { name: rt.plain('Rogue'), baseType: 'planet' },
          },
        ],
      });
      const objects = async (query = '') =>
        (await api.expect(200, 'GET', `/maps/${mapId}/views/galaxy${query}`)).body.data.objects as {
          namePlain: string;
          planetCount: number;
          spoilerPlanetCount: number;
          stars: unknown[];
        }[];

      const [alpha, rogue] = await objects();
      // Readers: the draft planet doesn't count; the spoiler planet counts apart.
      expect(alpha).toMatchObject({ namePlain: 'Alpha', planetCount: 2, spoilerPlanetCount: 1 });
      // The three largest stars, largest first, sized against the largest.
      expect(alpha?.stars).toEqual([
        { color: '#ffeeaa', sizeShare: 1, isSpoiler: false },
        { color: '#ff8844', sizeShare: 0.5, isSpoiler: false },
        { color: '#ff4422', sizeShare: 0.25, isSpoiler: false },
      ]);
      expect(rogue).toMatchObject({
        namePlain: 'Rogue',
        planetCount: 0,
        spoilerPlanetCount: 0,
        stars: [],
      });
      // Editors see the draft too.
      expect((await objects('?includeDrafts=true'))[0]?.planetCount).toBe(3);
    }));

  it('system: subject, direct children with subtype and object appearance layered, and breadcrumbs', () =>
    run(async (api) => {
      const f = await buildFixture(api);
      const system = (await api.expect(200, 'GET', `/objects/${f.ids[0] ?? ''}/views/system`)).body
        .data;
      expect(system.subject).toMatchObject({ namePlain: 'Gudrun', parentId: null });
      expect(system.ancestors).toEqual([]);
      expect(system.map).toMatchObject({ id: f.mapId, namePlain: 'M41' });
      expect(system.children.map((child: any) => child.namePlain)).toEqual([
        'Gudrun Prime',
        'Gudrun I',
        'Gudrun II',
      ]);
      // Gudrun I: the subtype sets color and scale 3 in systems; the object overrides the scale to 0.5.
      expect(system.children[1]).toMatchObject({
        appearance: { color: '#aa8844', scale: { galaxy: 2, system: 0.5 } },
        size: 0.25 * 0.5,
      });
    }));

  it('orbit: the body, its moon, breadcrumbs and pins, with events at a place using its coordinates', () =>
    run(async (api) => {
      const f = await buildFixture(api);
      const orbit = (await api.expect(200, 'GET', `/objects/${f.ids[2] ?? ''}/views/orbit`)).body
        .data;
      expect(orbit.subject).toMatchObject({ namePlain: 'Gudrun I', size: 1 });
      expect(orbit.ancestors.map((ancestor: any) => ancestor.namePlain)).toEqual(['Gudrun']);
      expect(orbit.children.map((child: any) => child.namePlain)).toEqual(['Gudrun I-a']);
      const pins = Object.fromEntries(orbit.pins.map((pin: any) => [pin.namePlain, pin]));
      expect(Object.keys(pins).sort()).toEqual([
        'Hidden Vault',
        'Hive Primus',
        'Orbital duel',
        'Siege of Hive Primus',
      ]);
      expect(pins['Hive Primus']).toMatchObject({
        kind: 'place',
        mode: 'surface',
        latDeg: 10,
        lonDeg: 20,
      });
      expect(pins['Siege of Hive Primus']).toMatchObject({
        kind: 'event',
        mode: 'place',
        latDeg: 10,
        lonDeg: 20,
        placeId: f.ids[11],
        dateText: '240.M41',
      });
      expect(pins['Orbital duel']).toMatchObject({
        mode: 'object',
        latDeg: null,
        isSpoiler: true,
        nameRedacted: '▇▇▇▇▇▇▇▇▇▇▇▇',
      });
      expect(pins['Hidden Vault']).toMatchObject({ locationSpoiler: true });

      const moonOrbit = (await api.expect(200, 'GET', `/objects/${f.ids[4] ?? ''}/views/orbit`))
        .body.data;
      expect(moonOrbit.ancestors.map((ancestor: any) => ancestor.namePlain)).toEqual([
        'Gudrun',
        'Gudrun I',
      ]);
    }));

  it('galaxy and system views: event markers in space and at top-level objects (M6-T5)', () =>
    run(async (api) => {
      const f = await buildFixture(api);
      const event = (name: string) => ({
        op: 'create',
        kind: 'event',
        mapId: f.mapId,
        data: { name: rt.plain(name) },
      });
      const gudrun = f.ids[0] ?? '';
      await api.expect(200, 'POST', '/batch', {
        description: 'Markers',
        operations: [
          event('Deep-space battle'), // 0
          {
            op: 'setLocation',
            id: '$op:0',
            data: { mode: 'space', objectId: null, x: 1, y: 2, z: 3 },
          },
          event('Warp storm at Gudrun'), // 2
          { op: 'setLocation', id: '$op:2', data: { mode: 'object', objectId: gudrun } },
          event('Fleet in Gudrun'), // 4
          {
            op: 'setLocation',
            id: '$op:4',
            data: { mode: 'space', objectId: gudrun, x: 7, y: 0, z: 1 },
          },
          event('Secret rendezvous'), // 6
          {
            op: 'setLocation',
            id: '$op:6',
            data: { mode: 'space', objectId: null, x: 0, y: 0, z: 0, isSpoiler: true },
          },
          event('On a planet'), // 8
          { op: 'setLocation', id: '$op:8', data: { mode: 'object', objectId: f.ids[2] } },
        ],
      });
      const galaxy = (await api.expect(200, 'GET', `/maps/${f.mapId}/views/galaxy`)).body.data;
      const byName = Object.fromEntries(galaxy.markers.map((m: any) => [m.namePlain, m]));
      // A planet's event is its orbit view's pin; a system's frame, its system view's marker.
      expect(Object.keys(byName).sort()).toEqual([
        'Deep-space battle',
        'Secret rendezvous',
        'Warp storm at Gudrun',
      ]);
      expect(byName['Deep-space battle']).toMatchObject({
        kind: 'event',
        mode: 'space',
        objectId: null,
        position: [1, 2, 3],
        locationSpoiler: false,
      });
      expect(byName['Warp storm at Gudrun']).toMatchObject({
        mode: 'object',
        objectId: gudrun,
        position: null,
      });
      const system = (await api.expect(200, 'GET', `/objects/${gudrun}/views/system`)).body.data;
      expect(system.markers.map((m: any) => [m.namePlain, m.position])).toEqual([
        ['Fleet in Gudrun', [7, 0, 1]],
      ]);
      const hidden = (
        await api.expect(200, 'GET', `/maps/${f.mapId}/views/galaxy?spoilers=exclude`)
      ).body.data;
      expect(hidden.markers.map((m: any) => m.namePlain).sort()).toEqual([
        'Deep-space battle',
        'Warp storm at Gudrun',
      ]);
    }));

  it('event list: date order, location paths, and spoiler locations (M6-T7)', () =>
    run(async (api) => {
      const f = await buildFixture(api);
      const event = (name: string, extra: object = {}) => ({
        op: 'create',
        kind: 'event',
        mapId: f.mapId,
        data: { name: rt.plain(name), ...extra },
      });
      await api.expect(200, 'POST', '/batch', {
        description: 'More events',
        operations: [
          event('First contact', { dateSort: 100, dateText: '100.M41' }), // 0
          {
            op: 'setLocation',
            id: '$op:0',
            data: { mode: 'space', objectId: null, x: 0, y: 0, z: 0 },
          },
          event('Undated, unplaced'), // 2
          event('At the vault', { dateSort: 300 }), // 3
          { op: 'setLocation', id: '$op:3', data: { mode: 'place', placeId: f.ids[17] } },
        ],
      });
      const list = (await api.expect(200, 'GET', `/maps/${f.mapId}/event-list`)).body.data;
      expect(list.map.universeId).toBe(f.universeId);
      const names = list.events.map((e: any) => e.namePlain);
      // dateSort first, then dateText, then name; undated last.
      expect(names).toEqual([
        'First contact',
        'At the vault',
        'Siege of Hive Primus',
        'Orbital duel',
        'Undated, unplaced',
      ]);
      const byName = Object.fromEntries(list.events.map((e: any) => [e.namePlain, e]));
      const path = (name: string) => byName[name].location?.path.map((step: any) => step.namePlain);
      expect(byName['First contact'].location).toMatchObject({ mode: 'space', path: [] });
      expect(path('Siege of Hive Primus')).toEqual(['Gudrun', 'Gudrun I', 'Hive Primus']);
      expect(path('Orbital duel')).toEqual(['Gudrun', 'Gudrun I']);
      expect(byName['Undated, unplaced'].location).toBeNull();
      // An event at a spoiler place is a spoiler location too, and loses its path when excluded.
      expect(byName['At the vault'].location).toMatchObject({ isSpoiler: true });
      expect(path('At the vault')).toEqual(['Gudrun', 'Gudrun I', 'Hidden Vault']);
      const hidden = (await api.expect(200, 'GET', `/maps/${f.mapId}/event-list?spoilers=exclude`))
        .body.data;
      const vault = hidden.events.find((e: any) => e.id === byName['At the vault'].id);
      expect(vault.location).toEqual({ mode: 'place', isSpoiler: true, path: [] });
      expect(JSON.stringify(hidden)).not.toContain('Orbital duel');
    }));

  it('spoilers=exclude: redacted names, no spoiler memberships, no spoiler-located pins', () =>
    run(async (api) => {
      const f = await buildFixture(api);
      const galaxy = (
        await api.expect(200, 'GET', `/maps/${f.mapId}/views/galaxy?spoilers=exclude`)
      ).body.data;
      expect(galaxy.objects[2].namePlain).toBe('The ▇▇▇▇▇▇ star');
      expect(JSON.stringify(galaxy)).not.toContain('hidden');
      expect(galaxy.groups[0].members).toEqual([{ objectId: f.ids[0], isSpoiler: false }]);
      const orbit = (
        await api.expect(200, 'GET', `/objects/${f.ids[2] ?? ''}/views/orbit?spoilers=exclude`)
      ).body.data;
      expect(orbit.pins.map((pin: any) => pin.namePlain).sort()).toEqual([
        'Hive Primus',
        'Siege of Hive Primus',
        '▇▇▇▇▇▇▇▇▇▇▇▇',
      ]);
      expect(JSON.stringify(orbit)).not.toContain('Orbital duel');
    }));

  it('answers 400 when the object opens another view, or none, and 404 when it is hidden or missing', () =>
    run(async (api) => {
      const f = await buildFixture(api);
      const planetAsSystem = await api.expect(
        400,
        'GET',
        `/objects/${f.ids[2] ?? ''}/views/system`,
      );
      expect(planetAsSystem.body.detail).toBe(
        'Gudrun I is a planet, which opens the orbit view, not the system view.',
      );
      const systemAsOrbit = await api.expect(400, 'GET', `/objects/${f.ids[0] ?? ''}/views/orbit`);
      expect(systemAsOrbit.body.detail).toMatch(/opens the system view, not the orbit view/);
      const nebula = await api.expect(400, 'GET', `/objects/${f.ids[5] ?? ''}/views/system`);
      expect(nebula.body.detail).toMatch(/doesn't open a view/);
      await api.expect(404, 'GET', `/objects/${f.ids[19] ?? ''}/views/system`);
      await api.expect(200, 'GET', `/objects/${f.ids[19] ?? ''}/views/system?includeDrafts=true`);
      await api.expect(404, 'GET', '/maps/019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b/views/galaxy');
    }));
});
