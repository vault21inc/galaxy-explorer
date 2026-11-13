import { z } from 'zod';

/**
 * What "Fill from wiki" reads (M7-T3): the wikis the installation may fetch from, search hits,
 * and one page's preview. The API builds these from a MediaWiki API; the dialog maps them onto
 * an entity's fields (mapping.ts).
 */

/** A wiki the API may fetch from. Only configured ones: the API never fetches a URL it's sent. */
export const WikiSourceInfo = z.object({
  id: z.string(),
  label: z.string(),
  /** The wiki's home, such as https://warhammer40k.fandom.com, for links to its pages. */
  siteUrl: z.string(),
});
export type WikiSourceInfo = z.infer<typeof WikiSourceInfo>;

export const WikiSearchHit = z.object({
  title: z.string(),
  /** A plain-text excerpt around the match. */
  snippet: z.string(),
});
export type WikiSearchHit = z.infer<typeof WikiSearchHit>;

/** A template on the page with named parameters, such as its info box, in page order. */
export const WikiTemplate = z.object({
  name: z.string(),
  params: z.array(z.object({ name: z.string(), text: z.string() })),
});
export type WikiTemplate = z.infer<typeof WikiTemplate>;

export const WikiPreview = z.object({
  source: z.string(),
  /** The page's title after redirects, and the title asked for if it redirected. */
  title: z.string(),
  redirectedFrom: z.string().nullable(),
  url: z.string(),
  /** The wiki's text licence, as it states it ("CC-BY-SA"), and where it's explained. */
  license: z.string().nullable(),
  licenseUrl: z.string().nullable(),
  retrievedAt: z.string(),
  /** Templates with named parameters; the first is usually the info box. */
  templates: z.array(WikiTemplate),
  /** The lead section, before the first heading, as Markdown with links as plain text. */
  lead: z.string(),
});
export type WikiPreview = z.infer<typeof WikiPreview>;
