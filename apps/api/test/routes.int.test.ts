import { schema, withBatch } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { apiOn, type Api } from './contract/harness.ts';

/** The hand-written routes: universes and maps, aspects, group members and route waypoints. */

const run = (
  fn: (api: Api, db: Parameters<Parameters<typeof withTestDb>[0]>[0]) => Promise<void>,
) =>
  withTestDb(async (db, url) => {
    const api = await apiOn(url);
    try {
      await fn(api, db);
    } finally {
      await api.close();
    }
  });

describe('universes and maps', () => {
  it('create, read, update with versions, list and delete', () =>
    run(async (api) => {
      const universe = (
        await api.expect(201, 'POST', '/universes', {
          slug: 'warhammer',
          name: rt.plain('Warhammer 40,000'),
        })
      ).body.data;
      expect(universe).toMatchObject({
        slug: 'warhammer',
        namePlain: 'Warhammer 40,000',
        version: 1,
        settings: {},
      });
      await api.expect(409, 'POST', '/universes', { slug: 'warhammer', name: rt.plain('Again') });
      await api.expect(400, 'POST', '/universes', { slug: 'Not A Slug', name: rt.plain('x') });

      const map = (
        await api.expect(201, 'POST', `/universes/${universe.id as string}/maps`, {
          slug: 'm41',
          name: rt.plain('M41'),
        })
      ).body.data;
      expect(map).toMatchObject({
        universeId: universe.id,
        status: 'published',
        isSpoiler: false,
        galaxySettings: {},
      });
      const edited = await api.expect(200, 'PATCH', `/maps/${map.id as string}`, {
        version: 1,
        galaxySettings: { arms: 2 },
      });
      expect(edited.body.data).toMatchObject({ version: 2, galaxySettings: { arms: 2 } });
      await api.expect(409, 'PATCH', `/maps/${map.id as string}`, { version: 1, sortKey: 3 });
      expect(
        (await api.expect(200, 'GET', `/universes/${universe.id as string}/maps`)).body.data,
      ).toHaveLength(1);
      expect((await api.expect(200, 'GET', '/universes')).body.data).toHaveLength(1);

      await api.expect(204, 'DELETE', `/universes/${universe.id as string}`, { version: 1 });
      await api.expect(404, 'GET', `/maps/${map.id as string}`);
    }));

  it('hide a spoiler map and its name under spoilers=exclude', () =>
    run(async (api) => {
      const universe = (
        await api.expect(201, 'POST', '/universes', { slug: 'w', name: rt.plain('W') })
      ).body.data;
      const map = (
        await api.expect(201, 'POST', `/universes/${universe.id as string}/maps`, {
          slug: 'era',
          name: rt.plain('The Fall'),
          isSpoiler: true,
        })
      ).body.data;
      const hidden = (await api.expect(200, 'GET', `/maps/${map.id as string}?spoilers=exclude`))
        .body.data;
      expect(hidden.name.source).toMatch(/^▇+$/);
      expect(JSON.stringify(hidden)).not.toContain('The Fall');
    }));

  it('record the new universe on its creation batch', () =>
    run(async (api, db) => {
      const created = await api.expect(201, 'POST', '/universes', {
        slug: 'w',
        name: rt.plain('W'),
      });
      const [batch] = await db.select().from(schema.changeBatches);
      expect(batch).toMatchObject({
        id: created.batchId,
        universeId: created.body.data.id,
        description: 'Create universe',
      });
    }));

  it('take a batch description from X-GE-Batch-Description', () =>
    run(async (api, db) => {
      const response = await api.app.inject({
        method: 'POST',
        url: '/api/v1/universes',
        headers: { 'x-ge-batch-description': 'Import the 40k setting' },
        payload: { slug: 'w', name: rt.plain('W') },
      });
      expect(response.statusCode).toBe(201);
      const [batch] = await db.select().from(schema.changeBatches);
      expect(batch?.description).toBe('Import the 40k setting');
    }));

  it('decode a percent-encoded batch description (header values are Latin-1)', () =>
    run(async (api, db) => {
      const response = await api.app.inject({
        method: 'POST',
        url: '/api/v1/universes',
        headers: { 'x-ge-batch-description': encodeURIComponent('Rename “Terra” to 地球') },
        payload: { slug: 'w', name: rt.plain('W') },
      });
      expect(response.statusCode).toBe(201);
      const [batch] = await db.select().from(schema.changeBatches);
      expect(batch?.description).toBe('Rename “Terra” to 地球');
    }));
});

