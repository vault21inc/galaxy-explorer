import {
  CONFIG_RESOURCES,
  configResources,
  ENTITY_KINDS,
  entityKinds,
  type ConfigResource,
  type EntityKind,
} from '@ge/domain';
import { inputOf, OPERATIONS, type InputLayout, type Operation } from './openapi.ts';

/**
 * The MCP server's tools (M7-T7, D-18), generated from the registries, so a new entity kind or
 * settings resource brings its tools with it:
 * - per entity kind: `<plural>_list`, `_get`, `_create`, `_update`, `_delete`, `_upsert_by_key`;
 * - per settings resource: `<resource>_list`, `_create`, `_update`, `_delete`;
 * - shared: `batch`, `history_list`, `history_revert`, `search`, `view_galaxy`, `view_system`,
 *   `view_orbit`, `universes_list`, `maps_list`, and `import_dry_run` (import.ts).
 *
 * Each maps to one API operation, whose parameters and body make its input and whose summary
 * and description explain it.
 */

export interface Tool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  operation: Operation;
  layout: InputLayout;
  /** Changes content: one change batch, labelled "MCP: …", which the result names. */
  writes: boolean;
}

const KIND_ACTIONS = [
  ['list', 'list'],
  ['get', 'get'],
  ['create', 'create'],
  ['update', 'update'],
  ['delete', 'delete'],
  ['upsert_by_key', 'upsertByKey'],
] as const;

const CONFIG_ACTIONS = ['list', 'create', 'update', 'delete'] as const;

/** The shared tools and the operations they call. */
const SHARED: readonly (readonly [string, string])[] = [
  ['batch', 'batch.run'],
  ['history_list', 'history.list'],
  ['history_revert', 'history.revert'],
  ['search', 'universes.search'],
  ['view_galaxy', 'views.galaxy'],
  ['view_system', 'views.system'],
  ['view_orbit', 'views.orbit'],
  ['universes_list', 'universes.list'],
  ['maps_list', 'maps.list'],
];

/** Every generated tool's name and operation, from the registries. */
export function toolOperations(): [name: string, operationId: string][] {
  const kinds = ENTITY_KINDS.flatMap((kind: EntityKind) => {
    const { plural } = entityKinds[kind];
    return KIND_ACTIONS.map(([action, operation]): [string, string] => [
      `${plural}_${action}`,
      `${plural}.${operation}`,
    ]);
  });
  const settings = CONFIG_RESOURCES.flatMap((resource: ConfigResource) =>
    CONFIG_ACTIONS.map((action): [string, string] => [
      `${resource}_${action}`,
      `${configResources[resource].plural}.${action}`,
    ]),
  );
  return [...kinds, ...settings, ...SHARED.map(([name, id]): [string, string] => [name, id])];
}

const WRITE_NOTE =
  'Writes are one change batch, labelled "MCP: <tool> — …" in the History panel; the result names its `batchId`, which history_revert undoes.';

export function buildTools(): Tool[] {
  return toolOperations().map(([name, operationId]) => {
    const operation = OPERATIONS.get(operationId);
    if (!operation)
      throw new Error(`The API has no operation ${operationId} for the tool ${name}.`);
    const { schema, layout } = inputOf(operation);
    const writes = operation.method !== 'GET';
    return {
      name,
      description: [operation.summary, operation.description, writes ? WRITE_NOTE : '']
        .filter((part) => part !== '')
        .join('\n\n'),
      inputSchema: schema,
      operation,
      layout,
      writes,
    };
  });
}
