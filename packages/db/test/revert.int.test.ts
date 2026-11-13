import { rt } from '@ge/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getTableConfig, type PgColumn, type PgTable } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  AUDITED_TABLES,
  revertBatch,
  RevertConflictError,
  withBatch,
  type Actor,
  type Transaction,
} from '../src/audit/index.ts';
import type { Database } from '../src/client.ts';
import {
  celestialObjects,
  changeBatches,
  entities,
  entityImages,
  entityLinks,
  entityLocations,
  fieldValues,
  groupMembers,
  routes,
} from '../src/schema/index.ts';
import { withTestDb } from '../src/testing/index.ts';
import { assetValues, buildWorld, type World } from './history-world.ts';

const actor: Actor = { type: 'local', label: 'local' };

/**
 * One case per audited table: the row to insert (given a world of rows it can point at) and a
 * change to make to it. The test fails if a table in AUDITED_TABLES has no case, so a new
 * table can't skip the revert check.
 */
interface TableCase {
  prepare?: (tx: Transaction, world: World) => Promise<Record<string, string>>;
  row: (world: World, prepared: Record<string, string>) => Record<string, unknown>;
  change: Record<string, unknown>;
}

const cases: Record<string, TableCase> = {
  universes: {
    row: () => ({ slug: 'second', name: rt.plain('Second'), namePlain: 'Second' }),
    change: { namePlain: 'Renamed' },
  },
  maps: {
    row: (w) => ({
      universeId: w.universeId,
      slug: 'era-two',
      name: rt.plain('Era'),
      namePlain: 'Era',
    }),
    change: { sortKey: 5, isSpoiler: true },
  },
  entities: {
    row: (w) => ({
      universeId: w.universeId,
      mapId: w.mapId,
      kind: 'place',
      name: rt.md('**P**'),
      namePlain: 'P',
    }),
    change: { isSpoiler: true, summary: rt.plain('S') },
  },
  celestial_objects: {
    prepare: async (_tx, w) => ({ entityId: await w.bareEntity('celestial_object') }),
    row: (w, p) => ({
      entityId: p.entityId,
      mapId: w.mapId,
      baseType: 'planet',
      parentId: w.systemId,
      appearance: { color: '#123456' },
    }),
    change: { x: 10.5, subtypeId: null, appearance: { scale: { system: 2 } } },
  },
  object_groups: {
    prepare: async (_tx, w) => ({ entityId: await w.bareEntity('group') }),
    row: (w, p) => ({
      entityId: p.entityId,
      mapId: w.mapId,
      groupTypeId: w.groupTypeId,
      outlineColor: '#c8a24a',
      parentGroupId: w.groupId,
    }),
    change: { outlineColor: '#123456', parentGroupId: null },
  },
  group_members: {
    row: (w) => ({
      groupId: w.groupId,
      groupTypeId: w.groupTypeId,
      mapId: w.mapId,
      objectId: w.systemId,
    }),
    change: { isSpoiler: true },
  },
  routes: {
    prepare: async (_tx, w) => ({ entityId: await w.bareEntity('route') }),
    row: (w, p) => ({ entityId: p.entityId, mapId: w.mapId, style: { dashed: true } }),
    change: { style: { color: '#123456', widthPx: 3 } },
  },
  route_waypoints: {
    prepare: async (tx, w) => {
      const routeId = await w.bareEntity('route');
      await tx.insert(routes).values({ entityId: routeId, mapId: w.mapId });
      return { routeId };
    },
    row: (w, p) => ({ routeId: p.routeId, seq: 0, mapId: w.mapId, objectId: w.systemId }),
    change: { seq: 4 },
  },
  events: {
    prepare: async (_tx, w) => ({ entityId: await w.bareEntity('event') }),
    row: (w, p) => ({
      entityId: p.entityId,
      mapId: w.mapId,
      dateText: '240.M41',
      categoryId: w.eventCategoryId,
    }),
    change: { dateSort: 240.41 },
  },
  entity_locations: {
    row: (w) => ({ entityId: w.placeId, mapId: w.mapId, mode: 'object', objectId: w.systemId }),
    change: { isSpoiler: true },
  },
  relations: {
    row: (w) => ({
      universeId: w.universeId,
      fromEntityId: w.characterId,
      toEntityId: w.eventId,
      relationType: 'participant',
    }),
    change: { role: rt.plain('Leader'), sortKey: 2 },
  },
  entity_links: {
    row: (w) => ({ entityId: w.placeId, url: 'https://example.com' }),
    change: { label: 'Wiki' },
  },
  citations: {
    row: (w) => ({
      entityId: w.systemId,
      target: 'description',
      sourceUrl: 'https://wiki.example/Gudrun',
      retrievedAt: '2026-11-13T12:00:00.000Z',
    }),
    change: { license: 'CC-BY-SA', retrievedAt: '2026-11-14T12:00:00.000Z' },
  },
  entity_images: {
    row: (w) => ({ entityId: w.placeId, assetId: w.assetId, role: 'cover' }),
    change: { caption: rt.plain('Ruins'), sortKey: 3 },
  },
  field_values: {
    row: (w) => ({
      entityId: w.systemId,
      fieldDefinitionId: w.fieldDefinitionId,
      value: { type: 'number', number: 5 },
    }),
    change: { value: { type: 'number', number: 6 } },
  },
  group_types: {
    row: (w) => ({
      universeId: w.universeId,
      name: 'Faction',
      layer: 'Political',
      defaultColor: '#00ff00',
    }),
    change: { layer: 'Military' },
  },
  event_categories: {
    row: (w) => ({ universeId: w.universeId, name: 'Rebellion', icon: 'flame', color: '#ff8800' }),
    change: { icon: 'skull' },
  },
  object_subtypes: {
    row: (w) => ({ universeId: w.universeId, baseType: 'station', name: 'Star Fort' }),
    change: { icon: 'castle', defaultAppearance: { color: '#abcdef' } },
  },
  field_definitions: {
    row: (w) => ({
      universeId: w.universeId,
      key: 'climate',
      label: 'Climate',
      valueType: 'text',
      appliesToKind: 'celestial_object',
      wikiAliases: ['climate'],
    }),
    change: { unit: '°C', wikiAliases: ['climate', 'weather'] },
  },
  assets: {
    row: (w) => assetValues(w.universeId, 'case-asset'),
    change: { credit: 'Someone', license: 'CC BY 4.0' },
  },
};

