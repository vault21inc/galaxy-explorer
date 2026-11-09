import { revertBatch, schema } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { apiOn, type Api } from './contract/harness.ts';

/** POST /api/v1/batch (M1-T7). */

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

async function world(api: Api) {
  const universeId = (
    await api.expect(201, 'POST', '/universes', { slug: 'w', name: rt.plain('W') })
  ).body.data.id as string;
  const mapId = (
    await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
      slug: 'm',
      name: rt.plain('M'),
    })
  ).body.data.id as string;
  const groupTypeId = (
    await api.expect(201, 'POST', `/universes/${universeId}/group-types`, {
      name: 'Sub-sector',
      layer: 'Admin',
      defaultColor: '#c8a24a',
    })
  ).body.data.id as string;
  return { universeId, mapId, groupTypeId };
}

/** Counts the rows the audit trigger logged, and the batches: what "nothing was written" means. */
async function written(db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
  return {
    batches: (await db.select().from(schema.changeBatches)).length,
    entities: (await db.select().from(schema.entities)).length,
  };
}

const create = (kind: string, mapId: string, data: object) => ({ op: 'create', kind, mapId, data });

describe('POST /batch', () => {
  it('creates a system, its star, three planets and a group with members, resolving $op references', () =>
    run(async (api, db) => {
      const w = await world(api);
      const response = await api.expect(200, 'POST', '/batch', {
        description: 'Build the Gudrun system',
        operations: [
          create('celestial_object', w.mapId, {
            name: rt.plain('Gudrun'),
            baseType: 'system',
            explorable: true,
          }),
          create('celestial_object', w.mapId, {
            name: rt.plain('Gudrun Prime'),
            baseType: 'star',
            parentId: '$op:0',
          }),
          create('celestial_object', w.mapId, {
            name: rt.plain('Gudrun I'),
            baseType: 'planet',
            parentId: '$op:0',
            x: 1,
          }),
          create('celestial_object', w.mapId, {
            name: rt.plain('Gudrun II'),
            baseType: 'planet',
            parentId: '$op:0',
            x: 2,
          }),
          create('celestial_object', w.mapId, {
            name: rt.plain('Gudrun III'),
            baseType: 'planet',
            parentId: '$op:0',
            x: 3,
          }),
          create('group', w.mapId, { name: rt.plain('Helican'), groupTypeId: w.groupTypeId }),
          { op: 'addMembers', id: '$op:5', data: [{ objectId: '$op:0' }] },
        ],
      });
      const { data } = response.body;
      expect(data).toMatchObject({ dryRun: false, batchId: response.batchId });
      const systemId = data.results[0].id as string;
      expect(data.results.slice(1, 5).map((result: any) => result.data.parentId)).toEqual([
        systemId,
        systemId,
        systemId,
        systemId,
      ]);
      expect(data.results[6].data).toEqual([expect.objectContaining({ objectId: systemId })]);

      const children = await api.expect(
        200,
        'GET',
        `/maps/${w.mapId}/objects?parentId=${systemId}`,
      );
      expect(children.body.data.map((item: any) => item.namePlain).sort()).toEqual([
        'Gudrun I',
        'Gudrun II',
        'Gudrun III',
        'Gudrun Prime',
      ]);

      // One batch, listed in the universe's history, and one undo step.
      const batches = await db.select().from(schema.changeBatches);
      const batch = batches.find((row) => row.id === response.batchId);
      expect(batch).toMatchObject({
        description: 'Build the Gudrun system',
        universeId: w.universeId,
      });
      await revertBatch(db, response.batchId ?? '', { type: 'local', label: 'test' });
      expect((await api.expect(200, 'GET', `/maps/${w.mapId}/objects`)).body.data).toEqual([]);
    }));

  it('writes nothing when operation 37 of 50 fails, and names it', () =>
    run(async (api, db) => {
      const w = await world(api);
      const before = await written(db);
      const operations = Array.from({ length: 50 }, (_, index) =>
        create('celestial_object', w.mapId, {
          name: rt.plain(`System ${String(index)}`),
          baseType: index === 37 ? 'moon' : 'system',
        }),
      );
      const failed = await api.expect(422, 'POST', '/batch', {
        description: 'Fifty systems',
        operations,
      });
      expect(failed.body).toMatchObject({
        status: 422,
        operationIndex: 37,
        detail: expect.stringMatching(
          /^Operation 37 \(create\): A moon can't be at the top level/,
        ) as string,
        errors: [{ path: '/operations/37/data/parentId' }],
      });
      expect(await written(db)).toEqual(before);
    }));

  it('reports validation errors inside data with the operation index', () =>
    run(async (api, db) => {
      const w = await world(api);
      const before = await written(db);
      const failed = await api.expect(400, 'POST', '/batch', {
        description: 'Bad data',
        operations: [
          create('place', w.mapId, { name: rt.plain('Fine') }),
          create('place', w.mapId, { nmae: 'typo' }),
        ],
      });
      expect(failed.body).toMatchObject({
        operationIndex: 1,
        errors: expect.arrayContaining([
          expect.objectContaining({
            path: expect.stringMatching(/^\/operations\/1\/data/) as string,
          }),
        ]) as unknown,
      });
      expect(await written(db)).toEqual(before);
    }));

  it('runs a dry run, returns the results and impact, and leaves the database unchanged', () =>
    run(async (api, db) => {
      const w = await world(api);
      const system = (
        await api.expect(201, 'POST', `/maps/${w.mapId}/objects`, {
          name: rt.plain('Gudrun'),
          baseType: 'system',
        })
      ).body.data;
      await api.expect(201, 'POST', `/maps/${w.mapId}/objects`, {
        name: rt.plain('Gudrun I'),
        baseType: 'planet',
        parentId: system.id,
      });
      const before = await written(db);

      const preview = await api.expect(200, 'POST', '/batch', {
        description: 'Delete Gudrun',
        dryRun: true,
        operations: [{ op: 'delete', kind: 'celestial_object', id: system.id, version: 1 }],
      });
      expect(preview.batchId).toBeUndefined();
      expect(preview.body.data).toMatchObject({
        dryRun: true,
        batchId: null,
        results: [{ index: 0, op: 'delete', id: system.id }],
        impact: {
          entities: { insert: 0, update: 0, delete: 2 },
          celestial_objects: { insert: 0, update: 0, delete: 2 },
        },
      });
      expect(await written(db)).toEqual(before);
      expect((await api.expect(200, 'GET', `/maps/${w.mapId}/objects`)).body.data).toHaveLength(2);
    }));

  it("lists a batch of deletes in the deleted entities' universe history", () =>
    run(async (api) => {
      const w = await world(api);
      const system = (
        await api.expect(201, 'POST', `/maps/${w.mapId}/objects`, {
          name: rt.plain('Gudrun'),
          baseType: 'system',
        })
      ).body.data;
      await api.expect(200, 'POST', '/batch', {
        description: 'Delete “Gudrun”',
        operations: [{ op: 'delete', kind: 'celestial_object', id: system.id, version: 1 }],
      });
      const history = await api.expect(200, 'GET', `/universes/${w.universeId}/history`);
      expect(history.body.data[0]).toMatchObject({ description: 'Delete “Gudrun”' });
    }));

  it('runs update, delete, upsert and the aspect operations', () =>
    run(async (api) => {
      const w = await world(api);
      const field = (
        await api.expect(201, 'POST', `/universes/${w.universeId}/field-definitions`, {
          key: 'population',
          label: 'Population',
          valueType: 'number',
          appliesToKind: 'celestial_object',
        })
      ).body.data;
      const doomed = (
        await api.expect(201, 'POST', `/maps/${w.mapId}/places`, { name: rt.plain('Doomed') })
      ).body.data;
      const response = await api.expect(200, 'POST', '/batch', {
        description: 'Everything',
        operations: [
          {
            op: 'upsert',
            kind: 'celestial_object',
            externalKey: 'gudrun',
            mapId: w.mapId,
            data: { name: rt.plain('Gudrun'), baseType: 'system' },
          },
          { op: 'update', kind: 'celestial_object', id: '$op:0', version: 1, data: { x: 42 } },
          {
            op: 'setFacts',
            id: '$op:0',
            data: [{ fieldDefinitionId: field.id, value: { type: 'number', number: 5 } }],
          },
          { op: 'addLink', id: '$op:0', data: { url: 'https://example.com' } },
          create('event', w.mapId, { name: rt.plain('Siege') }),
          { op: 'setLocation', id: '$op:4', data: { mode: 'object', objectId: '$op:0' } },
          {
            op: 'create',
            kind: 'character',
            universeId: w.universeId,
            data: { name: rt.plain('Eisenhorn') },
          },
          {
            op: 'addRelation',
            id: '$op:6',
            data: { relationType: 'participant', toEntityId: '$op:4' },
          },
          create('group', w.mapId, { name: rt.plain('Helican'), groupTypeId: w.groupTypeId }),
          { op: 'addMembers', id: '$op:8', data: [{ objectId: '$op:0' }] },
          { op: 'removeMembers', id: '$op:8', data: ['$op:0'] },
          { op: 'delete', kind: 'place', id: doomed.id, version: 1 },
        ],
      });
      const results = response.body.data.results;
      expect(results.map((result: any) => result.op)).toEqual([
        'upsert',
        'update',
        'setFacts',
        'addLink',
        'create',
        'setLocation',
        'create',
        'addRelation',
        'create',
        'addMembers',
        'removeMembers',
        'delete',
      ]);
      expect(results[1].data).toMatchObject({ x: 42, version: 2, externalKey: 'gudrun' });
      const system = (
        await api.expect(200, 'GET', `/objects/${results[0].id as string}?include=facts,links`)
      ).body.data;
      expect(system.facts).toHaveLength(1);
      expect(system.links).toHaveLength(1);
      const event = (
        await api.expect(
          200,
          'GET',
          `/events/${results[4].id as string}?include=location,relations`,
        )
      ).body.data;
      expect(event.location).toMatchObject({ mode: 'object', objectId: results[0].id });
      expect(event.relations).toHaveLength(1);
      await api.expect(404, 'GET', `/places/${doomed.id as string}`);
    }));

  it('rejects a reference to a later operation or to the operation itself', () =>
    run(async (api) => {
      const w = await world(api);
      const forward = await api.expect(422, 'POST', '/batch', {
        description: 'Forward reference',
        operations: [
          create('celestial_object', w.mapId, {
            name: rt.plain('Planet'),
            baseType: 'planet',
            parentId: '$op:1',
          }),
          create('celestial_object', w.mapId, { name: rt.plain('System'), baseType: 'system' }),
        ],
      });
      expect(forward.body).toMatchObject({
        operationIndex: 0,
        detail: expect.stringContaining('$op:1') as string,
      });
      const outOfRange = await api.expect(422, 'POST', '/batch', {
        description: 'Out of range',
        operations: [
          create('celestial_object', w.mapId, { name: rt.plain('A'), baseType: 'system' }),
          create('celestial_object', w.mapId, {
            name: rt.plain('B'),
            baseType: 'planet',
            parentId: '$op:1',
          }),
        ],
      });
      expect(outOfRange.body).toMatchObject({ operationIndex: 1 });
    }));

  it('validates the request itself: operation shapes, a scope for creates, and the size limit', () =>
    run(async (api) => {
      const w = await world(api);
      await api.expect(400, 'POST', '/batch', { description: 'x', operations: [] });
      await api.expect(400, 'POST', '/batch', {
        description: 'x',
        operations: [{ op: 'explode', kind: 'place' }],
      });
      await api.expect(400, 'POST', '/batch', {
        description: 'x',
        operations: [{ op: 'create', kind: 'route', mapId: w.mapId, data: {} }],
      });
      const noScope = await api.expect(422, 'POST', '/batch', {
        description: 'x',
        operations: [{ op: 'create', kind: 'place', data: { name: rt.plain('P') } }],
      });
      expect(noScope.body).toMatchObject({
        operationIndex: 0,
        errors: [{ path: '/operations/0/mapId' }],
      });
      const tooMany = Array.from({ length: 1_001 }, () =>
        create('place', w.mapId, { name: rt.plain('P') }),
      );
      await api.expect(400, 'POST', '/batch', { description: 'x', operations: tooMany });
    }));
});
