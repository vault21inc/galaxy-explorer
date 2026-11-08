import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { apiOn, UUID, type Api } from './contract/harness.ts';

/** The history endpoints (M1-T8). */

const run = (fn: (api: Api) => Promise<void>) =>
  withTestDb(async (_db, url) => {
    const api = await apiOn(url);
    try {
      await fn(api);
    } finally {
      await api.close();
    }
  });

async function setup(api: Api) {
  const universe = await api.expect(201, 'POST', '/universes', { slug: 'w', name: rt.plain('W') });
  const universeId = universe.body.data.id as string;
  const mapId = (
    await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
      slug: 'm',
      name: rt.plain('M'),
    })
  ).body.data.id as string;
  const system = await api.expect(201, 'POST', `/maps/${mapId}/objects`, {
    name: rt.plain('Gudrun'),
    baseType: 'system',
    x: 120,
  });
  return {
    universeId,
    mapId,
    universeBatch: universe.batchId ?? '',
    system: system.body.data,
    createBatch: system.batchId ?? '',
  };
}

describe('GET /universes/{id}/history', () => {
  it('lists batches newest first, with filters and cursor pages', () =>
    run(async (api) => {
      const s = await setup(api);
      const edit = await api.expect(200, 'PATCH', `/objects/${s.system.id as string}`, {
        version: 1,
        x: 140,
      });
      const list = await api.expect(200, 'GET', `/universes/${s.universeId}/history`);
      const descriptions = list.body.data.map((batch: any) => batch.description);
      expect(descriptions).toEqual([
        'Edit object',
        'Create object',
        'Create map',
        'Create universe',
      ]);
      expect(list.body.data[0]).toMatchObject({
        id: edit.batchId,
        actorType: 'local',
        actorLabel: 'local',
        revertedBy: [],
        revertsBatchId: null,
      });

      const page1 = await api.expect(200, 'GET', `/universes/${s.universeId}/history?limit=2`);
      const page2 = await api.expect(
        200,
        'GET',
        `/universes/${s.universeId}/history?limit=2&cursor=${page1.body.nextCursor as string}`,
      );
      expect(
        [...page1.body.data, ...page2.body.data].map((batch: any) => batch.description),
      ).toEqual(descriptions);
      expect(page2.body.nextCursor).toBeNull();

      expect(
        (await api.expect(200, 'GET', `/universes/${s.universeId}/history?actorLabel=someone-else`))
          .body.data,
      ).toEqual([]);
      expect(
        (await api.expect(200, 'GET', `/universes/${s.universeId}/history?actorType=local`)).body
          .data,
      ).toHaveLength(4);
      const future = new Date(Date.now() + 60_000).toISOString();
      expect(
        (await api.expect(200, 'GET', `/universes/${s.universeId}/history?from=${future}`)).body
          .data,
      ).toEqual([]);
      expect(
        (await api.expect(200, 'GET', `/universes/${s.universeId}/history?to=${future}`)).body.data,
      ).toHaveLength(4);
    }));
});

describe('GET /history/{batchId}', () => {
  it('summarizes a batch per entity', () =>
    run(async (api) => {
      const s = await setup(api);
      const edit = await api.expect(200, 'PATCH', `/objects/${s.system.id as string}`, {
        version: 1,
        x: 140,
        name: rt.plain('Gudrun Prime'),
      });
      const detail = (await api.expect(200, 'GET', `/history/${edit.batchId!}`)).body.data;
      expect(detail).toMatchObject({
        batch: { id: edit.batchId, description: 'Edit object' },
        rowCount: 2,
        other: [],
      });
      expect(detail.entities).toEqual([
        expect.objectContaining({
          entityId: s.system.id,
          kind: 'celestial_object',
          change: 'updated',
          summary: 'Gudrun Prime: name changed, x 120→140',
        }),
      ]);
      const created = (await api.expect(200, 'GET', `/history/${s.createBatch}`)).body.data;
      expect(created.entities[0].summary).toBe('Gudrun Prime: created');
      const universe = (await api.expect(200, 'GET', `/history/${s.universeBatch}`)).body.data;
      expect(universe.other[0].summary).toBe('Universe "W": created');
      await api.expect(404, 'GET', '/history/019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b');
    }));
});