/** A universe, map, system, planet, event and character to hang aspects on. */
async function scene(api: Api, db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
  const universeId = (
    await api.expect(201, 'POST', '/universes', { slug: 'w', name: rt.plain('W') })
  ).body.data.id as string;
  const mapId = (
    await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
      slug: 'm',
      name: rt.plain('M'),
    })
  ).body.data.id as string;
  const create = async (path: string, body: object) =>
    (await api.expect(201, 'POST', path, body)).body.data.id as string;
  const systemId = await create(`/maps/${mapId}/objects`, {
    name: rt.plain('Gudrun'),
    baseType: 'system',
  });
  const planetId = await create(`/maps/${mapId}/objects`, {
    name: rt.plain('Gudrun I'),
    baseType: 'planet',
    parentId: systemId,
  });
  const eventId = await create(`/maps/${mapId}/events`, { name: rt.plain('Siege') });
  const characterId = await create(`/universes/${universeId}/characters`, {
    name: rt.plain('Eisenhorn'),
  });
  const fieldId = await create(`/universes/${universeId}/field-definitions`, {
    key: 'population',
    label: 'Population',
    valueType: 'number',
    appliesToKind: 'celestial_object',
  });
  const groupTypeId = await create(`/universes/${universeId}/group-types`, {
    name: 'Sector',
    layer: 'Admin',
    defaultColor: '#c8a24a',
  });
  const groupId = await create(`/maps/${mapId}/groups`, { name: rt.plain('Helican'), groupTypeId });
  // Uploads arrive in M3; insert an asset row directly.
  const { result: assetId } = await withBatch(
    db,
    { type: 'local', label: 'test' },
    'Asset',
    async (tx) => {
      const variant = { key: 'a', width: 1, height: 1 };
      const [row] = await tx
        .insert(schema.assets)
        .values({
          universeId,
          sha256: 'a',
          mimeType: 'image/webp',
          width: 1,
          height: 1,
          byteSize: 1,
          variants: { thumb: variant, display: variant },
        })
        .returning();
      return row?.id ?? '';
    },
  );
  return { universeId, mapId, systemId, planetId, eventId, characterId, fieldId, groupId, assetId };
}

