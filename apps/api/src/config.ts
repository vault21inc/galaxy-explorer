import { z } from 'zod';

/** Hosts that only this machine can reach. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/**
 * The API's environment variables (docs/plan/architecture.md §11), validated once at boot.
 * The output uses camelCase names so the rest of the code never touches `process.env`.
 */
const configSchema = z
  .object({
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    GE_AUTH_MODE: z.enum(['none', 'required']).default('none'),
    GE_HOST: z.string().min(1).default('127.0.0.1'),
    GE_PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
    GE_LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
  })
  // Without login, anyone who can reach the API can change everything, so it must stay local.
  .refine((env) => env.GE_AUTH_MODE !== 'none' || LOOPBACK_HOSTS.has(env.GE_HOST), {
    path: ['GE_HOST'],
    message: 'GE_AUTH_MODE=none only allows a loopback host (127.0.0.1, ::1 or localhost)',
  })
  .transform((env) => ({
    databaseUrl: env.DATABASE_URL,
    authMode: env.GE_AUTH_MODE,
    host: env.GE_HOST,
    port: env.GE_PORT,
    logLevel: env.GE_LOG_LEVEL,
  }));

export type Config = z.output<typeof configSchema>;

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** Parses the environment, or throws a ConfigError that lists every problem in plain words. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
