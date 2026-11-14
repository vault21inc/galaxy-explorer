import type { Database } from '@ge/db';
import { SearchResult } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { envelope, problemResponses, readQuery } from '../http/schemas.ts';
import { searchUniverse } from '../services/search-service.ts';
import { visibleTo } from '../services/visibility.ts';

/** Search (M7-T6): the command palette's results, and a way in for API clients. */
export const searchRoutes: FastifyPluginCallbackZod<{ db: Database }> = (app, { db }, done) => {
  app.get(
    '/universes/:universeId/search',
    {
      schema: {
        tags: ['search'],
        summary: 'Search a universe',
        description:
          'Full-text search over the universe’s entries: names, summaries, descriptions, text facts and relation roles. Each word of `q` matches words that start with it, ignoring case and accents ("gud" finds Gudrun). ' +
          'Results are ranked (names that start with the first word first) and carry the kind, the map, a path (the map, then the objects the entry is inside) and a snippet. ' +
          'With `spoilers=exclude`, only text that isn’t a potential spoiler is searched, and hidden names are blacked out.',
        operationId: 'universes.search',
        params: z.object({ universeId: z.uuid() }),
        querystring: readQuery.extend({
          q: z.string().trim().min(1).max(200).describe('The words to look for.'),
          limit: z.coerce.number().int().min(1).max(50).default(20).describe('Results (1–50).'),
        }),
        response: { 200: envelope(z.array(SearchResult)), ...problemResponses },
      },
    },
    async (request) => {
      const { q, spoilers, includeDrafts, limit } = request.query;
      const data = await searchUniverse(db, request.params.universeId, {
        q,
        spoilers,
        limit,
        viewer: visibleTo(request.actor, { includeDrafts }),
      });
      return { data };
    },
  );
  done();
};