describe('aspects', () => {
  it('are created, listed, updated and removed, and show up in include', () =>
    run(async (api, db) => {
      const s = await scene(api, db);
      const base = `/entities/${s.systemId}`;

      await api.expect(200, 'PUT', `${base}/facts/${s.fieldId}`, {
        value: { type: 'number', number: 5 },
      });
      await api.expect(422, 'PUT', `${base}/facts/${s.fieldId}`, {
        value: { type: 'text', text: rt.plain('five') },
      });
      await api.expect(201, 'POST', `${base}/images`, {
        assetId: s.assetId,
        role: 'cover',
        caption: rt.html('<em>Ruins</em><script>x</script>'),
      });
      await api.expect(409, 'POST', `${base}/images`, { assetId: s.assetId, role: 'cover' });
      const link = (
        await api.expect(201, 'POST', `${base}/links`, {
          url: 'https://example.com',
          label: 'Wiki',
        })
      ).body.data;
      await api.expect(400, 'POST', `${base}/links`, { url: 'javascript:alert(1)' });
      await api.expect(200, 'PATCH', `${base}/links/${link.id as string}`, {
        label: 'Lexicanum',
        isSpoiler: true,
      });
      await api.expect(201, 'POST', `/entities/${s.characterId}/relations`, {
        relationType: 'participant',
        toEntityId: s.eventId,
      });
      await api.expect(422, 'POST', `/entities/${s.eventId}/relations`, {
        relationType: 'participant',
        toEntityId: s.characterId,
      });
      await api.expect(200, 'PUT', `/entities/${s.eventId}/location`, {
        mode: 'surface',
        objectId: s.planetId,
        latDeg: 10,
        lonDeg: 20,
        isSpoiler: true,
      });
      await api.expect(422, 'PUT', `/entities/${s.eventId}/location`, {
        mode: 'surface',
        objectId: s.systemId,
        latDeg: 10,
        lonDeg: 20,
      });

      const read = (
        await api.expect(200, 'GET', `/objects/${s.systemId}?include=facts,images,links`)
      ).body.data;
      expect(read.facts).toEqual([
        expect.objectContaining({ value: { type: 'number', number: 5 } }),
      ]);
      expect(read.images).toEqual([
        expect.objectContaining({ role: 'cover', caption: rt.html('<em>Ruins</em>') }),
      ]);
      expect(read.links).toEqual([
        expect.objectContaining({ label: 'Lexicanum', isSpoiler: true }),
      ]);
      const event = (
        await api.expect(200, 'GET', `/events/${s.eventId}?include=relations,location`)
      ).body.data;
      expect(event.relations).toEqual([
        expect.objectContaining({ fromEntityId: s.characterId, relationType: 'participant' }),
      ]);
      expect(event.location).toMatchObject({ mode: 'surface', latDeg: 10 });

      // Under spoilers=exclude, flagged aspects become placeholders without their secrets.
      const hidden = (
        await api.expect(200, 'GET', `/objects/${s.systemId}?include=links&spoilers=exclude`)
      ).body.data;
      expect(hidden.links).toEqual([{ redacted: true, id: link.id, isSpoiler: true, sortKey: 0 }]);
      const hiddenEvent = (
        await api.expect(200, 'GET', `/events/${s.eventId}?include=location&spoilers=exclude`)
      ).body.data;
      expect(hiddenEvent.location).toEqual({ redacted: true, isSpoiler: true });

      expect((await api.expect(200, 'GET', `${base}/links`)).body.data).toHaveLength(1);
      await api.expect(204, 'DELETE', `${base}/links/${link.id as string}`);
      await api.expect(404, 'DELETE', `${base}/links/${link.id as string}`);
      await api.expect(204, 'DELETE', `${base}/facts/${s.fieldId}`);
      await api.expect(204, 'DELETE', `${base}/images/${s.assetId}/cover`);
      await api.expect(204, 'DELETE', `/entities/${s.eventId}/location`);
      expect(
        (await api.expect(200, 'GET', `/entities/${s.eventId}/location`)).body.data,
      ).toBeNull();
      await api.expect(404, 'GET', '/entities/019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b/links');
    }));

  it('name the entity at the other end of a relation, and keep its secrets', () =>
    run(async (api, db) => {
      const s = await scene(api, db);
      const relation = (
        await api.expect(201, 'POST', `/entities/${s.characterId}/relations`, {
          relationType: 'participant',
          toEntityId: s.eventId,
        })
      ).body.data;
      // The write response already carries the other end, seen from the writer's entity.
      expect(relation.other).toMatchObject({ id: s.eventId, kind: 'event', isSpoiler: false });

      const fromEvent = (await api.expect(200, 'GET', `/entities/${s.eventId}/relations`)).body
        .data;
      expect(fromEvent).toEqual([
        expect.objectContaining({
          other: {
            id: s.characterId,
            kind: 'character',
            namePlain: expect.any(String) as string,
            isSpoiler: false,
            nameSpoiler: false,
          },
        }),
      ]);

      // A spoiler at the other end: its name is blacked out under spoilers=exclude.
      const character = (await api.expect(200, 'GET', `/characters/${s.characterId}`)).body.data;
      await api.expect(200, 'PATCH', `/characters/${s.characterId}`, {
        isSpoiler: true,
        version: character.version,
      });
      const hidden = (
        await api.expect(200, 'GET', `/events/${s.eventId}?include=relations&spoilers=exclude`)
      ).body.data;
      expect(hidden.relations[0].other.namePlain).toMatch(/^▇+$/);

      // A draft at the other end isn't visible to readers, so neither is the relation.
      const event = (await api.expect(200, 'GET', `/events/${s.eventId}`)).body.data;
      await api.expect(200, 'PATCH', `/events/${s.eventId}`, {
        status: 'draft',
        version: event.version,
      });
      expect(
        (await api.expect(200, 'GET', `/entities/${s.characterId}/relations`)).body.data,
      ).toEqual([]);
    }));

  it('turn a rule violation into 422 problem+json naming the field', () =>
    run(async (api, db) => {
      const s = await scene(api, db);
      const response = await api.app.inject({
        method: 'POST',
        url: `/api/v1/maps/${s.mapId}/objects`,
        payload: { name: rt.plain('Moon'), baseType: 'moon', parentId: s.systemId },
      });
      expect(response.statusCode).toBe(422);
      expect(response.headers['content-type']).toMatch(/^application\/problem\+json/);
      expect(response.json()).toMatchObject({ status: 422, errors: [{ path: '/parentId' }] });
    }));
});

