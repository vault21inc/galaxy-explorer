import { toSnakeCase } from 'drizzle-orm/casing';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import {
  assets,
  celestialObjects,
  citations,
  entities,
  entityImages,
  entityLinks,
  entityLocations,
  entityRelations,
  eventCategories,
  events,
  fieldDefinitions,
  fieldValues,
  groupMembers,
  groupTypes,
  maps,
  objectGroups,
  objectSubtypes,
  routes,
  routeWaypoints,
  universes,
} from '../schema/index.ts';

/**
 * Every content table, each with the `ge_audit` trigger (data-model §9). A write to any of them
 * is logged to `change_log` in the current change batch, which is what undo and revert replay.
 * Not audited: `change_batches` and `change_log` themselves, and the auth tables (M8).
 *
 * An introspection test fails if a table with `map_id` or a foreign key to `entities` is
 * missing here, or if a listed table lacks the trigger.
 */
export const AUDITED_TABLES: readonly PgTable[] = [
  universes,
  maps,
  entities,
  celestialObjects,
  objectGroups,
  groupMembers,
  routes,
  routeWaypoints,
  events,
  entityLocations,
  entityRelations,
  entityLinks,
  entityImages,
  fieldValues,
  citations,
  groupTypes,
  eventCategories,
  objectSubtypes,
  fieldDefinitions,
  assets,
];

/** A table's name and primary-key columns, as the database spells them (snake_case). */
export interface TableKey {
  name: string;
  primaryKey: string[];
}

export function tableKey(table: PgTable): TableKey {
  const config = getTableConfig(table);
  const composite = config.primaryKeys[0]?.columns ?? [];
  const columns =
    composite.length > 0 ? composite : config.columns.filter((column) => column.primary);
  return { name: config.name, primaryKey: columns.map((column) => toSnakeCase(column.name)) };
}
