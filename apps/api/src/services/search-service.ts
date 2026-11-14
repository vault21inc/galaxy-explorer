import { loadSearchSources, schema, type Executor } from '@ge/db';
import {
  redactionBar,
  searchSnippet,
  searchTerms,
  searchText,
  type EntityKind,
  type SearchResult,
} from '@ge/domain';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { requireUniverse } from './lookup.ts';
import { entityVisible, type Viewer } from './visibility.ts';

/**
 * `GET /universes/{id}/search` (M7-T6, ux.md §6): full-text search over a universe's entries,
 * on the indexes the change batches keep (packages/db search/refresh.ts).
 *
 * - Each word of the query matches words that start with it, accents and case aside: "gud"
 *   finds Gudrun.
 * - With spoilers excluded, it searches only the public index, and names, paths and snippets
 *   are blacked out where they're hidden: a reader can't find, or read, a word only a spoiler
 *   holds.
 * - Ranking: a name that starts with the first word comes first (with spoilers excluded, only
 *   a name the reader may see), then the text's rank, then shorter names.
 */

const { celestialObjects, entities, maps } = schema;

export interface SearchOptions {
  q: string;
  spoilers: 'include' | 'exclude';
  viewer: Viewer;
  limit: number;
}

export async function searchUniverse(
  ex: Executor,
  universeId: string,
  options: SearchOptions,
): Promise<SearchResult[]> {
  await requireUniverse(ex, universeId);
  const terms = searchTerms(options.q);
  if (terms.length === 0) return [];
  const exclude = options.spoilers === 'exclude';
  // Terms are letters and digits only, so they can't carry tsquery syntax.
  const query = sql`to_tsquery('simple', unaccent(${terms.map((term) => `${term}:*`).join(' & ')}))`;
  const column = exclude ? entities.searchPublic : entities.searchAll;
  const nameHidden = sql`(${entities.isSpoiler} or coalesce((${entities.name} ->> 'spoiler')::boolean, false))`;
  const namePrefix = sql`lower(unaccent(${entities.namePlain})) like ${`${terms[0] ?? ''}%`}`;
  const nameFirst = exclude ? sql`(${namePrefix} and not ${nameHidden})` : namePrefix;

  const rows = await ex
    .select({
      id: entities.id,
      kind: entities.kind,
      mapId: entities.mapId,
      namePlain: entities.namePlain,
      nameHidden: sql<boolean>`${nameHidden}`,
      parentId: celestialObjects.parentId,
      mapName: maps.namePlain,
      mapHidden: maps.isSpoiler,
    })
    .from(entities)
    .leftJoin(celestialObjects, eq(celestialObjects.entityId, entities.id))
    .leftJoin(maps, eq(maps.id, entities.mapId))
    .where(
      and(
        eq(entities.universeId, universeId),
        sql`${column} @@ ${query}`,
        entityVisible(options.viewer),
      ),
    )
    .orderBy(
      desc(nameFirst),
      desc(sql`ts_rank(${column}, ${query})`),
      asc(sql`length(${entities.namePlain})`),
      asc(entities.namePlain),
    )
    .limit(options.limit);
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const ancestors = await ancestorsOf(ex, ids);
  const sources = new Map(
    (await loadSearchSources(ex, ids)).map((source) => [source.id, searchText(source)]),
  );
  const shown = (name: string, hidden: boolean) => (exclude && hidden ? redactionBar(name) : name);
  return rows.map((row) => {
    const text = sources.get(row.id);
    // The text after the name: what the snippet shows of why it matched.
    const body = (exclude ? text?.public : text?.all)?.slice(1).filter((piece) => piece !== '');
    return {
      id: row.id as SearchResult['id'],
      kind: row.kind as EntityKind,
      mapId: row.mapId as SearchResult['mapId'],
      parentId: (row.parentId ?? null) as SearchResult['parentId'],
      name: shown(row.namePlain, row.nameHidden),
      path: [
        ...(row.mapName === null ? [] : [shown(row.mapName, row.mapHidden ?? false)]),
        ...(ancestors.get(row.id) ?? []).map((ancestor) => shown(ancestor.name, ancestor.hidden)),
      ],
      snippet: searchSnippet((body ?? []).join(' · '), terms),
    };
  });
}

/** Each object's ancestors, outermost first: the systems and planets it's inside. */
async function ancestorsOf(ex: Executor, ids: readonly string[]) {
  const result = await ex.execute<{
    result_id: string;
    depth: number;
    name_plain: string;
    hidden: boolean;
  }>(sql`
    with recursive chain(result_id, id, depth) as (
      select entity_id, parent_id, 1 from celestial_objects
        where entity_id = any(${sql.param([...ids])}::uuid[]) and parent_id is not null
      union all
      select chain.result_id, c.parent_id, chain.depth + 1
        from chain join celestial_objects c on c.entity_id = chain.id
        where c.parent_id is not null
    )
    select chain.result_id, chain.depth, e.name_plain,
           (e.is_spoiler or coalesce((e.name ->> 'spoiler')::boolean, false)) as hidden
    from chain join entities e on e.id = chain.id
    order by chain.depth desc`);
  const byResult = new Map<string, { name: string; hidden: boolean }[]>();
  for (const row of result.rows) {
    const list = byResult.get(row.result_id) ?? [];
    list.push({ name: row.name_plain, hidden: row.hidden });
    byResult.set(row.result_id, list);
  }
  return byResult;
}