describe('group members', () => {
  it('are added, listed, replaced and removed, with the one-group-per-type rule', () =>
    run(async (api, db) => {
      const s = await scene(api, db);
      const members = `/groups/${s.groupId}/members`;
      expect(
        (await api.expect(200, 'POST', members, { members: [{ objectId: s.systemId }] })).body.data,
      ).toEqual([{ objectId: s.systemId, isSpoiler: false }]);
      await api.expect(422, 'POST', members, { members: [{ objectId: s.planetId }] });
      expect((await api.expect(200, 'PUT', members, { members: [] })).body.data).toEqual([]);
      await api.expect(200, 'PUT', members, {
        members: [{ objectId: s.systemId, isSpoiler: true }],
      });
      const group = (await api.expect(200, 'GET', `/groups/${s.groupId}?include=members`)).body
        .data;
      expect(group.members).toEqual([{ objectId: s.systemId, isSpoiler: true }]);
      await api.expect(204, 'DELETE', members, { objectIds: [s.systemId] });
      expect((await api.expect(200, 'GET', members)).body.data).toEqual([]);
      await api.expect(404, 'GET', `/groups/${s.systemId}/members`);
    }));
});

describe('route waypoints (M4-T7)', () => {
  it('are set in order, checked, read back, drawn in the galaxy view and follow deletions', () =>
    run(async (api, db) => {
      const s = await scene(api, db);
      const system = async (name: string, status = 'published') =>
        (
          await api.expect(201, 'POST', `/maps/${s.mapId}/objects`, {
            name: rt.plain(name),
            baseType: 'system',
            status,
          })
        ).body.data.id as string;
      const hydraphur = await system('Hydraphur');
      const kar = await system('Kar Duniash', 'draft');
      const routeId = (
        await api.expect(201, 'POST', `/maps/${s.mapId}/routes`, {
          name: rt.plain('Hydraphur Run'),
          style: { color: '#c8a24a', dashed: true },
        })
      ).body.data.id as string;
      const waypoints = `/routes/${routeId}/waypoints`;

      // A round trip may pass the same system again, in order.
      const order = [s.systemId, hydraphur, kar, s.systemId];
      expect((await api.expect(200, 'PUT', waypoints, { objectIds: order })).body.data).toEqual(
        order.map((objectId, seq) => ({ seq, objectId })),
      );
      // Not a planet, not twice in a row, and only on a route.
      const planet = await api.expect(422, 'PUT', waypoints, { objectIds: [s.planetId] });
      expect(planet.body).toMatchObject({ errors: [{ path: '/objectIds/0' }] });
      await api.expect(422, 'PUT', waypoints, { objectIds: [hydraphur, hydraphur] });
      await api.expect(404, 'PUT', `/routes/${s.groupId}/waypoints`, { objectIds: [] });
      const read = (await api.expect(200, 'GET', `/routes/${routeId}?include=waypoints`)).body.data;
      expect(read.waypoints.map((w: { objectId: string }) => w.objectId)).toEqual(order);

      // A reader doesn't see the draft system, so the line skips it.
      const galaxy = async (query = '') =>
        (await api.expect(200, 'GET', `/maps/${s.mapId}/views/galaxy${query}`)).body.data;
      expect((await galaxy()).routes).toEqual([
        expect.objectContaining({
          id: routeId,
          namePlain: 'Hydraphur Run',
          style: { color: '#c8a24a', dashed: true },
          waypoints: [s.systemId, hydraphur, s.systemId],
        }),
      ]);
      expect((await galaxy('?includeDrafts=true')).routes[0].waypoints).toEqual(order);

      // Deleting a system removes its waypoints; the route stays.
      await api.expect(204, 'DELETE', `/objects/${hydraphur}`, { version: 1 });
      expect((await api.expect(200, 'GET', waypoints)).body.data).toEqual([
        { seq: 0, objectId: s.systemId },
        { seq: 2, objectId: kar },
        { seq: 3, objectId: s.systemId },
      ]);
    }));

  it('a route and its waypoints can be created in one batch', () =>
    run(async (api, db) => {
      const s = await scene(api, db);
      const other = (
        await api.expect(201, 'POST', `/maps/${s.mapId}/objects`, {
          name: rt.plain('Hydraphur'),
          baseType: 'system',
        })
      ).body.data.id as string;
      const response = await api.expect(200, 'POST', '/batch', {
        description: 'Create route',
        operations: [
          { op: 'create', kind: 'route', mapId: s.mapId, data: { name: rt.plain('Run') } },
          { op: 'setWaypoints', id: '$op:0', data: [s.systemId, other] },
        ],
      });
      const routeId = response.body.data.results[0].id as string;
      expect(response.body.data.results[1]).toMatchObject({
        op: 'setWaypoints',
        id: routeId,
        data: [
          { seq: 0, objectId: s.systemId },
          { seq: 1, objectId: other },
        ],
      });
      // One undo step takes both back.
      await api.expect(201, 'POST', `/history/${response.batchId!}/revert`);
      await api.expect(404, 'GET', `/routes/${routeId}`);
    }));
});
