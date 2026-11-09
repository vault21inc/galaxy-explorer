import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The repository root: relative paths in the environment are read from here. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

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
    /** Where uploaded images are stored (architecture.md §8). */
    GE_MEDIA_DIR: z.string().min(1).default('./.data/media'),
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
    mediaDir: isAbsolute(env.GE_MEDIA_DIR)
      ? env.GE_MEDIA_DIR
      : resolve(REPO_ROOT, env.GE_MEDIA_DIR),
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
