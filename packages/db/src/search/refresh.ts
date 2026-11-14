import { searchText, type SearchSource } from '@ge/domain';
import { sql } from 'drizzle-orm';
import type { Executor } from '../client.ts';

/**
 * Keeps the entities' search columns current (M7-T6, data-model §12). They're derived: from an
 * entity's name, summary and description, its text facts and its relations' roles, with the
 * spoiler-aware text extraction in @ge/domain (searchText), which is TypeScript and so can't be
 * a generated column or a trigger.
 *
 * `withBatch` refreshes every entity a batch touched as the batch ends, so no write path can
 * forget to: the services, imports, seeds, clones and reverts all go through a batch. The
 * update changes only these columns, which the audit trigger doesn't log (migration 0006).
 */

/** The derived columns, which history and revert treat as bookkeeping rather than content. */
export const SEARCH_COLUMNS = ['search_public', 'search_all'] as const;

/** Entities per round trip: three reads and one update each. */
const CHUNK = 500;

// A type, not an interface: query rows must fit `Record<string, unknown>`, which only a type
// alias does.
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
type EntityRow = {
  id: string;
  is_spoiler: boolean;
  name: SearchSource['name'];
  summary: SearchSource['summary'];
  description: SearchSource['description'];
};

/**
 * What search text is made from, for these entities: their rows, text facts and relations. Also
 * used for search results' snippets, which show the same text.
 */
export async function loadSearchSources(
  ex: Executor,
  entityIds: readonly string[],
): Promise<SearchSource[]> {
  if (entityIds.length === 0) return [];
  const ids = sql.param([...entityIds]);
  const entities = await ex.execute<EntityRow>(sql`
    select id, is_spoiler, name, summary, description from entities where id = any(${ids}::uuid[])`);
  if (entities.rows.length === 0) return [];
  const facts = await ex.execute<{
    entity_id: string;
    field_definition_id: string;
    value: unknown;
    is_spoiler: boolean;
  }>(sql`
    select entity_id, field_definition_id, value, is_spoiler from field_values
    where entity_id = any(${ids}::uuid[])`);
  const relations = await ex.execute<{
    id: string;
    relation_type: string;
    role: SearchSource['summary'];
    is_spoiler: boolean;
    from_entity_id: string;
    to_entity_id: string;
  }>(sql`
    select id, relation_type, role, is_spoiler, from_entity_id, to_entity_id from relations
    where from_entity_id = any(${ids}::uuid[]) or to_entity_id = any(${ids}::uuid[])`);
  return entities.rows.map((row) => ({
    id: row.id,
    isSpoiler: row.is_spoiler,
    name: row.name,
    summary: row.summary,
    description: row.description,
    facts: facts.rows
      .filter((fact) => fact.entity_id === row.id)
      .map((fact) => ({
        fieldDefinitionId: fact.field_definition_id,
        value: fact.value,
        isSpoiler: fact.is_spoiler,
      })),
    // A role describes both ends ("Inquisitor leading the hunt"): each can be found by it.
    relations: relations.rows
      .filter((relation) => relation.from_entity_id === row.id || relation.to_entity_id === row.id)
      .map((relation) => ({
        id: relation.id,
        relationType: relation.relation_type,
        role: relation.role,
        isSpoiler: relation.is_spoiler,
      })),
  }));
}

export async function refreshSearch(ex: Executor, entityIds: readonly string[]): Promise<void> {
  for (let start = 0; start < entityIds.length; start += CHUNK) {
    const sources = await loadSearchSources(ex, entityIds.slice(start, start + CHUNK));
    if (sources.length === 0) continue;
    const texts = sources.map((source) => {
      const text = searchText(source);
      return { id: source.id, all: text.all.join('\n'), public: text.public.join('\n') };
    });
    await ex.execute(sql`
      update entities e set
        search_all = to_tsvector('simple', unaccent(v.all_text)),
        search_public = to_tsvector('simple', unaccent(v.public_text))
      from unnest(
        ${sql.param(texts.map((text) => text.id))}::uuid[],
        ${sql.param(texts.map((text) => text.all))}::text[],
        ${sql.param(texts.map((text) => text.public))}::text[]
      ) as v(id, all_text, public_text)
      where e.id = v.id`);
  }
}

/** Refreshes every entity a batch changed: its own row, its facts, or its relations. */
export async function refreshSearchForBatch(ex: Executor, batchId: string): Promise<void> {
  const touched = await ex.execute<{ id: string }>(sql`
    select distinct touched.id from (
      select (pk ->> 'id')::uuid as id from change_log
        where batch_id = ${batchId} and table_name = 'entities'
      union all
      select (coalesce(after, before) ->> 'entity_id')::uuid from change_log
        where batch_id = ${batchId} and table_name = 'field_values'
      union all
      select (coalesce(after, before) ->> 'from_entity_id')::uuid from change_log
        where batch_id = ${batchId} and table_name = 'relations'
      union all
      select (coalesce(after, before) ->> 'to_entity_id')::uuid from change_log
        where batch_id = ${batchId} and table_name = 'relations'
    ) touched
    join entities e on e.id = touched.id`);
  await refreshSearch(
    ex,
    touched.rows.map((row) => row.id),
  );
}

/** Fills the columns of entities that have none: after the migration that added them. */
export async function refreshMissingSearch(ex: Executor): Promise<number> {
  const missing = await ex.execute<{ id: string }>(
    sql`select id from entities where search_all is null`,
  );
  await refreshSearch(
    ex,
    missing.rows.map((row) => row.id),
  );
  return missing.rows.length;
}
