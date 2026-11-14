import { schema, type Executor } from '@ge/db';
import { OPERATION_REFERENCE, type BatchOperation } from '@ge/domain';
import { inArray } from 'drizzle-orm';
import type { z } from 'zod';
import { accessTo, atLeast, type Requester } from './access.ts';

/**
 * The batch endpoint's access check (M8-T11): every operation's universe, found from the rows
 * its `mapId`, `universeId` or `id` name, must be editable by the requester, before any
 * operation runs. One that isn't makes the whole batch fail, so a batch across two universes,
 * one of them not the requester's to change, changes nothing.
 *
 * Ids inside an operation's `data` (a parent, a waypoint) are the services' to check: they
 * must be on the same map or in the same universe as the operation's own row.
 */

type Operation = z.infer<typeof BatchOperation>;

export type BatchRefusal =
  /** A named row doesn't exist, or its universe can't be read: a 404, as for a missing row. */
  | { status: 404; index: number; what: string; id: string }
  /** Its universe can be read but not changed. */
  | { status: 403; index: number };

const { entities, maps, universes } = schema;

/** What an operation names directly, skipping `"$op:N"`: those are earlier operations' rows. */
function namedBy(operation: Operation) {
  const real = (id: string | undefined) =>
    id === undefined || OPERATION_REFERENCE.test(id) ? undefined : id;
  return {
    mapId: 'mapId' in operation ? real(operation.mapId) : undefined,
    universeId: 'universeId' in operation ? real(operation.universeId) : undefined,
    id: 'id' in operation ? real(operation.id) : undefined,
  };
}

async function universesOf(
  ex: Executor,
  table: typeof entities | typeof maps,
  ids: string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await ex
    .select({ id: table.id, universeId: table.universeId })
    .from(table)
    .where(inArray(table.id, ids));
  return new Map(rows.map((row) => [row.id, row.universeId]));
}

/** Why the requester may not run these operations, or null if they may. */
export async function refuseBatch(
  ex: Executor,
  requester: Requester,
  operations: readonly Operation[],
): Promise<BatchRefusal | null> {
  const named = operations.map(namedBy);
  const pick = (key: 'mapId' | 'universeId' | 'id') => [
    ...new Set(named.flatMap((item) => item[key] ?? [])),
  ];
  const mapUniverses = await universesOf(ex, maps, pick('mapId'));
  const entityUniverses = await universesOf(ex, entities, pick('id'));
  const knownUniverses = new Set(
    pick('universeId').length === 0
      ? []
      : (
          await ex
            .select({ id: universes.id })
            .from(universes)
            .where(inArray(universes.id, pick('universeId')))
        ).map((row) => row.id),
  );

  // Each operation's universe, or the first row it names that doesn't exist.
  const perOperation: (string | undefined)[] = [];
  for (const [index, { mapId, universeId, id }] of named.entries()) {
    const lookups: [string | undefined, string, Map<string, string> | Set<string>][] = [
      [mapId, 'map', mapUniverses],
      [universeId, 'universe', knownUniverses],
      [id, 'entity', entityUniverses],
    ];
    let universe: string | undefined;
    for (const [value, what, found] of lookups) {
      if (value === undefined) continue;
      const of = found instanceof Map ? found.get(value) : found.has(value) ? value : undefined;
      if (of === undefined) return { status: 404, index, what, id: value };
      universe ??= of;
    }
    perOperation.push(universe);
  }

  const touched = [...new Set(perOperation.flatMap((universe) => universe ?? []))];
  const access = await accessTo(ex, requester, touched);
  for (const [index, universe] of perOperation.entries()) {
    if (universe === undefined) continue;
    const level = access.get(universe) ?? 'none';
    if (level === 'none') {
      const { mapId, universeId, id } = named[index] ?? {};
      const [what, value] = mapId
        ? ['map', mapId]
        : universeId
          ? ['universe', universeId]
          : ['entity', id ?? ''];
      return { status: 404, index, what, id: value };
    }
    if (!atLeast(level, 'edit')) return { status: 403, index };
  }
  return null;
}
