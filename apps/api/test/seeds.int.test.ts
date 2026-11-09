import { AUDITED_TABLES, tableKey, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { seedDemo } from '../src/seeds/demo.ts';
import { seedStress } from '../src/seeds/stress.ts';

/** The seeds (M1-T11). */

/** Every content table's rows, minus the bookkeeping a re-run legitimately bumps. */
async function contents(db: Database) {
  const result: Record<string, unknown[]> = {};
  for (const table of AUDITED_TABLES) {
    const { name, primaryKey } = tableKey(table);
    const rows = await db.execute<{ row: Record<string, unknown> }>(
      sql`select to_jsonb(t) - 'updated_at' - 'version' as row from ${sql.identifier(name)} t order by ${sql.join(
        primaryKey.map((column) => sql.identifier(column)),
        sql`, `,
      )}`,
    );
    result[name] = rows.rows.map((row) => row.row);
  }
  return result;
}

const count = async (db: Database, query: ReturnType<typeof sql>): Promise<number> => {
  const result = await db.execute<{ n: number }>(sql`select count(*)::int as n from (${query}) q`);
  return result.rows[0]?.n ?? 0;
};

describe('demo seed', () => {
  it('builds the planned contents', () =>
    withTestDb(async (db) => {
      await seedDemo(db);
      const kinds = await db.execute<{ kind: string; n: number }>(
        sql`select kind, count(*)::int as n from entities group by kind order by kind`,
      );
      expect(Object.fromEntries(kinds.rows.map((row) => [row.kind, row.n]))).toEqual({
        celestial_object: 26,
        character: 2,
        event: 4,
        group: 3,
        place: 2,
      });
      const types = await db.execute<{ base_type: string; n: number }>(
        sql`select base_type, count(*)::int as n from celestial_objects group by base_type`,
      );
      expect(Object.fromEntries(types.rows.map((row) => [row.base_type, row.n]))).toEqual({
        system: 7,
        star: 6,
        planet: 7,
        moon: 2,
        asteroid_belt: 1,
        station: 1,
        nebula: 1,
        anomaly: 1,
      });
      const modes = await db.execute<{ mode: string }>(
        sql`select distinct l.mode from entity_locations l join entities e on e.id = l.entity_id where e.kind = 'event' order by 1`,
      );
      expect(modes.rows.map((row) => row.mode)).toEqual(['object', 'place', 'space', 'surface']);
      expect(await count(db, sql`select 1 from entities where external_key is null`)).toBe(0);
    }));

  it('has every spoiler flag in data-model §7 and text in all three formats', () =>
    withTestDb(async (db) => {
      await seedDemo(db);
      const examples: Record<string, ReturnType<typeof sql>> = {
        'a whole map': sql`select 1 from maps where is_spoiler`,
        'a whole entity': sql`select 1 from entities where is_spoiler`,
        'a whole text field': sql`select 1 from entities where (name->>'spoiler')::boolean or (summary->>'spoiler')::boolean or (description->>'spoiler')::boolean`,
        'a universe or map text': sql`select 1 from maps where (description->>'spoiler')::boolean`,
        'an inline Markdown spoiler': sql`select 1 from entities where description->>'format' = 'markdown' and description->>'source' like '%||%||%'`,
        'an inline HTML spoiler': sql`select 1 from entities where description->>'format' = 'html' and description->>'source' like '%data-spoiler%'`,
        'a fact': sql`select 1 from field_values where is_spoiler`,
        'an image': sql`select 1 from entity_images where is_spoiler`,
        'an image caption': sql`select 1 from entity_images where (caption->>'spoiler')::boolean`,
        'a link': sql`select 1 from entity_links where is_spoiler`,
        'a relation': sql`select 1 from relations where is_spoiler`,
        'a relation role': sql`select 1 from relations where (role->>'spoiler')::boolean`,
        'a group membership': sql`select 1 from group_members where is_spoiler`,
        'a location': sql`select 1 from entity_locations where is_spoiler`,
      };
      for (const [flag, query] of Object.entries(examples)) {
        expect(await count(db, query), flag).toBeGreaterThan(0);
      }
      const formats = await db.execute<{ format: string }>(
        sql`select distinct f as format from (select name->>'format' f from entities union select summary->>'format' from entities union select description->>'format' from entities) x where f is not null order by 1`,
      );
      expect(formats.rows.map((row) => row.format)).toEqual(['html', 'markdown', 'plain']);
    }));

  it('changes nothing when run again', () =>
    withTestDb(async (db) => {
      await seedDemo(db);
      const first = await contents(db);
      await seedDemo(db);
      expect(await contents(db)).toEqual(first);
    }));
});

describe('stress seed', () => {
  it(
    'builds 5,000 objects in 300 spatial groups, deterministically, and changes nothing when run again',
    { timeout: 60_000 },
    () =>
      withTestDb(async (db) => {
        const result = await seedStress(db);
        expect(result).toMatchObject({ objects: 5_000, groups: 300 });
        expect(await count(db, sql`select 1 from celestial_objects where parent_id is null`)).toBe(
          5_000,
        );
        expect(await count(db, sql`select 1 from group_members`)).toBe(5_000);
        // Spatial clusters: members of a group sit closer to each other than to the galaxy at large.
        const spread = await db.execute<{ within: number; overall: number }>(sql`
        select avg(within)::float as within, (select stddev(x)::float from celestial_objects) as overall
        from (select stddev(c.x) as within from group_members m join celestial_objects c on c.entity_id = m.object_id group by m.group_id having count(*) > 3) g`);
        expect(spread.rows[0]?.within).toBeLessThan((spread.rows[0]?.overall ?? 0) / 5);
        const first = await contents(db);
        await seedStress(db);
        expect(await contents(db)).toEqual(first);
      }),
  );
});
