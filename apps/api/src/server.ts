import fastifyCompress from '@fastify/compress';
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
import { guardPreviewRoles } from './http/preview-roles.ts';
import { handleError, handleNotFound, problemSchema } from './http/problems.ts';
import { assetRoutes, mediaRoutes } from './routes/assets.ts';
import { iconRoutes } from './routes/icons.ts';
import { batchRoutes } from './routes/batch.ts';
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
    logger: {
      level: config.logLevel,
      redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    },
  }).withTypeProvider<ZodTypeProvider>();

  // Zod schemas validate requests and serialize responses (D-08).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler(handleError);
  app.setNotFoundHandler(handleNotFound);

  const db = createDatabase(config.databaseUrl, {
    onIdleClientError: (error) => {
      app.log.error({ err: error }, 'idle database connection failed');
    },
  });
  app.addHook('onClose', () => db.$client.end());
  // The private preview: only the proxy's editor may write (docs/ops/preview.md).
  guardPreviewRoles(app, config.previewRoles);

  await app.register(fastifySensible);
  await app.register(fastifyCompress);
  // Image uploads (M3-T7): one file of at most 25 MB per request.
  await app.register(fastifyMultipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
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
          'Updates need the `version` you read. Conventions: docs/plan/architecture.md §5.',
      },
      tags: openApiTags(),
    },
    transform: jsonSchemaTransform,
    // Named shapes become components/schemas and are referenced, not repeated per route.
    transformObject: jsonSchemaTransformObject,
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/api/docs' });

  app.get('/api/openapi.json', { schema: { hide: true } }, () => app.swagger());
  await app.register(healthRoutes, {
    db,
    version: packageJson.version,
    authMode: config.authMode,
    previewRoles: config.previewRoles,
  });
  await app.register(
    async (v1) => {
      await v1.register(containerRoutes, { db });
      await v1.register(entityRoutes, { db });
      await v1.register(configRoutes, { db });
      await v1.register(contentRoutes, { db });
      await v1.register(placementRoutes, { db });
      await v1.register(waypointRoutes, { db });
      await v1.register(batchRoutes, { db });
      await v1.register(historyRoutes, { db });
      await v1.register(viewRoutes, { db });
      await v1.register(assetRoutes, { db, store });
      await v1.register(iconRoutes);
    },
    { prefix: '/api/v1' },
  );
  await app.register(mediaRoutes, { store });

  return app;
}

export type ApiServer = Awaited<ReturnType<typeof buildServer>>;
