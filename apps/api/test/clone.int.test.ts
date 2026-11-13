import { CLONE_SPEC, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedDemo } from '../src/seeds/demo.ts';
import { apiOn, type Api } from './contract/harness.ts';

/** Cloning a map for another era (M7-T5, data-model §10). */

type Json = Record<string, any>;

async function count(db: Database, query: ReturnType<typeof sql>): Promise<number> {
  const result = await db.execute<{ n: number }>(sql`select count(*)::int as n from (${query}) q`);
  return result.rows[0]?.n ?? 0;
}

/** A spec table's rows that belong to a map, by the spec's own rule. */
function rowsOf(table: string, select: string, mapId: string) {
  const onMap = (column: string) =>
    sql`${sql.identifier(column)} in (select id from entities where map_id = ${mapId})`;
  const where =
    select === 'map_id'
      ? sql`map_id = ${mapId}`
      : select === 'entity_in_map'
        ? onMap('entity_id')
        : sql`(${onMap('from_entity_id')} or ${onMap('to_entity_id')})`;
  return sql`select * from ${sql.identifier(table)} where ${where}`;
}

/** Rows per spec table in the whole universe, and the universe-scoped rows' state. */
async function census(db: Database, universeId: string) {
  const tables: Record<string, number> = {};
  for (const { table } of [{ table: 'maps' }, ...CLONE_SPEC, { table: 'assets' }]) {
    tables[table] = await count(db, sql`select * from ${sql.identifier(table)}`);
  }
  const characters = await db.execute(
    sql`select id, version, updated_at from entities where universe_id = ${universeId} and map_id is null order by id`,
  );
  return { tables, characters: characters.rows };
}

function withDemo(
  fn: (api: Api, db: Database, demo: { universeId: string; mapId: string }) => Promise<void>,
) {
  return withTestDb(async (db, url) => {
    const demo = await seedDemo(db);
    const api = await apiOn(url);
    try {
      await fn(api, db, demo);
    } finally {
      await api.app.close();
    }
  });
}

async function addCitation(api: Api, mapId: string) {
  // The demo has no citations yet; one makes sure that table is copied too.
  const objects = (await api.expect(200, 'GET', `/maps/${mapId}/objects?limit=1`)).body
    .data as Json[];
  await api.expect(201, 'POST', `/entities/${String(objects[0]?.id)}/citations`, {
    target: 'description',
    sourceUrl: 'https://warhammer40k.fandom.com/wiki/Gudrun',
    sourceTitle: 'Gudrun',
    license: 'CC-BY-SA',
    retrievedAt: '2026-11-13T10:00:00.000Z',
  });
}

async function cloneAs(api: Api, mapId: string, slug: string) {
  const result = await api.expect(201, 'POST', `/maps/${mapId}/clone`, {
    slug,
    name: rt.plain(slug.toUpperCase()),
  });
  return { map: result.body.data as Json, batchId: result.batchId ?? '' };
}