describe('POST /history/{batchId}/revert', () => {
  it('reverts a change, and reverting the revert redoes it', () =>
    run(async (api) => {
      const s = await setup(api);
      const url = `/objects/${s.system.id as string}`;
      const edit = await api.expect(200, 'PATCH', url, { version: 1, x: 140 });

      const undo = await api.expect(201, 'POST', `/history/${edit.batchId!}/revert`);
      expect(undo.body.data).toMatchObject({ revertsBatchId: edit.batchId, rowsChanged: 2 });
      expect(undo.body.data.batchId).toMatch(UUID);
      expect(undo.batchId).toBe(undo.body.data.batchId);
      expect((await api.expect(200, 'GET', url)).body.data.x).toBe(120);

      await api.expect(201, 'POST', `/history/${undo.body.data.batchId as string}/revert`);
      expect((await api.expect(200, 'GET', url)).body.data.x).toBe(140);

      const original = (await api.expect(200, 'GET', `/history/${edit.batchId!}`)).body.data.batch;
      expect(original.revertedBy).toEqual([undo.body.data.batchId]);
      const history = (await api.expect(200, 'GET', `/universes/${s.universeId}/history?limit=2`))
        .body.data;
      expect(history.map((batch: any) => batch.description)).toEqual([
        'Revert: Revert: Edit object',
        'Revert: Edit object',
      ]);
    }));

  it('restores a deleted object with its children', () =>
    run(async (api) => {
      const s = await setup(api);
      await api.expect(201, 'POST', `/maps/${s.mapId}/objects`, {
        name: rt.plain('Gudrun I'),
        baseType: 'planet',
        parentId: s.system.id,
      });
      const removal = await api.expect(204, 'DELETE', `/objects/${s.system.id as string}`, {
        version: 1,
      });
      expect((await api.expect(200, 'GET', `/maps/${s.mapId}/objects`)).body.data).toEqual([]);
      await api.expect(201, 'POST', `/history/${removal.batchId!}/revert`);
      expect((await api.expect(200, 'GET', `/maps/${s.mapId}/objects`)).body.data).toHaveLength(2);
    }));

  it('refuses with 409 listing every conflicting entity, and changes nothing', () =>
    run(async (api) => {
      const s = await setup(api);
      const planet = (
        await api.expect(201, 'POST', `/maps/${s.mapId}/objects`, {
          name: rt.plain('Gudrun I'),
          baseType: 'planet',
          parentId: s.system.id,
        })
      ).body.data;
      const both = await api.expect(200, 'POST', '/batch', {
        description: 'Move both',
        operations: [
          { op: 'update', kind: 'celestial_object', id: s.system.id, version: 1, data: { x: 1 } },
          { op: 'update', kind: 'celestial_object', id: planet.id, version: 1, data: { x: 2 } },
        ],
      });
      await api.expect(200, 'PATCH', `/objects/${s.system.id as string}`, { version: 2, x: 10 });
      await api.expect(200, 'PATCH', `/objects/${planet.id as string}`, {
        version: 2,
        name: rt.plain('Renamed'),
      });

      const refused = await api.expect(409, 'POST', `/history/${both.batchId!}/revert`);
      expect(refused.body.detail).toMatch(/Gudrun.*Renamed|Renamed.*Gudrun/);
      expect(refused.body.conflicts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            table: 'celestial_objects',
            entityId: s.system.id,
            name: 'Gudrun',
          }),
          expect.objectContaining({ table: 'entities', entityId: planet.id, name: 'Renamed' }),
        ]),
      );
      expect((await api.expect(200, 'GET', `/objects/${s.system.id as string}`)).body.data.x).toBe(
        10,
      );
      expect(
        (await api.expect(200, 'GET', `/universes/${s.universeId}/history?limit=1`)).body.data[0]
          .description,
      ).toBe('Edit object');
    }));

  it('answers 404 for an unknown batch', () =>
    run(async (api) => {
      await api.expect(404, 'POST', '/history/019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b/revert');
    }));
});
