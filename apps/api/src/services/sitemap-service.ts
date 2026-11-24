import type { Executor } from '@ge/db';
import { strangerMaps, strangerObjects, strangerUniverses } from './site-index.ts';

/**
 * robots.txt and the sitemap (D-62), which tell search engines what to crawl. Served at the
 * site's root through Caddy (`CRAWLER_FILES` in `@ge/domain/link-preview`).
 */

/**
 * A sitemap holds at most 50,000 addresses (sitemaps.org). Far more than any map here has,
 * so past it the rest are left out rather than split into an index of sitemaps.
 */
const SITEMAP_MAX_URLS = 50_000;

/**
 * Everything may be crawled but the pages that are only for someone signed in, and the
 * invite and reset links. Not `/api/`: a search engine that runs the app (on the pages that
 * aren't previews, such as the attributions) needs the API's answers to see the page.
 */
const DISALLOWED = ['/login', '/account', '/admin', '/link/', '/u/*/settings', '/mcp'];

export function robotsTxt(origin: string): string {
  return [
    '# Galaxy Explorer. The sitemap lists every public universe, map and view.',
    'User-agent: *',
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

/**
 * Every address a stranger may see that has a page of its own: the home page, each public
 * universe, its maps, and every object on them that opens a view (a system, a planet with
 * moons). Objects without a view are linked from their view's page instead: they're
 * selections in it, `?select=`, and the sitemap is kept to the pages people land on.
 */
export async function sitemapXml(ex: Executor, origin: string): Promise<string> {
  const universes = await strangerUniverses(ex);
  const maps = await strangerMaps(
    ex,
    universes.map((universe) => universe.id),
  );
  const slugOf = new Map(universes.map((universe) => [universe.id, universe.slug]));
  const mapUrls = new Map(
    maps.map((map) => [map.id, `${origin}/u/${slugOf.get(map.universeId) ?? ''}/${map.slug}`]),
  );
  const urls = [
    `${origin}/`,
    ...universes.map((universe) => `${origin}/u/${universe.slug}`),
    ...mapUrls.values(),
  ];
  const views = await strangerObjects(
    ex,
    maps.map((map) => map.id),
    { explorableOnly: true },
    Math.max(0, SITEMAP_MAX_URLS - urls.length),
  );
  urls.push(...views.map((view) => `${mapUrls.get(view.mapId) ?? ''}/view/${view.id}`));
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`),
    '</urlset>',
    '',
  ].join('\n');
}

/** Slugs and ids need none of this, but the site's own address comes from the environment. */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
