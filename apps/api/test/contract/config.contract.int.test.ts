import { revertBatch } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { CONFIG_RESOURCES, configResources, type ConfigResource } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { apiOn, bodyFrom, newWorld, UUID, type Api } from './harness.ts';

/**
 * The contract suite for every config resource (universe settings). Settings have no version
 * and no spoiler flags, so those steps don't apply; the rest are the same as for entities.
 */

const actor = { type: 'local' as const, label: 'contract test' };

async function created(api: Api, resource: ConfigResource) {
  const def = configResources[resource];
  const world = await newWorld(api);
  const body = await bodyFrom(api, world, def.example);
  const response = await api.expect(
    201,
    'POST',
    `/universes/${world.universeId}/${def.plural}`,
    body,
  );
  return {
    world,
    body,
    response,
    item: response.body.data as Record<string, any>,
    plural: def.plural,
  };
}

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

/** A field of the example to change in the update step: the first plain-text one. */
function textField(resource: ConfigResource): string {
  const [field] = Object.entries(configResources[resource].example).find(
    ([key, value]) =>
      typeof value === 'string' && !/Id$|color|Color|key|baseType|valueType|appliesTo/.test(key),
  ) ?? ['name'];
  return field;
}

describe.each(CONFIG_RESOURCES)('contract: %s', (resource) => {
  it('1. creates, then reads back the same record', () =>
    run(async (api) => {
      const { item, body, plural, world } = await created(api, resource);
      expect(item).toMatchObject({ ...body, universeId: world.universeId });
      expect(item.id).toMatch(UUID);
      expect((await api.expect(200, 'GET', `/${plural}/${item.id as string}`)).body.data).toEqual(
        item,
      );
    }));

  it('2. lists within the universe', () =>
    run(async (api) => {
      const { item, plural, world } = await created(api, resource);
      const list = await api.expect(200, 'GET', `/universes/${world.universeId}/${plural}`);
      expect((list.body.data as { id: string }[]).map((row) => row.id)).toContain(item.id);
    }));

  it('3. updates (the last write wins: there is no version)', () =>
    run(async (api) => {
      const { item, plural } = await created(api, resource);
      const field = textField(resource);
      const updated = await api.expect(200, 'PATCH', `/${plural}/${item.id as string}`, {
        [field]: 'Renamed',
      });
      expect(updated.body.data[field]).toBe('Renamed');
      await api.expect(400, 'PATCH', `/${plural}/${item.id as string}`, { version: 1 });
    }));

  it('6. returns X-GE-Batch-Id on every write', () =>
    run(async (api) => {
      const { item, response, plural } = await created(api, resource);
      expect(response.batchId).toMatch(UUID);
      const field = textField(resource);
      expect(
        (await api.expect(200, 'PATCH', `/${plural}/${item.id as string}`, { [field]: 'X' }))
          .batchId,
      ).toMatch(UUID);
      expect((await api.expect(204, 'DELETE', `/${plural}/${item.id as string}`)).batchId).toMatch(
        UUID,
      );
    }));

  it("6c. lists every write in the universe's history", () =>
    run(async (api) => {
      const { item, response, plural, world } = await created(api, resource);
      const removal = await api.expect(204, 'DELETE', `/${plural}/${item.id as string}`);
      const history = await api.expect(200, 'GET', `/universes/${world.universeId}/history`);
      const ids = history.body.data.map((batch: { id: string }) => batch.id);
      expect(ids).toEqual(expect.arrayContaining([response.batchId, removal.batchId]));
    }));

  it('7. reverting the batch restores the previous state', () =>
    run(async (api, db) => {
      const { item, plural } = await created(api, resource);
      const field = textField(resource);
      const edit = await api.expect(200, 'PATCH', `/${plural}/${item.id as string}`, {
        [field]: 'Edited',
      });
      await revertBatch(db, edit.batchId ?? '', actor);
      expect((await api.expect(200, 'GET', `/${plural}/${item.id as string}`)).body.data).toEqual(
        item,
      );
    }));

  it('8. deletes, after which the record is gone', () =>
    run(async (api) => {
      const { item, plural } = await created(api, resource);
      await api.expect(204, 'DELETE', `/${plural}/${item.id as string}`);
      await api.expect(404, 'GET', `/${plural}/${item.id as string}`);
    }));

  it('9. a record created without a sort key goes last (M4-T1)', () =>
    run(async (api) => {
      const { item, body, plural, world } = await created(api, resource);
      expect(item.sortKey).toBe(0);
      await api.expect(200, 'PATCH', `/${plural}/${item.id as string}`, { sortKey: 4.5 });
      // Another record like the first, with its unique fields changed.
      const second = Object.fromEntries(
        Object.entries(body).map(([key, value]) => [
          key,
          ['name', 'label', 'key'].includes(key) ? `${String(value)}_2` : value,
        ]),
      );
      const next = await api.expect(
        201,
        'POST',
        `/universes/${world.universeId}/${plural}`,
        second,
      );
      expect(next.body.data.sortKey).toBe(5.5);
    }));
});
