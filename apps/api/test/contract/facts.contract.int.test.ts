import { revertBatch } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { ENTITY_KINDS, entityKinds, rt, type EntityKind, type EntityKindDef } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { apiOn, created, UUID, type Api } from './harness.ts';

/**
 * The facts aspect's contract (M7-T1, data-model §3.4–3.5): the same steps for every kind the
 * registry gives facts, through the HTTP API, with no per-kind code. A field definition is made
 * for the kind, then a fact is set, read, checked, hidden, removed and restored.
 */

const actor = { type: 'local' as const, label: 'contract test' };
/** The kinds with facts (today every kind; the API refuses facts on a kind without them). */
const WITH_FACTS = ENTITY_KINDS.filter((kind) => {
  const def: EntityKindDef = entityKinds[kind];
  return def.aspects.facts;
});

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

/** A number field for the kind, in the entity's universe. */
async function definition(api: Api, universeId: string, kind: EntityKind, key = 'population') {
  const response = await api.expect(201, 'POST', `/universes/${universeId}/field-definitions`, {
    key,
    label: 'Population',
    valueType: 'number',
    unit: 'billion',
    appliesToKind: kind,
  });
  return response.body.data.id as string;
}

/** Another kind than this one, for a definition that doesn't apply. */
const otherKind = (kind: EntityKind): EntityKind =>
  ENTITY_KINDS.find((other) => other !== kind) ?? kind;

describe.each(WITH_FACTS)('contract: %s facts', (kind) => {
  it('sets, lists, reads with the entity, and removes a fact, each a batch', () =>
    run(async (api) => {
      const { entity, world, plural } = await created(api, kind);
      const id = entity.id as string;
      const field = await definition(api, world.universeId, kind);
      const set = await api.expect(200, 'PUT', `/entities/${id}/facts/${field}`, {
        value: { type: 'number', number: 12.5 },
      });
      expect(set.batchId).toMatch(UUID);
      expect(set.body.data).toMatchObject({
        entityId: id,
        fieldDefinitionId: field,
        value: { type: 'number', number: 12.5 },
        isSpoiler: false,
      });
      // Setting again replaces the value: one fact per field.
      await api.expect(200, 'PUT', `/entities/${id}/facts/${field}`, {
        value: { type: 'number', number: 13 },
      });
      const listed = (await api.expect(200, 'GET', `/entities/${id}/facts`)).body.data;
      expect(listed).toEqual([expect.objectContaining({ value: { type: 'number', number: 13 } })]);
      const read = await api.expect(200, 'GET', `/${plural}/${id}?include=facts`);
      expect(read.body.data.facts).toEqual(listed);

      const removed = await api.expect(204, 'DELETE', `/entities/${id}/facts/${field}`);
      expect(removed.batchId).toMatch(UUID);
      expect((await api.expect(200, 'GET', `/entities/${id}/facts`)).body.data).toEqual([]);
      await api.expect(404, 'DELETE', `/entities/${id}/facts/${field}`);
    }));

  it('refuses a value of the wrong type, or a field for another kind, with 422', () =>
    run(async (api) => {
      const { entity, world } = await created(api, kind);
      const id = entity.id as string;
      const field = await definition(api, world.universeId, kind);
      const wrongType = await api.expect(422, 'PUT', `/entities/${id}/facts/${field}`, {
        value: { type: 'text', text: rt.plain('many') },
      });
      expect(wrongType.body).toMatchObject({ status: 422 });
      const elsewhere = await definition(api, world.universeId, otherKind(kind), 'elsewhere');
      const wrongKind = await api.expect(422, 'PUT', `/entities/${id}/facts/${elsewhere}`, {
        value: { type: 'number', number: 1 },
      });
      expect(wrongKind.body.errors).toEqual([
        expect.objectContaining({ path: '/fieldDefinitionId' }),
      ]);
    }));

  it('blacks out a spoiler fact with spoilers=exclude', () =>
    run(async (api) => {
      const { entity, world, plural } = await created(api, kind);
      const id = entity.id as string;
      const field = await definition(api, world.universeId, kind);
      await api.expect(200, 'PUT', `/entities/${id}/facts/${field}`, {
        value: { type: 'number', number: 42 },
        isSpoiler: true,
      });
      const hidden = await api.expect(
        200,
        'GET',
        `/${plural}/${id}?include=facts&spoilers=exclude`,
      );
      // Only that there is a fact, and which field: no value.
      expect(hidden.body.data.facts).toEqual([
        { redacted: true, isSpoiler: true, sortKey: null, fieldDefinitionId: field },
      ]);
      const shown = await api.expect(200, 'GET', `/${plural}/${id}?include=facts`);
      expect(shown.body.data.facts[0]).toMatchObject({
        isSpoiler: true,
        value: { type: 'number', number: 42 },
      });
    }));

  it('reverting the batch restores the fact as it was', () =>
    run(async (api, db) => {
      const { entity, world } = await created(api, kind);
      const id = entity.id as string;
      const field = await definition(api, world.universeId, kind);
      await api.expect(200, 'PUT', `/entities/${id}/facts/${field}`, {
        value: { type: 'number', number: 7 },
      });
      const edit = await api.expect(200, 'PUT', `/entities/${id}/facts/${field}`, {
        value: { type: 'number', number: 8 },
        isSpoiler: true,
      });
      await revertBatch(db, edit.batchId ?? '', actor);
      expect((await api.expect(200, 'GET', `/entities/${id}/facts`)).body.data).toEqual([
        expect.objectContaining({ value: { type: 'number', number: 7 }, isSpoiler: false }),
      ]);
      const removal = await api.expect(204, 'DELETE', `/entities/${id}/facts/${field}`);
      await revertBatch(db, removal.batchId ?? '', actor);
      expect((await api.expect(200, 'GET', `/entities/${id}/facts`)).body.data).toHaveLength(1);
    }));
});
