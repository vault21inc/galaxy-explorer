import type { Database } from '@ge/db';
import { Attributions, isSearchEngine } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { routeAccess } from '../http/access-guard.ts';
import { problemResponses } from '../http/schemas.ts';
import { listAttributions } from '../services/attribution-service.ts';
import { linkPreview } from '../services/link-preview-service.ts';
import { robotsTxt, sitemapXml } from '../services/sitemap-service.ts';
import { linkPreviewPage } from './link-preview-page.ts';

/**
 * The public site's own pages (M8-T9): what the attributions page lists, and the pages that
 * link-preview fetchers get. Neither is about one universe: each decides per universe, the
 * attributions by the requester's lists, the previews as an anonymous visitor.
 */

/** A preview changes when its entry does; fetchers may keep it a little while. */
const PREVIEW_CACHE = 'public, max-age=300';

/** Search engines read the sitemap every day or so at most; an hour spares the database. */
const SITEMAP_CACHE = 'public, max-age=3600';

export const siteRoutes: FastifyPluginCallbackZod<{
  db: Database;
  /** The site's address (`GE_PUBLIC_URL`), for absolute links; else the request's own. */
  publicUrl: string | undefined;
  /** The home universe's slug (D-51), whose card the home page's preview shows. */
  homeUniverse: string | undefined;
}> = (app, { db, publicUrl, homeUniverse }, done) => {
  app.get(
    '/attributions',
    {
      schema: {
        tags: ['site'],
        summary: 'Where readers’ text and images came from',
        description:
          'For the attributions page: per universe the requester can read (as their lists show them), the pages that published entries’ text or facts were filled from (M7-T3), once per page, and the credits of the images those entries show. Drafts are never counted. A source whose every entry is a spoiler, or has a spoiler for a name, says `spoiler`, for the page to hide its title as it hides other spoilers.',
        operationId: 'site.attributions',
        ...routeAccess({ scope: 'open' }),
        response: { 200: z.object({ data: Attributions }), ...problemResponses },
      },
    },
    async (request) => ({ data: await listAttributions(db, request.requester) }),
  );

  app.get(
    '/link-preview',
    {
      schema: {
        tags: ['site'],
        summary: 'The page a link-preview fetcher gets',
        description:
          'An HTML page of Open Graph and Twitter card tags for a site address: the home page (`/`, the home universe’s card), a universe (`/u/{slug}`), a map (`/u/{slug}/{map}`) or an object’s view (`…/view/{id}`), with `select` for a selected object. Caddy sends chat apps’ and search engines’ fetchers here (`@ge/domain/link-preview`), and people to the app. It reads as an anonymous visitor: a universe that isn’t public, or an address with nothing there, gets the site’s own card with `noindex`; drafts are never read; spoilers are left out. A card with no picture of its own gets the site’s. Search engines read the same page (D-62): its body has the whole text, a breadcrumb, links to the pages below (the universes, a universe’s maps, a map’s or view’s objects) and JSON-LD; and for an address with nothing a stranger may see, they get it with a 404, where a chat app gets the site’s card with a 200.',
        operationId: 'site.linkPreview',
        ...routeAccess({ scope: 'open' }),
        querystring: z.object({
          path: z.string().max(300).describe('The address’s path, such as /u/eisenhorn/main.'),
          select: z.string().max(100).optional().describe('The selected object’s id, if any.'),
        }),
        // A page, not JSON: no response schema, so Fastify sends the text as it is.
        produces: ['text/html'],
      },
    },
    async (request, reply) => {
      const origin = publicUrl ?? `${request.protocol}://${request.host}`;
      const preview = await linkPreview(db, request.query, origin, homeUniverse);
      void reply.header('cache-control', PREVIEW_CACHE);
      if (preview.noIndex) void reply.header('x-robots-tag', 'noindex');
      // A search engine should drop an address with nothing there, not keep it as a "soft
      // 404". A chat app gets the card with a 200, or it would show no card at all (D-62). A
      // hidden universe's answer is the same as a missing one's, so the 404 says nothing.
      const missing = !preview.found && isSearchEngine(request.headers['user-agent']);
      return reply
        .code(missing ? 404 : 200)
        .type('text/html; charset=utf-8')
        .send(linkPreviewPage(preview));
    },
  );

  app.get(
    '/robots.txt',
    {
      schema: {
        tags: ['site'],
        summary: 'The site’s robots.txt',
        description:
          'What search engines may crawl (D-62), served at `/robots.txt` through Caddy: everything but the pages for someone signed in and the invite and reset links, with the sitemap’s address.',
        operationId: 'site.robots',
        ...routeAccess({ scope: 'open' }),
        produces: ['text/plain'],
      },
    },
    async (request, reply) => {
      const origin = publicUrl ?? `${request.protocol}://${request.host}`;
      void reply.header('cache-control', SITEMAP_CACHE);
      return reply.type('text/plain; charset=utf-8').send(robotsTxt(origin));
    },
  );

  app.get(
    '/sitemap.xml',
    {
      schema: {
        tags: ['site'],
        summary: 'The site’s sitemap',
        description:
          'Every address a stranger may see with a page of its own (D-62), served at `/sitemap.xml` through Caddy: the home page, each public universe, its published maps that aren’t spoilers, and every object on them that opens a view, as an anonymous visitor sees them (no drafts, no spoilers).',
        operationId: 'site.sitemap',
        ...routeAccess({ scope: 'open' }),
        produces: ['application/xml'],
      },
    },
    async (request, reply) => {
      const origin = publicUrl ?? `${request.protocol}://${request.host}`;
      void reply.header('cache-control', SITEMAP_CACHE);
      return reply.type('application/xml; charset=utf-8').send(await sitemapXml(db, origin));
    },
  );

  done();
};
