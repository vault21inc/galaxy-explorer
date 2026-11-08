import { revertBatch } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { ENTITY_KINDS, entityKinds, rt, type EntityKind } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { filterQuery } from '../../src/routes/entity-schemas.ts';
import { apiOn, bodyFrom, newWorld, UUID, type Api } from './harness.ts';

/**
 * The generic contract suite (M1-T6): the same steps for every entity kind in the registry,
 * through the HTTP API. A new kind runs it with no new test code.
 */

const actor = { type: 'local' as const, label: 'contract test' };

/** Sets up a world and creates one entity of the kind from its registry example. */
async function created(api: Api, kind: EntityKind, overrides: Record<string, unknown> = {}) {
  const def = entityKinds[kind];
  const world = await newWorld(api);
  const scope = def.scope === 'map' ? `/maps/${world.mapId}` : `/universes/${world.universeId}`;
  const body = { ...(await bodyFrom(api, world, def.example)), ...overrides };
  const response = await api.expect(201, 'POST', `${scope}/${def.plural}`, body);
  return {
    world,
    scope,
    body,
    response,
    entity: response.body.data as Record<string, any>,
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

describe.each(ENTITY_KINDS)('contract: %s', (kind) => {
  it('1. creates, then reads back the same entity', () =>
    run(async (api) => {
      const { entity, body, plural } = await created(api, kind);
      expect(entity).toMatchObject({ ...body, kind, version: 1 });
      expect(entity.id).toMatch(UUID);
      const read = await api.expect(200, 'GET', `/${plural}/${entity.id as string}`);
      expect(read.body.data).toEqual(entity);
    }));

  it('2. lists with filters', () =>
    run(async (api) => {
      const { entity, scope, plural } = await created(api, kind);
      const ids = async (query: string) =>
        (
          (await api.expect(200, 'GET', `${scope}/${plural}?${query}`)).body.data as {
            id: string;
          }[]
        ).map((item) => item.id);
      expect(await ids('')).toEqual([entity.id]);
      expect(
        await ids(`q=${encodeURIComponent((entity.namePlain as string).slice(1, 5))}`),
      ).toEqual([entity.id]);
      expect(await ids('q=no-such-name')).toEqual([]);
      expect(await ids('status=published')).toEqual([entity.id]);
      expect(await ids('status=draft')).toEqual([]);
      // Every derived extension filter finds the entity by its own value.
      for (const field of Object.keys(filterQuery(kind).shape)) {
        if (field === 'status' || field === 'q') continue;
        const value = entity[field] as string | null;
        expect(
          await ids(`${field}=${value === null ? 'null' : encodeURIComponent(value)}`),
          field,
        ).toEqual([entity.id]);
      }
      const page = await api.expect(200, 'GET', `${scope}/${plural}?limit=1`);
      expect(page.body.nextCursor).toBeNull();
    }));

  it('3. updates with the right version, and refuses a stale one with 409 and the current record', () =>
    run(async (api) => {
      const { entity, plural } = await created(api, kind);
      const updated = await api.expect(200, 'PATCH', `/${plural}/${entity.id as string}`, {
        version: 1,
        name: rt.md('**Renamed**'),
      });
      expect(updated.body.data).toMatchObject({ version: 2, namePlain: 'Renamed' });
      const stale = await api.expect(409, 'PATCH', `/${plural}/${entity.id as string}`, {
        version: 1,
        name: rt.plain('Again'),
      });
      expect(stale.body).toMatchObject({
        status: 409,
        current: { id: entity.id, version: 2, namePlain: 'Renamed' },
      });
    }));

  it('4. round-trips spoiler flags', () =>
    run(async (api) => {
      const { entity, plural } = await created(api, kind, {
        isSpoiler: true,
        name: rt.plain('Secret name', { spoiler: true }),
        summary: rt.md('Known: ||hidden part||'),
      });
      const read = await api.expect(200, 'GET', `/${plural}/${entity.id as string}`);
      expect(read.body.data).toMatchObject({
        isSpoiler: true,
        name: { source: 'Secret name', spoiler: true },
        summary: { source: 'Known: ||hidden part||', spoiler: false },
      });
    }));

  it('5. blacks out flagged content with spoilers=exclude', () =>
    run(async (api) => {
      const { entity, plural } = await created(api, kind, {
        summary: rt.md('Known: ||hidden part||'),
      });
      const url = `/${plural}/${entity.id as string}`;
      const partial = await api.expect(200, 'GET', `${url}?spoilers=exclude`);
      expect(partial.body.data.summary.source).toBe('Known: ||▇▇▇▇▇▇▇▇▇▇▇▇||');
      await api.expect(200, 'PATCH', url, { version: 1, isSpoiler: true });
      const whole = await api.expect(200, 'GET', `${url}?spoilers=exclude`);
      expect(whole.body.data.name.source).toMatch(/^▇+$/);
      expect(JSON.stringify(whole.body.data)).not.toContain(entity.namePlain);
      const shown = await api.expect(200, 'GET', url);
      expect(shown.body.data.name).toEqual(entity.name);
    }));

  it('6. returns X-GE-Batch-Id on every write', () =>
    run(async (api) => {
      const { entity, response, scope, plural, body } = await created(api, kind);
      expect(response.batchId).toMatch(UUID);
      const url = `/${plural}/${entity.id as string}`;
      expect(
        (await api.expect(200, 'PATCH', url, { version: 1, isSpoiler: true })).batchId,
      ).toMatch(UUID);
      const upserted = await api.expect(201, 'PUT', `${scope}/${plural}/by-key/contract-key`, body);
      expect(upserted.batchId).toMatch(UUID);
      expect((await api.expect(204, 'DELETE', url, { version: 2 })).batchId).toMatch(UUID);
    }));

  it('6b. upserts by external key: creates once, then updates the same entity', () =>
    run(async (api) => {
      const { scope, plural, body } = await created(api, kind);
      const first = await api.expect(201, 'PUT', `${scope}/${plural}/by-key/gudrun`, body);
      const second = await api.expect(200, 'PUT', `${scope}/${plural}/by-key/gudrun`, {
        ...body,
        name: rt.plain('Changed'),
      });
      expect(second.body.data).toMatchObject({
        id: first.body.data.id,
        externalKey: 'gudrun',
        namePlain: 'Changed',
        version: 2,
      });
    }));

  it('7. reverting the batch restores the previous state', () =>
    run(async (api, db) => {
      const { entity, plural } = await created(api, kind);
      const url = `/${plural}/${entity.id as string}`;
      const edit = await api.expect(200, 'PATCH', url, {
        version: 1,
        name: rt.plain('Edited'),
        isSpoiler: true,
      });
      await revertBatch(db, edit.batchId ?? '', actor);
      const read = await api.expect(200, 'GET', url);
      expect(read.body.data).toMatchObject({ name: entity.name, isSpoiler: false });

      const removal = await api.expect(204, 'DELETE', url, { version: read.body.data.version });
      await revertBatch(db, removal.batchId ?? '', actor);
      expect((await api.expect(200, 'GET', url)).body.data).toMatchObject({
        id: entity.id,
        name: entity.name,
      });
    }));

  it('8. deletes, after which the entity is gone', () =>
    run(async (api) => {
      const { entity, plural } = await created(api, kind);
      const url = `/${plural}/${entity.id as string}`;
      await api.expect(409, 'DELETE', url, { version: 5 });
      await api.expect(204, 'DELETE', url, { version: 1 });
      const gone = await api.expect(404, 'GET', url);
      expect(gone.body).toMatchObject({ status: 404 });
    }));
});
