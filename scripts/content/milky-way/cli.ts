import { mkdirSync, writeFileSync } from 'node:fs';
import { callTool, describeTarget, field, listOf, rest } from '../client.ts';
import { fitArms, plotSvg } from './check.ts';
import {
  buildOperations,
  CATEGORIES,
  FIELDS,
  MAP,
  SUBTYPES,
  UNIVERSE,
  type SettingIds,
} from './plan.ts';

/**
 * `pnpm --filter @ge/content milky-way <step>` (README.md):
 * - `plot`: writes out/plot.svg, the top-down check picture.
 * - `fit`: searches the background's twist and bar for the closest match to the measured arms.
 * - `build`: makes the universe and its map (REST), its settings (MCP tools), then every object,
 *   event and person in one MCP `batch`: a dry run first, then for real. One undo step.
 */
const OUT = new URL('../out/', import.meta.url);

async function build() {
  console.log(`Building the Milky Way: ${describeTarget()}`);
  const existing = listOf(await callTool('universes_list', { limit: 1000 }));
  if (existing.some((u) => u.slug === UNIVERSE.slug)) {
    throw new Error(
      `A universe called "${UNIVERSE.slug}" already exists there; delete it first, or change UNIVERSE.slug.`,
    );
  }
  // MCP has no tools for universes and maps, so these two go through the REST API.
  const universeId = String(field(await rest('POST', '/api/v1/universes', UNIVERSE), 'id'));
  const mapId = String(
    field(await rest('POST', `/api/v1/universes/${universeId}/maps`, MAP), 'id'),
  );
  console.log(`Universe ${universeId}, map ${mapId} (private until its owner shares it)`);

  for (const [i, s] of SUBTYPES.entries()) {
    const { description, ...rest } = s;
    await callTool('object_subtypes_create', {
      universeId,
      ...rest,
      ...(description ? { description: { format: 'plain', source: description } } : {}),
      sortKey: i,
    });
  }
  for (const [i, f] of FIELDS.entries())
    await callTool('field_definitions_create', { universeId, ...f, sortKey: i });
  for (const [i, c] of CATEGORIES.entries())
    await callTool('event_categories_create', { universeId, ...c, sortKey: i });

  // Their ids, read back from the list tools.
  const byKey = async (tool: string, key: string) =>
    Object.fromEntries(
      listOf(await callTool(tool, { universeId })).map((row) => [String(row[key]), String(row.id)]),
    );
  const ids: SettingIds = {
    universeId,
    mapId,
    subtypes: await byKey('object_subtypes_list', 'name'),
    fields: await byKey('field_definitions_list', 'key'),
    categories: await byKey('event_categories_list', 'name'),
  };
  writeFileSync(new URL('ids.json', OUT), JSON.stringify(ids, null, 1));

  const operations = buildOperations(ids);
  const description = 'Create the real Milky Way';
  const dry = await callTool('batch', { description, dryRun: true, operations });
  console.log(
    `Dry run of ${String(operations.length)} operations:`,
    JSON.stringify(field(dry, 'impact')),
  );
  const done = await callTool('batch', { description, operations });
  console.log(`Done: batch ${String(field(done, 'batchId'))}, revertable from the History panel.`);
}

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
