import { WikiPreview, WikiSearchHit, WikiSourceInfo } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { WikiSourceConfig } from '../config.ts';
import { problemResponses } from '../http/schemas.ts';
import { NotFound } from '../services/errors.ts';
import { MediaWikiSource } from '../wiki/media-wiki.ts';
import { leadMarkdown, wikiTemplates } from '../wiki/wikitext.ts';
import { routeAccess } from '../http/access-guard.ts';

const WIKI_DOC =
  'For "Fill from wiki" (M7-T3): the wikis this installation is configured to read (GE_WIKI_SOURCES), searched and previewed through their MediaWiki API, one request a second per wiki, with answers kept for a day. Nothing here writes: the dialog applies what the owner picks as one batch, with citations.';

const sourceQuery = z.object({ source: z.string().min(1).max(50) });

/** Searching a configured wiki and previewing one of its pages (M7-T3). */
export const wikiRoutes: FastifyPluginCallbackZod<{
  sources: readonly WikiSourceConfig[];
  userAgent: string;
}> = (app, { sources, userAgent }, done) => {
  const clients = new Map(
    sources.map((source) => [
      source.id,
      { info: source, client: new MediaWikiSource(source.apiUrl, { userAgent }) },
    ]),
  );
  /** Only configured wikis: an unknown id is a 404, never a URL to fetch. */
  const sourceOf = (id: string) => {
    const source = clients.get(id);
    if (!source) throw new NotFound('wiki source', id);
    return source;
  };

  app.get(
    '/wiki/sources',
    {
      schema: {
        tags: ['wiki'],
        summary: 'The wikis this installation can fill from',
        description: WIKI_DOC,
        operationId: 'wiki.sources',
        ...routeAccess({ scope: 'editor' }),
        response: { 200: z.object({ data: z.array(WikiSourceInfo) }), ...problemResponses },
      },
    },
    () => ({
      data: [...clients.values()].map(({ info, client }) => ({
        id: info.id,
        label: info.label,
        siteUrl: client.siteUrl,
      })),
    }),
  );

  app.get(
    '/wiki/search',
    {
      schema: {
        tags: ['wiki'],
        summary: 'Search a wiki',
        description: `${WIKI_DOC} Returns up to 10 pages, best first, each with a plain-text snippet.`,
        operationId: 'wiki.search',
        ...routeAccess({ scope: 'editor' }),
        querystring: sourceQuery.extend({ q: z.string().trim().min(1).max(200) }),
        response: { 200: z.object({ data: z.array(WikiSearchHit) }), ...problemResponses },
      },
    },
    async (request) => {
      const { source, q } = request.query;
      return { data: await sourceOf(source).client.search(q) };
    },
  );

  app.get(
    '/wiki/preview',
    {
      schema: {
        tags: ['wiki'],
        summary: 'Read a wiki page for filling',
        description: `${WIKI_DOC} Follows redirects. Returns the page's templates with named parameters (the first is usually its info box) as plain text, its lead section as Markdown with links as text, its address, and the wiki's text licence. Images are never offered: wiki artwork usually isn't covered by the text licence.`,
        operationId: 'wiki.preview',
        ...routeAccess({ scope: 'editor' }),
        querystring: sourceQuery.extend({ title: z.string().trim().min(1).max(300) }),
        response: { 200: z.object({ data: WikiPreview }), ...problemResponses },
      },
    },
    async (request) => {
      const { source, title } = request.query;
      const { client } = sourceOf(source);
      const [page, site] = await Promise.all([client.page(title), client.site()]);
      return {
        data: {
          source,
          title: page.title,
          redirectedFrom: page.redirectedFrom,
          url: site.pageUrl(page.title),
          license: site.license,
          licenseUrl: site.licenseUrl,
          retrievedAt: new Date().toISOString(),
          templates: wikiTemplates(page.wikitext),
          lead: leadMarkdown(page.wikitext),
        },
      };
    },
  );

  done();
};
