import type { Database } from '@ge/db';
import { Attributions } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { routeAccess } from '../http/access-guard.ts';
import { problemResponses } from '../http/schemas.ts';
import { listAttributions } from '../services/attribution-service.ts';
import { linkPreview } from '../services/link-preview-service.ts';
import { linkPreviewPage } from './link-preview-page.ts';

/**
 * The public site's own pages (M8-T9): what the attributions page lists, and the pages that
 * link-preview fetchers get. Neither is about one universe: each decides per universe, the
 * attributions by the requester's lists, the previews as an anonymous visitor.
 */

/** A preview changes when its entry does; fetchers may keep it a little while. */
const PREVIEW_CACHE = 'public, max-age=300';

export const siteRoutes: FastifyPluginCallbackZod<{
  db: Database;
  /** The site's address (`GE_PUBLIC_URL`), for absolute links; else the request's own. */
  publicUrl: string | undefined;
}> = (app, { db, publicUrl }, done) => {
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
          'An HTML page of Open Graph and Twitter card tags for a site address: a universe (`/u/{slug}`), a map (`/u/{slug}/{map}`) or an object’s view (`…/view/{id}`), with `select` for a selected object. Caddy sends chat apps’ and search engines’ fetchers here (`@ge/domain/link-preview`), and people to the app. It reads as an anonymous visitor: a universe that isn’t public, or an address with nothing there, gets the site’s own card with `noindex`; drafts are never read; spoilers are left out.',
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
      const preview = await linkPreview(db, request.query, origin);
      void reply.header('cache-control', PREVIEW_CACHE);
      if (preview.noIndex) void reply.header('x-robots-tag', 'noindex');
      return reply.type('text/html; charset=utf-8').send(linkPreviewPage(preview));
    },
  );

  done();
};
