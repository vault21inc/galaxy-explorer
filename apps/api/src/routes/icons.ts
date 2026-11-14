import { ICON_SETS, IconSummary, IconSvg } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { problemResponses } from '../http/schemas.ts';
import { iconDrawings, searchIcons } from '../services/icon-catalog.ts';
import { routeAccess } from '../http/access-guard.ts';

const ICONS_DOC =
  "The bundled icon sets for event categories and pins (M6-T4): Lucide (ISC) and game-icons.net (CC BY 3.0, credited on the site). An icon key is `set:name`, such as `game-icons:crossed-swords`; a key without a set is Lucide's.";

/** At most this many icons per request. */
const MAX_KEYS = 100;
/** The sets are part of the build: their drawings never change for a deployed version. */
const CACHE = 'public, max-age=86400';

/** Searching the icon sets, and fetching the drawings of chosen icons (M6-T4, D-32). */
export const iconRoutes: FastifyPluginCallbackZod = (app, _options, done) => {
  app.get(
    '/icons/search',
    {
      schema: {
        tags: ['icons'],
        summary: 'Search the icon sets',
        description: `${ICONS_DOC} Every word of \`q\` must appear in the name; exact and leading matches come first.`,
        operationId: 'icons.search',
        ...routeAccess({ scope: 'open' }),
        querystring: z.object({
          q: z.string().max(100).default(''),
          set: z.enum(ICON_SETS).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(60),
        }),
        response: { 200: z.object({ data: z.array(IconSummary) }), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { q, set, limit } = request.query;
      void reply.header('cache-control', CACHE);
      return { data: searchIcons(q, { ...(set ? { sets: [set] } : {}), limit }) };
    },
  );

  app.get(
    '/icons',
    {
      schema: {
        tags: ['icons'],
        summary: "Get icons' drawings",
        description: `${ICONS_DOC} \`keys\` is a comma-separated list of up to ${MAX_KEYS.toString()} keys; unknown keys are left out of the answer.`,
        operationId: 'icons.get',
        ...routeAccess({ scope: 'open' }),
        querystring: z.object({
          keys: z
            .string()
            .min(1)
            .transform((value) => value.split(',').filter(Boolean))
            .pipe(z.array(z.string().max(100)).min(1).max(MAX_KEYS)),
        }),
        response: { 200: z.object({ data: z.array(IconSvg) }), ...problemResponses },
      },
    },
    async (request, reply) => {
      void reply.header('cache-control', CACHE);
      return { data: iconDrawings(request.query.keys) };
    },
  );

  done();
};