describe('cloning a map', () => {
  it('copies every row of every table in the spec, remapped, with lineage, sharing assets', () =>
    withDemo(async (api, db, demo) => {
      await addCitation(api, demo.mapId);
      const before = await census(db, demo.universeId);
      const { map } = await cloneAs(api, demo.mapId, 'm42');
      const cloneId = map.id as string;

      const [row] = (
        await db.execute(
          sql`select cloned_from_map_id, galaxy_settings from maps where id = ${cloneId}`,
        )
      ).rows as Json[];
      expect(row?.cloned_from_map_id).toBe(demo.mapId);
      const source = (await api.expect(200, 'GET', `/maps/${demo.mapId}`)).body.data as Json;
      expect(map).toMatchObject({
        galaxySettings: source.galaxySettings,
        sortKey: (source.sortKey as number) + 1,
      });

      for (const entry of CLONE_SPEC) {
        const original = await count(db, rowsOf(entry.table, entry.select, demo.mapId));
        const copy = await count(db, rowsOf(entry.table, entry.select, cloneId));
        expect(original, `${entry.table} has rows to copy`).toBeGreaterThan(0);
        // A relation between a character and the map's event is counted on each map once.
        expect(copy, entry.table).toBe(original);
        for (const column of entry.remap) {
          // Every id in a copied row is on the copy, or (a relation's other end) universe-scoped.
          const stray = await count(
            db,
            sql`select * from (${rowsOf(entry.table, entry.select, cloneId)}) copied
                where ${sql.identifier(column)} is not null
                  and ${sql.identifier(column)} not in (
                    select id from entities where map_id = ${cloneId} or map_id is null)`,
          );
          expect(stray, `${entry.table}.${column}`).toBe(0);
        }
      }

      // Lineage: each copy names its original, one for one, with the same kind, name and key.
      const lineage = await db.execute<{
        n: number;
        distinct_from: number;
        mismatched: number;
      }>(sql`
        select count(*)::int as n,
               count(distinct c.cloned_from_entity_id)::int as distinct_from,
               count(*) filter (where o.id is null or o.map_id <> ${demo.mapId} or o.kind <> c.kind
                                or o.name_plain <> c.name_plain
                                or o.external_key is distinct from c.external_key)::int as mismatched
        from entities c left join entities o on o.id = c.cloned_from_entity_id
        where c.map_id = ${cloneId}`);
      const sourceEntities = await count(
        db,
        sql`select * from entities where map_id = ${demo.mapId}`,
      );
      expect(lineage.rows[0]).toEqual({
        n: sourceEntities,
        distinct_from: sourceEntities,
        mismatched: 0,
      });

      // Images point at the same assets; nothing universe-scoped changed.
      const assetsOf = async (mapId: string) =>
        (
          await db.execute<{ asset_id: string }>(sql`
            select distinct asset_id from entity_images
            where entity_id in (select id from entities where map_id = ${mapId}) order by asset_id`)
        ).rows;
      expect(await assetsOf(cloneId)).toEqual(await assetsOf(demo.mapId));
      const after = await census(db, demo.universeId);
      expect(after.tables.assets).toBe(before.tables.assets);
      expect(after.characters).toEqual(before.characters);
    }));

  it('is one batch: reverting it removes the copy completely', () =>
    withDemo(async (api, db, demo) => {
      await addCitation(api, demo.mapId);
      const before = await census(db, demo.universeId);
      const { batchId } = await cloneAs(api, demo.mapId, 'm42');
      expect((await census(db, demo.universeId)).tables.maps).toBe((before.tables.maps ?? 0) + 1);
      await api.expect(201, 'POST', `/history/${batchId}/revert`);
      expect(await census(db, demo.universeId)).toEqual(before);
    }));

  it('links each entry to its copies and originals, both ways and across generations', () =>
    withDemo(async (api, _db, demo) => {
      const objects = (await api.expect(200, 'GET', `/maps/${demo.mapId}/objects?limit=1000`)).body
        .data as Json[];
      const aster = objects.find((object) => object.externalKey === 'demo-aster');
      const m42 = (await cloneAs(api, demo.mapId, 'm42')).map;
      const m43 = (await cloneAs(api, m42.id as string, 'm43')).map;
      const keyed = async (mapId: string) =>
        (
          (await api.expect(200, 'GET', `/maps/${mapId}/objects?limit=1000`)).body.data as Json[]
        ).find((object) => object.externalKey === 'demo-aster');
      const inM42 = await keyed(m42.id as string);
      const inM43 = await keyed(m43.id as string);
      expect(inM42?.clonedFromEntityId).toBe(aster?.id);
      expect(inM43?.clonedFromEntityId).toBe(inM42?.id);

      const counterparts = async (id: string) =>
        (
          (await api.expect(200, 'GET', `/objects/${id}?include=counterparts`)).body.data
            .counterparts as Json[]
        ).map((item) => [item.map.slug, item.id]);
      expect(await counterparts(String(inM42?.id))).toEqual([
        ['main', aster?.id],
        ['m43', inM43?.id],
      ]);
      expect(await counterparts(String(aster?.id))).toEqual([
        ['m42', inM42?.id],
        ['m43', inM43?.id],
      ]);
      // Characters aren't cloned: they have none.
      const characters = (await api.expect(200, 'GET', `/universes/${demo.universeId}/characters`))
        .body.data as Json[];
      expect(
        (
          await api.expect(
            200,
            'GET',
            `/characters/${String(characters[0]?.id)}?include=counterparts`,
          )
        ).body.data.counterparts,
      ).toEqual([]);
    }));

  it('refuses a slug the universe already uses, cloning nothing', () =>
    withDemo(async (api, db, demo) => {
      const before = await census(db, demo.universeId);
      const result = await api.call('POST', `/maps/${demo.mapId}/clone`, {
        slug: 'main',
        name: rt.plain('Main again'),
      });
      expect(result.status).toBeGreaterThanOrEqual(400);
      expect(await census(db, demo.universeId)).toEqual(before);
    }));
});
