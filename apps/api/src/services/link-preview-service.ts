import { schema, type Executor } from '@ge/db';
import { mediaUrl, pageTitle, SITE_CARD_IMAGE, SITE_NAME } from '@ge/domain';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { accessFactsOf, universeAccess } from './access.ts';
import { bodyText, cardText, spoilerFree } from './card-text.ts';
import { linksBelow, type PreviewLinks } from './preview-links.ts';
import { STRANGER } from './site-index.ts';
import { entityVisible } from './visibility.ts';

/**
 * What a link preview shows (M8-T9, `@ge/domain/link-preview`): a title, a line of text and
 * perhaps an image, for a universe, a map or an object, written into a page of `<meta>` tags
 * (link-preview-page.ts). For search engines, which read the same page (D-62), it also has
 * the whole text, a breadcrumb and links to the pages below, so they can find those.
 *
 * It reads as an anonymous visitor, whoever asks, because a preview is pasted where anyone
 * may see it. So a private or link-only universe gets the site's own card and `noindex`, the
 * same as an address with nothing there (it never says something private is there); drafts
 * are never read; and spoilers are left out, never shown as bars.
 */
export interface LinkPreview {
  /** The page title: "Gudrun · M41 · Eisenhorn · Galaxy Explorer". */
  title: string;
  /** The card's own title: the most particular part, "Gudrun". */
  heading: string;
  description: string;
  /** The address the card links to, absolute. */
  url: string;
  image: { url: string; width: number; height: number; alt: string | null } | null;
  /** For an address that isn't a public universe's: search engines shouldn't keep it. */
  noIndex: boolean;
  /** All of its text, a paragraph each: what a search engine indexes. */
  body: string[];
  /** The pages above it, from the site down, each absolute: empty for the home page. */
  crumbs: { name: string; url: string }[];
  /** The pages below it, if any: the universes, a universe's maps, a map's or view's objects. */
  links: PreviewLinks | null;
  /**
   * Whether the address names something a stranger may see. If not, the card is the nearest
   * one above it that they may, and a search engine gets a 404 (D-62).
   */
  found: boolean;
}

/** The site's own card's line, also in the web app's `index.html` for other fetchers. */
const SITE_DESCRIPTION = 'Explore galaxies, their systems and their worlds, built by hand.';

const PATH = /^\/u\/([a-z0-9-]+)(?:\/([a-z0-9-]+)(?:\/view\/([0-9a-f-]+))?)?\/?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const { entities, entityImages, assets, maps, universes } = schema;

/**
 * The preview for `page`, with the site's own picture when it has none of its own: a card
 * with no picture is a bare line of text on Facebook and LinkedIn, easy to scroll past.
 */
export async function linkPreview(
  ex: Executor,
  page: { path: string; select?: string | undefined },
  origin: string,
  /** The home universe's slug (D-51, `GE_HOME_UNIVERSE`), whose card the home page shows. */
  homeUniverse?: string,
): Promise<LinkPreview> {
  const preview = await previewOf(ex, page, origin, homeUniverse);
  return preview.image
    ? preview
    : {
        ...preview,
        image: {
          url: `${origin}${SITE_CARD_IMAGE.path}`,
          width: SITE_CARD_IMAGE.width,
          height: SITE_CARD_IMAGE.height,
          alt: SITE_CARD_IMAGE.alt,
        },
      };
}

