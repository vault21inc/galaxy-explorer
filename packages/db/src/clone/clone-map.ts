import { sql, type SQL } from 'drizzle-orm';
import { CLONE_SPEC, type CloneSpecEntry } from '../audit/clone-spec.ts';
import type { Executor } from '../client.ts';

/**
 * Copies a map's content into another, empty map (data-model §10, M7-T5): every row of every
 * table in `CLONE_SPEC`, inside the caller's change batch, so the audit trigger logs each copy
 * and reverting the batch removes the clone completely. The new map row itself is the
 * caller's: it needs the API's rich-text handling for its name.
 *
 * 1. A temporary table pairs each entity on the map with a fresh id: `clone_ids(old_id,
 *    new_id)`. New ids are made in the old ids' order, and UUIDv7s from one session only
 *    grow, so the copies sort as their originals do.
 * 2. Each table of the spec is copied in its listed order with one `INSERT … SELECT`. The
 *    columns come from the live schema, so a column added later is copied without a change
 *    here. In each row:
 *    - entity-id columns in `remap` are translated through `clone_ids`. An id that isn't on the
 *      map, such as a character at a relation's other end, stays as it is;
 *    - `freshIds` get new ids;
 *    - `map_id` is the new map, `version` starts again at 1, and timestamps are now;
 *    - an `entities` row's `cloned_from_entity_id` is the id it was copied from, the lineage
 *      the "Same object on other maps" switcher follows. External keys are kept: they're
 *      unique per map, so the copies can't collide with their originals.
 *
 * Assets aren't copied (both maps show the same files), nor is anything universe-scoped.
 * Returns the rows copied per table.
 */
export async function cloneMapContent(
  tx: Executor,
  sourceMapId: string,
  targetMapId: string,
): Promise<Record<string, number>> {
  // Rows may point at rows copied later in the same table or batch; check at the end.
  await tx.execute(sql`set constraints all deferred`);
  await tx.execute(
    sql`create temp table clone_ids (old_id uuid primary key, new_id uuid not null) on commit drop`,
  );
  await tx.execute(sql`
    insert into clone_ids (old_id, new_id)
    select id, uuidv7() from (select id from entities where map_id = ${sourceMapId} order by id) as source`);

  const copied: Record<string, number> = {};
  for (const entry of CLONE_SPEC) {
    const columns = await columnsOf(tx, entry.table);
    const names = sql.join(
      columns.map((column) => sql.identifier(column)),
      sql`, `,
    );
    const values = sql.join(
      columns.map((column) => valueOf(entry, column, targetMapId)),
      sql`, `,
    );
    const result = await tx.execute(sql`
      insert into ${sql.identifier(entry.table)} (${names})
      select ${values} from ${sql.identifier(entry.table)} as src
      where ${rowsOf(entry, sourceMapId)}`);
    copied[entry.table] = result.rowCount ?? 0;
  }

  // Dropped now rather than at commit, so a second clone in the same batch can make its own.
  await tx.execute(sql`drop table clone_ids`);
  await tx.execute(sql`set constraints all immediate`);
  return copied;
}

/** A table's writable columns, in order: generated ones fill themselves. */
async function columnsOf(tx: Executor, table: string): Promise<string[]> {
  const result = await tx.execute<{ column_name: string }>(sql`
    select column_name from information_schema.columns
    where table_schema = current_schema() and table_name = ${table}
      and is_generated = 'NEVER' and identity_generation is null
    order by ordinal_position`);
  return result.rows.map((row) => row.column_name);
}

/** One column of a copied row. */
function valueOf(entry: CloneSpecEntry, column: string, targetMapId: string): SQL {
  const own = sql`src.${sql.identifier(column)}`;
  if (column === 'map_id') return sql`${targetMapId}::uuid`;
  if (entry.freshIds.includes(column)) return sql`uuidv7()`;
  if (entry.remap.includes(column)) {
    return sql`coalesce((select new_id from clone_ids where old_id = ${own}), ${own})`;
  }
  if (column === 'version') return sql`1`;
  if (column === 'created_at' || column === 'updated_at') return sql`now()`;
  if (entry.table === 'entities' && column === 'cloned_from_entity_id') return sql`src.id`;
  return own;
}

/** Which rows of a table belong to the map being copied. */
function rowsOf(entry: CloneSpecEntry, sourceMapId: string): SQL {
  const onMap = (column: string) =>
    sql`src.${sql.identifier(column)} in (select old_id from clone_ids)`;
  switch (entry.select) {
    case 'map_id':
      return sql`src.map_id = ${sourceMapId}`;
    case 'entity_in_map':
      return onMap('entity_id');
    case 'either_end_in_map':
      return sql`(${onMap('from_entity_id')} or ${onMap('to_entity_id')})`;
  }
}
