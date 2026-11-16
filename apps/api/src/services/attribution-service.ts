import { schema, type Executor } from '@ge/db';
import type { Attributions, UniverseAttributions } from '@ge/domain';
import { and, asc, eq, inArray, isNotNull, or, sql } from 'drizzle-orm';
import type { Requester } from './access.ts';
import { readableBy } from './container-service.ts';
import { entityVisible } from './visibility.ts';

/**
 * The attributions page's content (M8-T9): the pages entries' text was filled from
 * (citations, M7-T3) and the credits of uploaded images, per universe.
 *
 * Which universes: those the requester can read, as lists have them (`readableBy`): an
 * anonymous visitor's are the public ones. Which entries: published ones only, whoever asks,
 * because the page credits what readers see; a draft's citation would also give the draft
 * away.
 */

const { assets, citations, entities, entityImages, universes } = schema;
const PUBLISHED = entityVisible({ includeDrafts: false });

/** A spoiler entry, or one whose name is a spoiler: its source's title would give it away. */
const spoilerEntry = sql<boolean>`(${entities.isSpoiler} or coalesce((${entities.name} ->> 'spoiler')::boolean, false))`;

export async function listAttributions(ex: Executor, requester: Requester): Promise<Attributions> {
  const where = and(PUBLISHED, readableBy(requester));
  // One row per universe and page, whatever the number of entries or fields that cite it.
  const sources = await ex
    .select({
      universeId: universes.id,
      url: citations.sourceUrl,
      title: sql<string | null>`max(${citations.sourceTitle})`,
      license: sql<string | null>`max(${citations.license})`,
      retrievedAt: sql<Date>`max(${citations.retrievedAt})`.mapWith(
        (value: string | Date) => new Date(value),
      ),
      uses: sql<number>`count(distinct ${citations.entityId})`.mapWith(Number),
      spoiler: sql<boolean>`bool_and(${spoilerEntry})`,
    })
    .from(citations)
    .innerJoin(entities, eq(entities.id, citations.entityId))
    .innerJoin(universes, eq(universes.id, entities.universeId))
    .where(where)
    .groupBy(universes.id, citations.sourceUrl)
    .orderBy(asc(citations.sourceUrl));

  // A credit is listed once per universe, however many entries or images carry it: the page
  // credits people and sources, not files. Map underlays aren't here: only editors see them.
  const images = await ex
    .selectDistinct({
      universeId: universes.id,
      credit: assets.credit,
      sourceUrl: assets.sourceUrl,
      license: assets.license,
    })
    .from(entityImages)
    .innerJoin(entities, eq(entities.id, entityImages.entityId))
    .innerJoin(assets, eq(assets.id, entityImages.assetId))
    .innerJoin(universes, eq(universes.id, entities.universeId))
    .where(
      and(
        where,
        or(isNotNull(assets.credit), isNotNull(assets.sourceUrl), isNotNull(assets.license)),
      ),
    )
    .orderBy(asc(assets.credit), asc(assets.sourceUrl), asc(assets.license));

  const ids = [...new Set([...sources, ...images].map((row) => row.universeId))];
  if (ids.length === 0) return { universes: [] };
  const named = await ex
    .select({ id: universes.id, slug: universes.slug, name: universes.namePlain })
    .from(universes)
    .where(inArray(universes.id, ids))
    .orderBy(asc(universes.namePlain), asc(universes.slug));

  return {
    universes: named.map((universe): UniverseAttributions => ({
      // Slugs from the database are valid ones; the domain type only brands them.
      slug: universe.slug as UniverseAttributions['slug'],
      name: universe.name,
      sources: sources
        .filter((row) => row.universeId === universe.id)
        .map(({ universeId: _universe, retrievedAt, ...row }) => ({
          ...row,
          retrievedAt: retrievedAt.toISOString(),
        }))
        .sort(byTitle),
      images: images
        .filter((row) => row.universeId === universe.id)
        .map(({ credit, sourceUrl, license }) => ({ credit, sourceUrl, license })),
    })),
  };
}

/** By the page's title as people read it, then by address. */
function byTitle(
  a: { title: string | null; url: string },
  b: { title: string | null; url: string },
) {
  return (a.title ?? a.url).localeCompare(b.title ?? b.url) || a.url.localeCompare(b.url);
}
