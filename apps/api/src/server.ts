import { readFile } from 'node:fs/promises';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifySensible from '@fastify/sensible';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { createDatabase } from '@ge/db';
import Fastify from 'fastify';
import { MAX_UPLOAD_BYTES, openApiComponents } from '@ge/domain';
import { z } from 'zod';
import {
  jsonSchemaTransform,
  jsonSchemaTransformObject,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import packageJson from '../package.json' with { type: 'json' };
import type { Config } from './config.ts';
import { createAuthContext } from './auth/context.ts';
import { registerRequester } from './auth/requester.ts';
import { registerAccessGuard } from './http/access-guard.ts';
import { registerRateLimits, rateLimitsText } from './http/rate-limits.ts';
import { registerSecurityHeaders, swaggerUiCsp } from './http/security-headers.ts';
import { guardPreviewRoles } from './http/preview-roles.ts';
import { handleError, handleNotFound, problemSchema } from './http/problems.ts';
import { assetRoutes, mediaAccessRoutes, mediaRoutes } from './routes/assets.ts';
import { sharingRoutes } from './routes/sharing.ts';
import { accountRoutes } from './routes/account.ts';
import { twoFactorRoutes } from './routes/two-factor.ts';
import { adminRoutes } from './routes/admin.ts';
import { authRoutes } from './routes/auth.ts';
import { tokenRoutes } from './routes/tokens.ts';
import { iconRoutes } from './routes/icons.ts';
import { wikiRoutes } from './routes/wiki.ts';
import { batchRoutes } from './routes/batch.ts';
import { exchangeRoutes } from './routes/exchange.ts';
import { searchRoutes } from './routes/search.ts';
import { practiceRoutes } from './routes/practice.ts';
import { siteRoutes } from './routes/site.ts';
import { configRoutes } from './routes/config.ts';
import { containerRoutes } from './routes/containers.ts';
import { contentRoutes } from './routes/content-routes.ts';
import { entityRoutes } from './routes/entities.ts';
import { healthRoutes } from './routes/health.ts';
import { historyRoutes } from './routes/history.ts';
import { placementRoutes } from './routes/placement-routes.ts';
import { waypointRoutes } from './routes/waypoint-routes.ts';
import { viewRoutes } from './routes/views.ts';
import { openApiTags } from './routes/tags.ts';
import { LocalBlobStore } from './storage/blob-store.ts';

/** The guide for LLM agents (M7-T8), served at /api/llm-guide.md. */
const LLM_GUIDE = new URL('../../../docs/api/llm-guide.md', import.meta.url);

/**
 * Builds the API without listening on a port, so tests can call `app.inject()`.
 * `src/main.ts` adds the listening and signal handling.
 */
/** Names the shared shapes in Zod's registry, which the OpenAPI document turns into components. */
function registerComponents(): void {
  for (const [id, schema] of Object.entries({ ...openApiComponents(), Problem: problemSchema })) {
    if (!z.globalRegistry.has(schema)) z.globalRegistry.add(schema, { id });
  }
}

export async function buildServer(config: Config) {
  registerComponents();
  const app = Fastify({
    // Behind a proxy (Caddy), the visitor's address is in X-Forwarded-For, for the rate limits.
    trustProxy: config.trustProxy ?? false,
    logger: {
      level: config.logLevel,
      // The password a destructive action may be confirmed with (D-47) included.
      redact: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-ge-password"]',
        'res.headers["set-cookie"]',
      ],
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod schemas validate requests and serialize responses (D-08).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(handleError);
  // Security headers on everything the API sends (M8-T3), as a fallback for Caddy's.
  registerSecurityHeaders(app);
  // Rate limits (M8-T3), before any route is added so that each one gets its tier; asking for
  // routes that don't exist counts too.
  const limitNotFound = config.rateLimits ? await registerRateLimits(app) : null;
  app.setNotFoundHandler(limitNotFound ? { preHandler: limitNotFound } : {}, handleNotFound);

  const db = createDatabase(config.databaseUrl, {
    onIdleClientError: (error) => {
      app.log.error({ err: error }, 'idle database connection failed');
    },
  });
  app.addHook('onClose', () => db.$client.end());
  // Accounts (M8-T1): only with GE_AUTH_MODE=required, where config validation guarantees both.
  const auth =
    config.authMode === 'required' && config.sessionSecret && config.publicUrl
      ? createAuthContext(db, { sessionSecret: config.sessionSecret, publicUrl: config.publicUrl })
      : null;
  // Cookies first: the requester hook reads the session cookie.
  await app.register(fastifyCookie);
  registerRequester(app, { auth, previewRoles: config.previewRoles });
  // The private preview: only the proxy's editor may write (docs/ops/preview.md).
  guardPreviewRoles(app, config.previewRoles);
  // Who may do what in each universe (M8-T11), before any route's validation or handler.
  registerAccessGuard(app, db);

  await app.register(fastifySensible);
  await app.register(fastifyCompress);
  // Image uploads (M3-T7) and imports: one file per request, of at most 25 MB unless the route
  // allows more (imports, M7-T4). Nothing else is read, so other fields are kept few and short:
  // they would be held in memory (M8-T3).
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
      fields: 4,
      fieldSize: 1_024,
      parts: 5,
      headerPairs: 100,
    },
  });
  const store = new LocalBlobStore(config.mediaDir);
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Galaxy Explorer API',
        version: packageJson.version,
        description:
          'REST API for building and exploring galaxies. Bodies are JSON in camelCase, wrapped as `{ "data": … }`; lists add `nextCursor`. ' +
          'Errors are RFC 9457 problem+json. Every write is one change batch (X-GE-Batch-Id in the response), which can be reverted. ' +
          'Updates need the `version` you read. Conventions: docs/plan/architecture.md §5. ' +
          `Rate limits (429 with Retry-After): ${rateLimitsText()} A route's tier is its \`x-ge-rate-limit\`. ` +
          'LLM agents: read [the guide](/api/llm-guide.md) first; the MCP server (apps/mcp) offers these routes as tools.',
      },
      tags: openApiTags(),
    },
    transform: jsonSchemaTransform,
    // Named shapes become components/schemas and are referenced, not repeated per route.
    transformObject: jsonSchemaTransformObject,
  });
  // The docs page runs scripts, so it sends its own Content-Security-Policy (M8-T3).
  await app.register(fastifySwaggerUi, {
    routePrefix: '/api/docs',
    staticCSP: true,
    transformStaticCSP: swaggerUiCsp,
  });

  app.get('/api/openapi.json', { schema: { hide: true } }, () => app.swagger());
  // The guide for LLM agents (M7-T8), from docs/api, linked from the docs and /llms.txt.
  app.get('/api/llm-guide.md', { schema: { hide: true } }, async (_request, reply) =>
    reply.type('text/markdown; charset=utf-8').send(await readFile(LLM_GUIDE, 'utf8')),
  );
  await app.register(healthRoutes, {
    db,
    version: packageJson.version,
    authMode: config.authMode,
    home: config.home,
  });
  await app.register(
    async (v1) => {
      await v1.register(authRoutes, { auth });
      await v1.register(accountRoutes, { db, auth });
      await v1.register(twoFactorRoutes, { db, auth });
      await v1.register(tokenRoutes, { db, auth });
      await v1.register(adminRoutes, { db, auth });
      await v1.register(containerRoutes, { db, auth });
      await v1.register(sharingRoutes, { db, auth });
      await v1.register(entityRoutes, { db });
      await v1.register(configRoutes, { db });
      await v1.register(contentRoutes, { db });
      await v1.register(placementRoutes, { db });
      await v1.register(waypointRoutes, { db });
      await v1.register(batchRoutes, { db });
      await v1.register(historyRoutes, { db });
      await v1.register(viewRoutes, { db });
      await v1.register(assetRoutes, { db, store });
      await v1.register(mediaAccessRoutes, { db });
      await v1.register(exchangeRoutes, { db, store, version: packageJson.version });
      await v1.register(iconRoutes);
      await v1.register(siteRoutes, { db, publicUrl: config.publicUrl });
      await v1.register(practiceRoutes, { db });
      await v1.register(searchRoutes, { db });
      await v1.register(wikiRoutes, {
        sources: config.wikiSources,
        userAgent: config.wikiUserAgent,
      });
    },
    { prefix: '/api/v1' },
  );
  await app.register(mediaRoutes, { db, store });

  return app;
}

export type ApiServer = Awaited<ReturnType<typeof buildServer>>;
