import { mkdirSync, writeFileSync } from 'node:fs';
import { buildUniverse } from '../build-universe.ts';
import { fitArms, plotSvg } from './check.ts';
import { buildOperations, CATEGORIES, FIELDS, MAP, SUBTYPES, UNIVERSE } from './plan.ts';

/**
 * `pnpm --filter @ge/content milky-way <step>` (README.md):
 * - `plot`: writes out/plot.svg, the top-down check picture.
 * - `fit`: searches the background's twist and bar for the closest match to the measured arms.
 * - `build`: makes the universe and its map (REST), its settings (MCP tools), then every object,
 *   event and person in one MCP `batch`: a dry run first, then for real. One undo step.
 */
const OUT = new URL('../out/', import.meta.url);

const build = () =>
  buildUniverse({
    title: 'the real Milky Way',
    universe: UNIVERSE,
    map: MAP,
    subtypes: SUBTYPES,
    fields: FIELDS,
    categories: CATEGORIES,
    operations: buildOperations,
  });

mkdirSync(OUT, { recursive: true });
const step = process.argv[2];
if (step === 'plot') {
  writeFileSync(new URL('plot.svg', OUT), plotSvg());
  console.log('Wrote scripts/content/out/plot.svg');
} else if (step === 'fit') {
  console.log(fitArms());
} else if (step === 'build') {
  await build();
} else {
  console.log('Usage: pnpm --filter @ge/content milky-way plot | fit | build');
  process.exitCode = 1;
}