/** A row without the bookkeeping a revert legitimately changes. */
function content(row: Record<string, unknown> | undefined) {
  if (!row) return undefined;
  const rest = { ...row };
  delete rest.updatedAt;
  delete rest.version;
  return rest;
}

function primaryKeyColumns(table: PgTable): PgColumn[] {
  const config = getTableConfig(table);
  const composite = config.primaryKeys[0]?.columns ?? [];
  return composite.length > 0 ? composite : config.columns.filter((column) => column.primary);
}

function wherePrimaryKey(table: PgTable, row: Record<string, unknown>) {
  return and(...primaryKeyColumns(table).map((column) => eq(column, row[column.name])));
}

async function currentRow(db: Database, table: PgTable, key: Record<string, unknown>) {
  const rows = (await db.select().from(table).where(wherePrimaryKey(table, key))) as Record<
    string,
    unknown
  >[];
  return content(rows[0]);
}

describe('revert and redo, generated for every audited table', () => {
  it('has a case for every audited table', () => {
    const names = AUDITED_TABLES.map((table) => getTableConfig(table).name);
    expect(Object.keys(cases).sort()).toEqual([...names].sort());
  });

  it.each(AUDITED_TABLES.map((table) => [getTableConfig(table).name, table] as const))(
    '%s: insert, update and delete revert, and the reverts revert',
    (name, table) =>
      withTestDb(async (db) => {
        const testCase = cases[name];
        if (!testCase) throw new Error(`No case for ${name}.`);
        const { result: world } = await withBatch(db, actor, 'World', (tx) => buildWorld(tx));
        const { result: prepared } = await withBatch(db, actor, 'Prepare', (tx) =>
          testCase.prepare ? testCase.prepare(tx, world) : Promise.resolve({}),
        );

        const inserted = await withBatch(db, actor, 'Insert', async (tx) => {
          const rows = (await tx
            .insert(table)
            .values(testCase.row(world, prepared) as never)
            .returning()) as Record<string, unknown>[];
          return rows[0] ?? {};
        });
        const key = inserted.result;
        const afterInsert = await currentRow(db, table, key);
        const updated = await withBatch(db, actor, 'Update', (tx) =>
          tx
            .update(table)
            .set(testCase.change as never)
            .where(wherePrimaryKey(table, key)),
        );
        const afterUpdate = await currentRow(db, table, key);
        expect(afterUpdate).not.toEqual(afterInsert);
        const deleted = await withBatch(db, actor, 'Delete', (tx) =>
          tx.delete(table).where(wherePrimaryKey(table, key)),
        );
        expect(await currentRow(db, table, key)).toBeUndefined();

        // Undo all three, newest first.
        const undoDelete = await revertBatch(db, deleted.batchId, actor);
        expect(await currentRow(db, table, key)).toEqual(afterUpdate);
        const undoUpdate = await revertBatch(db, updated.batchId, actor);
        expect(await currentRow(db, table, key)).toEqual(afterInsert);
        const undoInsert = await revertBatch(db, inserted.batchId, actor);
        expect(await currentRow(db, table, key)).toBeUndefined();

        // Redo them by reverting the reverts, oldest first.
        await revertBatch(db, undoInsert.batchId, actor);
        expect(await currentRow(db, table, key)).toEqual(afterInsert);
        await revertBatch(db, undoUpdate.batchId, actor);
        expect(await currentRow(db, table, key)).toEqual(afterUpdate);
        await revertBatch(db, undoDelete.batchId, actor);
        expect(await currentRow(db, table, key)).toBeUndefined();
      }),
  );
});

