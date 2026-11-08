import { gzipSync } from 'node:zlib';
import { withTestDb } from '@ge/db/testing';
import { expect, it } from 'vitest';
import { seedStress } from '../src/seeds/stress.ts';
import { apiOn } from './contract/harness.ts';

/**
 * M1-T9's budget: with the stress seed (5,000 objects, 300 groups), the galaxy payload builds in
 * under 300 ms locally and is under 500 kB gzipped.
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
    withTestDb(async (db, url) => {
      const { mapId } = await seedStress(db, { objects: OBJECTS, groups: GROUPS });

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
    }),
);
