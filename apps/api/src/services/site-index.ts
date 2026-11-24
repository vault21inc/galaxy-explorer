import { schema, type Executor } from '@ge/db';
import type { RichText } from '@ge/domain';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { accessFactsOf, universeAccess, type Requester } from './access.ts';
import { spoilerFree } from './card-text.ts';
import { entityVisible } from './visibility.ts';

/**
 * What a stranger may see, listed for crawlers (D-62): the public universes, their maps and
 * the objects on them, for the sitemap and for the links on the pages search engines read.
 * The same rules as a link preview (M8-T9): read as an anonymous visitor, drafts never, and
 * nothing that's a spoiler or has one for a name, since the preview of its address would say
 * nothing of it.
 */

/** Nobody in particular, with no share keys: what a chat app's fetcher is. */
export const STRANGER: Requester = { kind: 'anonymous', shareKeys: new Map() };

const { celestialObjects, entities, maps, universes } = schema;

export interface SiteUniverse {
  id: string;
  slug: string;
  name: string;
  description: RichText | null;
}

export interface SiteMap {
  id: string;
  universeId: string;
  slug: string;
  name: string;
  description: RichText | null;
}

export interface SiteObject {
  id: string;
  mapId: string;
  name: string;
  summary: RichText | null;
  /** Opens a view of its own, at `…/view/{id}`; anything else is selected, `?select={id}`. */
  explorable: boolean;
}

/** The universes a stranger may read, by name. */
export async function strangerUniverses(ex: Executor): Promise<SiteUniverse[]> {
  const rows = await ex
    .select({
      id: universes.id,
      slug: universes.slug,
      name: universes.name,
      description: universes.description,
    })
    .from(universes)
    .orderBy(asc(universes.namePlain));
  const facts = await accessFactsOf(
    ex,
    STRANGER,
    rows.map((row) => row.id),
  );
  return rows.flatMap((row) => {
    const known = facts.get(row.id);
    const name = spoilerFree(row.name);
    return known && universeAccess(STRANGER, known) !== 'none' && name !== null
      ? [{ ...row, name }]
      : [];
  });
}

/** Their published maps that aren't spoilers, in the universe's order. */
export async function strangerMaps(
  ex: Executor,
  universeIds: readonly string[],
): Promise<SiteMap[]> {
  if (universeIds.length === 0) return [];
  const rows = await ex
    .select({
      id: maps.id,
      universeId: maps.universeId,
      slug: maps.slug,
      name: maps.name,
      description: maps.description,
    })
    .from(maps)
    .where(
      and(
        inArray(maps.universeId, [...universeIds]),
        eq(maps.status, 'published'),
        eq(maps.isSpoiler, false),
      ),
    )
    .orderBy(asc(maps.sortKey), asc(maps.namePlain));
  return rows.flatMap((row) => {
    const name = spoilerFree(row.name);
    return name === null ? [] : [{ ...row, name }];
  });
}

/**
 * The objects on `mapIds` a stranger may see, by name: those whose parent is `parentId` (null
 * for the galaxy view's), or with `explorableOnly`, every one that opens a view.
 */
export async function strangerObjects(
  ex: Executor,
  mapIds: readonly string[],
  where: { parentId: string | null } | { explorableOnly: true },
  limit: number,
): Promise<SiteObject[]> {
  if (mapIds.length === 0) return [];
  const placed: SQL | undefined =
    'explorableOnly' in where
      ? eq(celestialObjects.explorable, true)
      : where.parentId === null
        ? isNull(celestialObjects.parentId)
        : eq(celestialObjects.parentId, where.parentId);
  const rows = await ex
    .select({
      id: entities.id,
      mapId: celestialObjects.mapId,
      name: entities.name,
      summary: entities.summary,
      explorable: celestialObjects.explorable,
    })
    .from(celestialObjects)
    .innerJoin(entities, eq(entities.id, celestialObjects.entityId))
    .where(
      and(
        inArray(celestialObjects.mapId, [...mapIds]),
        placed,
        entityVisible({ includeDrafts: false }),
        eq(entities.isSpoiler, false),
      ),
    )
    .orderBy(asc(entities.namePlain))
    .limit(limit);
  return rows.flatMap((row) => {
    const name = spoilerFree(row.name);
    return name === null ? [] : [{ ...row, name }];
  });
}
