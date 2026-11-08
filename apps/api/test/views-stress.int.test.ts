import { gzipSync } from 'node:zlib';
import { withTestDb } from '@ge/db/testing';
import { sql } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { apiOn } from './contract/harness.ts';

/**
 * M1-T9's budget: with 5,000 objects (the stress seed's size; the seed itself arrives in
 * M1-T11), the galaxy payload builds in under 300 ms locally and is under 500 kB gzipped.
 * The map is generated in SQL here, which is far faster than the API for setup.
 */

/** CI machines are slower and shared; the budget is defined on the owner's Mac. */
const BUILD_BUDGET_MS = process.env.CI ? 1_500 : 300;
const SIZE_BUDGET_BYTES = 500 * 1024;
const OBJECTS = 5_000;
const GROUPS = 300;

it(
  `builds the galaxy payload for ${String(OBJECTS)} objects within budget`,
  { timeout: 60_000 },
  () =>
    withTestDb(
      async (db, url) => {
        const name = (text: string) =>
          sql`jsonb_build_object('format', 'plain', 'source', ${sql.raw(text)}, 'spoiler', false)`;
        const [universe] = (
          await db.execute<{ id: string }>(
            sql`insert into universes (slug, name, name_plain) values ('stress', ${name("'Stress'")}, 'Stress') returning id`,
          )
        ).rows;
        const universeId = universe?.id ?? '';
        const [map] = (
          await db.execute<{ id: string }>(
            sql`insert into maps (universe_id, slug, name, name_plain) values (${universeId}, 'main', ${name("'Main'")}, 'Main') returning id`,
          )
        ).rows;
        const mapId = map?.id ?? '';
        const [groupType] = (
          await db.execute<{ id: string }>(
            sql`insert into group_types (universe_id, name, layer, default_color) values (${universeId}, 'Sector', 'Admin', '#c8a24a') returning id`,
          )
        ).rows;
        const groupTypeId = groupType?.id ?? '';

        // Objects spread over a 50,000 ly disc, each with a color override, as authored maps have.
        await db.execute(sql`
        with created as (
          insert into entities (universe_id, map_id, kind, name, name_plain)
          select ${universeId}, ${mapId}, 'celestial_object', ${name("'System ' || i")}, 'System ' || i
          from generate_series(1, ${OBJECTS}) i
          returning id)
        insert into celestial_objects (entity_id, map_id, base_type, explorable, x, y, z, appearance)
        select id, ${mapId}, 'system', true, random() * 50000 - 25000, random() * 400 - 200, random() * 50000 - 25000,
               jsonb_build_object('color', '#' || lpad(to_hex((random() * 16777215)::int), 6, '0'))
        from created`);
        await db.execute(sql`
        with created as (
          insert into entities (universe_id, map_id, kind, name, name_plain)
          select ${universeId}, ${mapId}, 'group', ${name("'Sector ' || i")}, 'Sector ' || i
          from generate_series(1, ${GROUPS}) i
          returning id)
        insert into object_groups (entity_id, map_id, group_type_id, outline_color)
        select id, ${mapId}, ${groupTypeId}, '#c8a24a' from created`);
        // Every object in one of the groups.
        await db.execute(sql`
        with objects as (select entity_id, row_number() over (order by entity_id) - 1 as n from celestial_objects),
             groups as (select entity_id, row_number() over (order by entity_id) - 1 as n from object_groups)
        insert into group_members (group_id, group_type_id, map_id, object_id)
        select g.entity_id, ${groupTypeId}, ${mapId}, o.entity_id
        from objects o join groups g on g.n = o.n % ${GROUPS}`);

        const api = await apiOn(url);
        try {
          const request = () =>
            api.app.inject({ method: 'GET', url: `/api/v1/maps/${mapId}/views/galaxy` });
          await request(); // warm-up: first-use compilation of schemas and query plans
          const timesMs: number[] = [];
          let body = '';
          for (let run = 0; run < 5; run++) {
            const started = performance.now();
            const response = await request();
            timesMs.push(performance.now() - started);
            expect(response.statusCode).toBe(200);
            body = response.body;
          }
          timesMs.sort((a, b) => a - b);
          const medianMs = timesMs[2] ?? 0;
          const gzippedBytes = gzipSync(body).length;
          const view = JSON.parse(body) as {
            data: { objects: unknown[]; groups: { members: unknown[] }[] };
          };
          console.info(
            `galaxy payload: ${String(view.data.objects.length)} objects, ${String(view.data.groups.length)} groups; ` +
              `median ${medianMs.toFixed(0)} ms (runs ${timesMs.map((t) => t.toFixed(0)).join(', ')}); ` +
              `${(body.length / 1024).toFixed(0)} kB raw, ${(gzippedBytes / 1024).toFixed(0)} kB gzipped`,
          );
          expect(view.data.objects).toHaveLength(OBJECTS);
          expect(view.data.groups.flatMap((group) => group.members)).toHaveLength(OBJECTS);
          expect(medianMs).toBeLessThan(BUILD_BUDGET_MS);
          expect(gzippedBytes).toBeLessThan(SIZE_BUDGET_BYTES);
        } finally {
          await api.close();
        }
      },
      { ambientBatch: true },
    ),
);
