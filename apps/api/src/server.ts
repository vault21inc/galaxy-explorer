import fastifyCompress from '@fastify/compress';
import fastifySensible from '@fastify/sensible';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { createDatabase } from '@ge/db';
import Fastify from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import packageJson from '../package.json' with { type: 'json' };
import type { Config } from './config.ts';
import { handleError, handleNotFound } from './http/problems.ts';
import { batchRoutes } from './routes/batch.ts';
import { configRoutes } from './routes/config.ts';
import { containerRoutes } from './routes/containers.ts';
import { contentRoutes } from './routes/content-routes.ts';
import { entityRoutes } from './routes/entities.ts';
import { healthRoutes } from './routes/health.ts';
import { historyRoutes } from './routes/history.ts';
import { placementRoutes } from './routes/placement-routes.ts';
import { viewRoutes } from './routes/views.ts';
import { openApiTags } from './routes/tags.ts';

/**
 * Builds the API without listening on a port, so tests can call `app.inject()`.
 * `src/main.ts` adds the listening and signal handling.
 */
export async function buildServer(config: Config) {
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

  await app.register(fastifySensible);
  await app.register(fastifyCompress);
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
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/api/docs' });

  app.get('/api/openapi.json', { schema: { hide: true } }, () => app.swagger());
  await app.register(healthRoutes, { db, version: packageJson.version });
  await app.register(
    async (v1) => {
      await v1.register(containerRoutes, { db });
      await v1.register(entityRoutes, { db });
      await v1.register(configRoutes, { db });
      await v1.register(contentRoutes, { db });
      await v1.register(placementRoutes, { db });
      await v1.register(batchRoutes, { db });
      await v1.register(historyRoutes, { db });
      await v1.register(viewRoutes, { db });
    },
    { prefix: '/api/v1' },
  );

  return app;
}

export type ApiServer = Awaited<ReturnType<typeof buildServer>>;
