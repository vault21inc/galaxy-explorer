import fastifyCompress from '@fastify/compress';
import fastifySensible from '@fastify/sensible';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import { createPool } from '@ge/db';
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
import { healthRoutes } from './routes/health.ts';

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

  const pool = createPool(config.databaseUrl, (error) => {
    app.log.error({ err: error }, 'idle database connection failed');
  });
  app.addHook('onClose', () => pool.end());

  await app.register(fastifySensible);
  await app.register(fastifyCompress);
  await app.register(fastifySwagger, {
    openapi: {
      openapi: '3.1.0',
      info: {
        title: 'Galaxy Explorer API',
        version: packageJson.version,
        description:
          'REST API for building and exploring galaxies. Conventions: docs/plan/architecture.md §5.',
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/api/docs' });

  app.get('/api/openapi.json', { schema: { hide: true } }, () => app.swagger());
  await app.register(healthRoutes, { pool, version: packageJson.version });

  return app;
}

export type ApiServer = Awaited<ReturnType<typeof buildServer>>;
