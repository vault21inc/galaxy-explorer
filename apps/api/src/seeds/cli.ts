/**
 * `pnpm db:seed demo` and
 * `pnpm db:seed stress [--objects N] [--groups N] [--routes N] [--seed N] [--closed]`
 * (M1-T11). Reads DATABASE_URL, which the package script loads from the repository's .env.
 */
import { parseArgs } from 'node:util';
import { createDatabase } from '@ge/db';
import { seedDemo } from './demo.ts';
import { seedStress, STRESS_DEFAULTS } from './stress.ts';

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    objects: { type: 'string' },
    groups: { type: 'string' },
    routes: { type: 'string' },
    seed: { type: 'string' },
    /** Systems don't open a view: `pnpm perf`'s galaxy phases (stress.ts). */
    closed: { type: 'boolean' },
  },
});

const which = positionals[0];
const url = process.env.DATABASE_URL;
if (which !== 'demo' && which !== 'stress') {
  console.error(
    'Usage: pnpm db:seed demo | pnpm db:seed stress [--objects 5000] [--groups 300] [--routes 50] [--seed 40000] [--closed]',
  );
  process.exit(1);
}
if (!url) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env.');
  process.exit(1);
}

const number = (value: string | undefined, fallback: number) =>
  value === undefined ? fallback : Number(value);
const db = createDatabase(url, {
  onIdleClientError: (error) => {
    console.error(error);
  },
});
const started = performance.now();
try {
  const result =
    which === 'demo'
      ? await seedDemo(db)
      : await seedStress(db, {
          objects: number(values.objects, STRESS_DEFAULTS.objects),
          groups: number(values.groups, STRESS_DEFAULTS.groups),
          routes: number(values.routes, STRESS_DEFAULTS.routes),
          seed: number(values.seed, STRESS_DEFAULTS.seed),
          explorable: values.closed !== true,
        });
  console.log(
    `db:seed ${which}: done in ${((performance.now() - started) / 1000).toFixed(1)} s`,
    result,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await db.$client.end();
}
