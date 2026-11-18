import { mkdirSync, writeFileSync } from 'node:fs';
import { callTool, describeTarget, field, listOf, rest } from './client.ts';

/**
 * Builds one universe the way an outside agent would (README.md): the universe and its map
 * with the REST API (MCP has no tools for them), its settings with MCP tools, then all its
 * content in one MCP `batch`, a dry run first. The whole content is one undo step.
 */

export interface UniverseSettings {
  subtypes: { baseType: string; name: string; icon?: string; description?: string }[];
  fields: {
    key: string;
    label: string;
    valueType: 'number' | 'text' | 'date_text' | 'url';
    unit?: string;
    appliesToKind: string;
    appliesToBaseType?: string;
  }[];
  categories: { name: string; icon: string; color: string }[];
  groupTypes?: { name: string; layer: string; defaultColor: string }[];
}

/** The ids the settings got, by name or key, for the batch's operations to refer to. */
export interface BuiltIds {
  universeId: string;
  mapId: string;
  subtypes: Record<string, string>;
  fields: Record<string, string>;
  categories: Record<string, string>;
  groupTypes: Record<string, string>;
}

export interface UniversePlan extends UniverseSettings {
  /** For the log and the batch's History label: "Create {title}". */
  title: string;
  universe: { slug: string } & Record<string, unknown>;
  map: Record<string, unknown>;
  operations: (ids: BuiltIds) => Record<string, unknown>[];
}

const OUT = new URL('./out/', import.meta.url);

export async function buildUniverse(plan: UniversePlan): Promise<BuiltIds> {
  console.log(`Building ${plan.title}: ${describeTarget()}`);
  const existing = listOf(await callTool('universes_list', { limit: 1000 }));
  if (existing.some((u) => u.slug === plan.universe.slug)) {
    throw new Error(
      `A universe called "${plan.universe.slug}" already exists there; delete it first, or change its slug.`,
    );
  }
  const universeId = String(field(await rest('POST', '/api/v1/universes', plan.universe), 'id'));
  const mapId = String(
    field(await rest('POST', `/api/v1/universes/${universeId}/maps`, plan.map), 'id'),
  );
  console.log(`Universe ${universeId}, map ${mapId} (private until its owner shares it)`);

  for (const [i, s] of plan.subtypes.entries()) {
    const { description, ...rest } = s;
    await callTool('object_subtypes_create', {
      universeId,
      ...rest,
      ...(description ? { description: { format: 'plain', source: description } } : {}),
      sortKey: i,
    });
  }
  for (const [i, f] of plan.fields.entries())
    await callTool('field_definitions_create', { universeId, ...f, sortKey: i });
  for (const [i, c] of plan.categories.entries())
    await callTool('event_categories_create', { universeId, ...c, sortKey: i });
  for (const [i, g] of (plan.groupTypes ?? []).entries())
    await callTool('group_types_create', { universeId, ...g, sortKey: i });

  // Their ids, read back from the list tools.
  const byKey = async (tool: string, key: string) =>
    Object.fromEntries(
      listOf(await callTool(tool, { universeId })).map((row) => [String(row[key]), String(row.id)]),
    );
  const ids: BuiltIds = {
    universeId,
    mapId,
    subtypes: await byKey('object_subtypes_list', 'name'),
    fields: await byKey('field_definitions_list', 'key'),
    categories: await byKey('event_categories_list', 'name'),
    groupTypes: plan.groupTypes?.length ? await byKey('group_types_list', 'name') : {},
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(new URL(`${plan.universe.slug}-ids.json`, OUT), JSON.stringify(ids, null, 1));

  const operations = plan.operations(ids);
  const description = `Create ${plan.title}`;
  const dry = await callTool('batch', { description, dryRun: true, operations });
  console.log(
    `Dry run of ${String(operations.length)} operations:`,
    JSON.stringify(field(dry, 'impact')),
  );
  const done = await callTool('batch', { description, operations });
  console.log(`Done: batch ${String(field(done, 'batchId'))}, revertable from the History panel.`);
  return ids;
}