/** Every audited table's rows, without bookkeeping, for whole-database comparisons. */
async function snapshot(db: Database) {
  const result: Record<string, unknown[]> = {};
  for (const table of AUDITED_TABLES) {
    const rows = (await db.select().from(table)) as Record<string, unknown>[];
    result[getTableConfig(table).name] = rows
      .map(content)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  return result;
}

describe('revert after a cascading delete', () => {
  it('restores a deleted system with its children, memberships, images, facts and located events', () =>
    withTestDb(async (db) => {
      const { result: world } = await withBatch(db, actor, 'World', async (tx) => {
        const w = await buildWorld(tx);
        const planetId = await w.bareEntity('celestial_object');
        await tx
          .insert(celestialObjects)
          .values({ entityId: planetId, mapId: w.mapId, baseType: 'planet', parentId: w.systemId });
        const moonId = await w.bareEntity('celestial_object');
        await tx
          .insert(celestialObjects)
          .values({ entityId: moonId, mapId: w.mapId, baseType: 'moon', parentId: planetId });
        await tx.insert(groupMembers).values({
          groupId: w.groupId,
          groupTypeId: w.groupTypeId,
          mapId: w.mapId,
          objectId: w.systemId,
        });
        await tx
          .insert(entityImages)
          .values({ entityId: w.systemId, assetId: w.assetId, role: 'cover' });
        await tx
          .insert(entityLinks)
          .values({ entityId: planetId, url: 'https://example.com/planet' });
        await tx.insert(fieldValues).values({
          entityId: moonId,
          fieldDefinitionId: w.fieldDefinitionId,
          value: { type: 'number', number: 1 },
        });
        await tx.insert(entityLocations).values({
          entityId: w.eventId,
          mapId: w.mapId,
          mode: 'surface',
          objectId: planetId,
          latDeg: 10,
          lonDeg: 20,
        });
        return w;
      });
      const before = await snapshot(db);

      // Deleting an object deletes its whole subtree, as the entity service will (M1-T5).
      const deleted = await withBatch(db, actor, 'Delete the system', (tx) =>
        tx.delete(entities).where(
          inArray(
            entities.id,
            sql`(with recursive subtree as (
                   select entity_id from celestial_objects where entity_id = ${world.systemId}
                   union all
                   select c.entity_id from celestial_objects c join subtree s on c.parent_id = s.entity_id)
                 select entity_id from subtree)`,
          ),
        ),
      );
      const afterDelete = await snapshot(db);
      expect(afterDelete.celestial_objects).toHaveLength(0);
      expect(afterDelete.entity_locations).toHaveLength(0); // the event's location went with the planet
      expect(afterDelete.entities).toHaveLength(
        before.entities?.length ? before.entities.length - 3 : 0,
      );

      await revertBatch(db, deleted.batchId, actor);
      expect(await snapshot(db)).toEqual(before);
    }));
});

describe('revert conflicts', () => {
  it('refuses to revert a change that was changed again since, and changes nothing', () =>
    withTestDb(async (db) => {
      const { result: placeId } = await withBatch(
        db,
        actor,
        'World',
        async (tx) => (await buildWorld(tx)).placeId,
      );
      const rename = (name: string) =>
        withBatch(db, actor, `Rename to ${name}`, (tx) =>
          tx
            .update(entities)
            .set({ namePlain: name, version: sql`${entities.version} + 1` })
            .where(eq(entities.id, placeId)),
        );
      const first = await rename('First');
      await rename('Second');
      const batchesBefore = await db.select().from(changeBatches);

      const error: unknown = await revertBatch(db, first.batchId, actor).catch(
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(RevertConflictError);
      expect(error).toMatchObject({ table: 'entities', primaryKey: { id: placeId } });

      const [row] = await db.select().from(entities).where(eq(entities.id, placeId));
      expect(row?.namePlain).toBe('Second');
      expect(await db.select().from(changeBatches)).toHaveLength(batchesBefore.length);
    }));

  it('reports an unknown batch', async () => {
    await withTestDb(async (db) => {
      await expect(revertBatch(db, '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b', actor)).rejects.toThrow(
        /does not exist/,
      );
    });
  });
});
