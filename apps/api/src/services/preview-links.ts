import type { Executor } from '@ge/db';
import { cardText } from './card-text.ts';
import { strangerMaps, strangerObjects, strangerUniverses } from './site-index.ts';

/**
 * The links on a crawler's page (D-62) to the pages below it, so a search engine that reads
 * the home page finds every public universe, map and system from there: the site lists the
 * universes, a universe its maps, a map the objects in its galaxy view, and a view what's in
 * it. Each with its card's line of text, which is also what a reader skimming them sees.
 */
export interface PreviewLink {
  name: string;
  /** Absolute. */
  url: string;
  text: string | null;
}

export interface PreviewLinks {
  heading: string;
  items: PreviewLink[];
}

/** At most this many links on one page: a 5,000-object map's galaxy view lists its first. */
const LINKS_MAX = 500;

export type Below =
  | { kind: 'site' }
  | { kind: 'universe'; id: string; slug: string }
  | {
      kind: 'objects';
      mapId: string;
      /** The map's address, absolute, under which each object's view is. */
      mapUrl: string;
      /** Null for the objects in the galaxy view. */
      parentId: string | null;
      /** The view's address, where an object without a view of its own is selected. */
      viewUrl?: string;
    };

/** The links below a page, or null if there are none. */
export async function linksBelow(
  ex: Executor,
  origin: string,
  below: Below,
): Promise<PreviewLinks | null> {
  const links = await listed(ex, origin, below);
  return links.items.length > 0 ? links : null;
}

async function listed(ex: Executor, origin: string, below: Below): Promise<PreviewLinks> {
  switch (below.kind) {
    case 'site': {
      const universes = await strangerUniverses(ex);
      return {
        heading: 'Universes',
        items: universes.slice(0, LINKS_MAX).map((universe) => ({
          name: universe.name,
          url: `${origin}/u/${universe.slug}`,
          text: cardText(universe.description),
        })),
      };
    }
    case 'universe': {
      const maps = await strangerMaps(ex, [below.id]);
      return {
        heading: 'Maps',
        items: maps.slice(0, LINKS_MAX).map((map) => ({
          name: map.name,
          url: `${origin}/u/${below.slug}/${map.slug}`,
          text: cardText(map.description),
        })),
      };
    }
    case 'objects': {
      const objects = await strangerObjects(
        ex,
        [below.mapId],
        { parentId: below.parentId },
        LINKS_MAX,
      );
      return {
        heading: below.parentId === null ? 'On this map' : 'In this view',
        items: objects.map((object) => ({
          name: object.name,
          // A system opens its own view; a world in it is selected there.
          url: object.explorable
            ? `${below.mapUrl}/view/${object.id}`
            : `${below.viewUrl ?? below.mapUrl}?select=${object.id}`,
          text: cardText(object.summary),
        })),
      };
    }
  }
}
