import { schema, type Executor } from '@ge/db';
import {
  mediaUrl,
  pageTitle,
  REDACTION_CHAR,
  SITE_CARD_IMAGE,
  SITE_NAME,
  toPlainText,
  type RichText,
} from '@ge/domain';
import { and, asc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { accessFactsOf, universeAccess, type Requester } from './access.ts';
import { entityVisible } from './visibility.ts';

/**
 * What a link preview shows (M8-T9, `@ge/domain/link-preview`): a title, a line of text and
 * perhaps an image, for a universe, a map or an object, written into a page of `<meta>` tags
 * (link-preview-page.ts).
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
}

/** The site's own card's line, also in the web app's `index.html` for other fetchers. */
const SITE_DESCRIPTION = 'Explore galaxies, their systems and their worlds, built by hand.';

/** A card's text is cut at about this many characters, at a word. */
const DESCRIPTION_MAX_CHARS = 200;

const PATH = /^\/u\/([a-z0-9-]+)(?:\/([a-z0-9-]+)(?:\/view\/([0-9a-f-]+))?)?\/?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Nobody in particular, with no share keys: what a chat app's fetcher is. */
const STRANGER: Requester = { kind: 'anonymous', shareKeys: new Map() };
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
  const site: LinkPreview = {
    title: SITE_NAME,
    heading: SITE_NAME,
    description: SITE_DESCRIPTION,
    url: `${origin}/`,
    image: null,
    noIndex: true,
  };
  if (page.path === '/') {
    // The home page opens the home universe for a signed-out visitor (D-51), so its card is
    // that universe's, linking to the home page itself. Not the deeper view GE_HOME_UNIVERSE
    // may name: "Earth" would be a strange card for the site. A home universe that isn't
    // public gets the site's card, as anywhere else, but the home page is still indexed.
    const home =
      homeUniverse === undefined
        ? site
        : await previewOf(ex, { path: `/u/${homeUniverse}` }, origin, undefined);
    return { ...home, url: `${origin}/`, noIndex: false };
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
  const universePage: LinkPreview = {
    title: pageTitle([universeName]),
    heading: universeName,
    description: cardText(universe.description) ?? `A universe on ${SITE_NAME}.`,
    url: `${origin}/u/${universeSlug}`,
    image: null,
    noIndex: false,
  };
  if (mapSlug === undefined) return universePage;

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
  if (!map) return universePage;
  const mapName = spoilerFree(map.name);
  const mapPath = `/u/${universeSlug}/${mapSlug}`;
  const mapPage: LinkPreview = {
    title: pageTitle([mapName, universeName]),
    heading: mapName ?? universeName,
    description: cardText(map.description) ?? universePage.description,
    url: `${origin}${mapPath}`,
    image: null,
    noIndex: false,
  };

  // The selected object, or else the one whose view this is: an id, or Postgres would refuse it.
  const subjectId = [page.select, objectId].find((id) => id !== undefined && UUID.test(id));
  if (subjectId === undefined) return mapPage;
  const [entity] = await ex
    .select({ name: entities.name, summary: entities.summary, description: entities.description })
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
  if (!entity || name === null) return mapPage;
  const query = subjectId === objectId ? '' : `?select=${subjectId}`;
  return {
    title: pageTitle([name, mapName, universeName]),
    heading: name,
    description:
      cardText(entity.summary) ??
      cardText(entity.description) ??
      `On ${mapName ? `the map ${mapName} of ` : ''}${universeName}.`,
    url: `${origin}${page.path.replace(/\/$/, '')}${query}`,
    image: await coverImage(ex, subjectId, origin),
    noIndex: false,
  };
}

/** Plain text with no spoiler in it, or null if any part is one (it's left out whole). */
function spoilerFree(text: RichText | null): string | null {
  if (!text) return null;
  const plain = toPlainText(text, { redactSpoilers: true }).trim();
  return plain === '' || plain.includes(REDACTION_CHAR) ? null : plain;
}

/**
 * A card's line of text: the plain text with each spoiler dropped (an ellipsis in its place,
 * never a bar that hints at its length), cut at a word near the limit.
 */
function cardText(text: RichText | null): string | null {
  if (!text) return null;
  const plain = toPlainText(text, { redactSpoilers: true })
    .replace(new RegExp(`\\s*${REDACTION_CHAR}+\\s*`, 'g'), ' … ')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain === '' || plain === '…') return null;
  if (plain.length <= DESCRIPTION_MAX_CHARS) return plain;
  const cut = plain.slice(0, DESCRIPTION_MAX_CHARS);
  const space = cut.lastIndexOf(' ');
  return `${(space > DESCRIPTION_MAX_CHARS / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
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
