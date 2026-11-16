import { z } from 'zod';
import { Slug } from '../ids.ts';

/**
 * The attributions page (M8-T9, `/about/attributions`): where the text and images that readers
 * see came from, per universe. Only published entries count, and only in universes the
 * requester can read, as their lists show them (public ones, plus their own and those shared
 * with them).
 */

/** A page that entries' text or facts were filled from (a citation, M7-T3), once per page. */
export const AttributionSource = z.object({
  url: z.string(),
  title: z.string().nullable(),
  /** As the source states it, such as "CC-BY-SA". */
  license: z.string().nullable(),
  /** The last time it was read, of all the entries that cite it. */
  retrievedAt: z.iso.datetime({ offset: true }),
  /** How many entries cite it. */
  uses: z.number().int().min(1),
  /**
   * Every entry that cites it is a spoiler, or has a spoiler for a name: the page's title
   * would give it away, so the page hides it as it hides other spoilers.
   */
  spoiler: z.boolean(),
});
export type AttributionSource = z.infer<typeof AttributionSource>;

/**
 * A credit that uploaders gave the images readers see: once per universe, however many images
 * or entries carry it.
 */
export const AttributionImage = z.object({
  credit: z.string().nullable(),
  sourceUrl: z.string().nullable(),
  license: z.string().nullable(),
});
export type AttributionImage = z.infer<typeof AttributionImage>;

export const UniverseAttributions = z.object({
  slug: Slug,
  /** The universe's name, as plain text. */
  name: z.string(),
  sources: z.array(AttributionSource),
  images: z.array(AttributionImage),
});
export type UniverseAttributions = z.infer<typeof UniverseAttributions>;

/** Universes with nothing to credit are left out. */
export const Attributions = z.object({ universes: z.array(UniverseAttributions) });
export type Attributions = z.infer<typeof Attributions>;