async function previewOf(
  ex: Executor,
  page: { path: string; select?: string | undefined },
  origin: string,
  homeUniverse: string | undefined,
): Promise<LinkPreview> {
  const home = { name: SITE_NAME, url: `${origin}/` };
  const site: LinkPreview = {
    title: SITE_NAME,
    heading: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: home.url,
    image: null,
    noIndex: true,
    body: [SITE_DESCRIPTION],
    crumbs: [],
    links: null,
    found: false,
  };
  if (page.path === '/') {
    // The home page opens the home universe for a signed-out visitor (D-51), so its card is
    // that universe's, linking to the home page itself. Not the deeper view GE_HOME_UNIVERSE
    // may name: "Earth" would be a strange card for the site. A home universe that isn't
    // public gets the site's card, as anywhere else, but the home page is still indexed. It
    // links to every public universe, so a search engine can find them from here.
    const card =
      homeUniverse === undefined
        ? site
        : await previewOf(ex, { path: `/u/${homeUniverse}` }, origin, undefined);
    return {
      ...card,
      url: home.url,
      noIndex: false,
      crumbs: [],
      links: await linksBelow(ex, origin, { kind: 'site' }),
      found: true,
    };
  }
  const [, universeSlug, mapSlug, objectId] = PATH.exec(page.path) ?? [];
  if (universeSlug === undefined) return site;

  const [universe] = await ex
    .select({ id: universes.id, name: universes.name, description: universes.description })
    .from(universes)
    .where(eq(universes.slug, universeSlug));
  if (!universe) return site;
  const facts = (await accessFactsOf(ex, STRANGER, [universe.id])).get(universe.id);
  if (!facts || universeAccess(STRANGER, facts) === 'none') return site;

  const universeName = spoilerFree(universe.name) ?? SITE_NAME;
  const universeUrl = `${origin}/u/${universeSlug}`;
  const universePage: LinkPreview = {
    title: pageTitle([universeName]),
    heading: universeName,
    description: cardText(universe.description) ?? `A universe on ${SITE_NAME}.`,
    url: universeUrl,
    image: null,
    noIndex: false,
    body: bodyText([universe.description]),
    crumbs: [home],
    links: null,
    found: true,
  };
  const withMaps = async (): Promise<LinkPreview> => ({
    ...universePage,
    links: await linksBelow(ex, origin, { kind: 'universe', id: universe.id, slug: universeSlug }),
  });
  if (mapSlug === undefined) return withMaps();

  const [map] = await ex
    .select({ id: maps.id, name: maps.name, description: maps.description })
    .from(maps)
    .where(
      and(
        eq(maps.universeId, universe.id),
        eq(maps.slug, mapSlug),
        eq(maps.status, 'published'),
        eq(maps.isSpoiler, false),
      ),
    );
  if (!map) return { ...(await withMaps()), found: false };
  const mapName = spoilerFree(map.name);
  const mapPath = `/u/${universeSlug}/${mapSlug}`;
  const mapBody = bodyText([map.description]);
  const mapPage: LinkPreview = {
    title: pageTitle([mapName, universeName]),
    heading: mapName ?? universeName,
    description: cardText(map.description) ?? universePage.description,
    url: `${origin}${mapPath}`,
    image: null,
    noIndex: false,
    body: mapBody.length > 0 ? mapBody : universePage.body,
    crumbs: [home, { name: universeName, url: universeUrl }],
    links: null,
    found: true,
  };
  const mapLinks = { kind: 'objects', mapId: map.id, mapUrl: mapPage.url } as const;
  const withObjects = async (found = true): Promise<LinkPreview> => ({
    ...mapPage,
    links: await linksBelow(ex, origin, { ...mapLinks, parentId: null }),
    found,
  });

  // The selected object, or else the one whose view this is: an id, or Postgres would refuse it.
  const given = [page.select, objectId].filter((id) => id !== undefined);
  const subjectId = given.find((id) => UUID.test(id));
  if (given.length === 0) return withObjects();
  if (subjectId === undefined || (objectId !== undefined && !UUID.test(objectId))) {
    return withObjects(false);
  }
  const [entity] = await ex
    .select({
      name: entities.name,
      summary: entities.summary,
      description: entities.description,
    })
    .from(entities)
    .where(
      and(
        eq(entities.id, subjectId),
        eq(entities.universeId, universe.id),
        // On this map, or shared by all of the universe's maps (characters).
        or(eq(entities.mapId, map.id), isNull(entities.mapId)),
        entityVisible({ includeDrafts: false }),
        eq(entities.isSpoiler, false),
      ),
    );
  const name = entity ? spoilerFree(entity.name) : null;
  // A draft, a spoiler or nothing at all: the map's card, which says nothing about it.
  if (!entity || name === null) return withObjects(false);
  const isView = subjectId === objectId;
  const query = isView ? '' : `?select=${subjectId}`;
  const url = `${origin}${page.path.replace(/\/$/, '')}${query}`;
  const fallback = `On ${mapName ? `the map ${mapName} of ` : ''}${universeName}.`;
  const body = bodyText([entity.summary, entity.description]);
  return {
    title: pageTitle([name, mapName, universeName]),
    heading: name,
    description: cardText(entity.summary) ?? cardText(entity.description) ?? fallback,
    url,
    image: await coverImage(ex, subjectId, origin),
    noIndex: false,
    body: body.length > 0 ? body : [fallback],
    crumbs: [...mapPage.crumbs, { name: mapPage.heading, url: mapPage.url }],
    // A view lists what's in it: a system's planets, a planet's moons.
    links: isView
      ? await linksBelow(ex, origin, { ...mapLinks, parentId: subjectId, viewUrl: url })
      : null,
    found: true,
  };
}

/** The entry's cover, or else its first gallery image, unless it's a spoiler. */
async function coverImage(ex: Executor, entityId: string, origin: string) {
  const [row] = await ex
    .select({ variants: assets.variants, altText: assets.altText })
    .from(entityImages)
    .innerJoin(assets, eq(assets.id, entityImages.assetId))
    .where(
      and(
        eq(entityImages.entityId, entityId),
        eq(entityImages.isSpoiler, false),
        inArray(entityImages.role, ['cover', 'gallery']),
      ),
    )
    .orderBy(sql`${entityImages.role} = 'cover' desc`, asc(entityImages.sortKey))
    .limit(1);
  if (!row) return null;
  const display = row.variants.display;
  return {
    url: `${origin}${mediaUrl(display.key)}`,
    width: display.width,
    height: display.height,
    alt: row.altText,
  };
}
