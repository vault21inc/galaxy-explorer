import { mkdirSync, writeFileSync } from 'node:fs';
import { buildUniverse } from '../build-universe.ts';
import { fitArms, plotSvg } from './check.ts';
import { addNeighbourhoods } from './neighbourhoods.ts';
import {
  buildOperations,
  CATEGORIES,
  FIELDS,
  GROUP_TYPES,
  MAP,
  SUBTYPES,
  UNIVERSE,
} from './plan.ts';

/**
 * `pnpm --filter @ge/content milky-way <step>` (README.md):
 * - `plot`: writes out/plot.svg, the top-down check picture.
 * - `fit`: searches the background's twist and bar for the closest match to the measured arms.
 * - `build`: makes the universe and its map (REST), its settings (MCP tools), then every object,
 *   event and person in one MCP `batch`: a dry run first, then for real. One undo step.
 * - `neighbourhoods`: adds the neighbourhood groups (plan.ts) to a Milky Way built before they
 *   existed, such as production's. Changes nothing where they're already there.
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
    groupTypes: GROUP_TYPES,
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
} else if (step === 'neighbourhoods') {
  await addNeighbourhoods();
} else {
  console.log('Usage: pnpm --filter @ge/content milky-way plot | fit | build | neighbourhoods');
  process.exitCode = 1;
}
