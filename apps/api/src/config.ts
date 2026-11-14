import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** The repository root: relative paths in the environment are read from here. */
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** Hosts that only this machine can reach. */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

/** A wiki "Fill from wiki" may read (M7-T3): an id, a name, and its MediaWiki API's URL. */
const WikiSourceConfig = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  label: z.string().min(1),
  apiUrl: z.url({ protocol: /^https?$/ }),
});
export type WikiSourceConfig = z.infer<typeof WikiSourceConfig>;

/** An optional setting where a blank value (`GE_PUBLIC_URL=` in a .env file) means unset. */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

/** The wikis offered unless GE_WIKI_SOURCES says otherwise. */
export const DEFAULT_WIKI_SOURCES: readonly WikiSourceConfig[] = [
  {
    id: 'warhammer40k',
    label: 'Warhammer 40k Wiki',
    apiUrl: 'https://warhammer40k.fandom.com/api.php',
  },
];

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
    /**
     * The private preview's proxy decides who may edit (http/preview-roles.ts,
     * docs/ops/preview.md). Off on your own machine.
     */
    GE_PREVIEW_ROLES: z.enum(['on', 'off']).default('off'),
    /**
     * With GE_AUTH_MODE=required (M8-T1): the key that seals two-factor secrets and setup
     * tokens (auth/crypto.ts). At least 32 characters of randomness, such as
     * `openssl rand -base64 48`. Changing it makes every account's two-factor codes unreadable.
     */
    GE_SESSION_SECRET: optional(z.string().min(32, 'Use at least 32 characters.')),
    /**
     * With GE_AUTH_MODE=required: the address the site is served from, such as
     * https://galaxy.example. Writes must come from this origin (CSRF, auth/origin-check.ts),
     * links are made with it, and the session cookie is `Secure` when it's https.
     */
    GE_PUBLIC_URL: optional(z.url({ protocol: /^https?$/ })),
    /**
     * Which proxies' `X-Forwarded-For` to believe, so the rate limits see the visitor's
     * address rather than the proxy's: Fastify's `trustProxy`, such as `loopback` or
     * `127.0.0.1,10.0.0.0/8`. Unset: none.
     */
    GE_TRUST_PROXY: optional(z.string().min(1)),
    /**
     * The rate limits on every route (M8-T3, http/rate-limits.ts). `off` only for test runs
     * whose parallel browsers all come from one address (the e2e tests, `pnpm perf`).
     */
    GE_RATE_LIMITS: z.enum(['on', 'off']).default('on'),
    /**
     * How the API introduces itself to wikis (M7-T3). Wikis ask for a name and a way to reach
     * whoever runs the client; set it to include yours.
     */
    GE_WIKI_USER_AGENT: z
      .string()
      .min(1)
      .default('GalaxyExplorer/0.1 (self-hosted; set GE_WIKI_USER_AGENT to add contact details)'),
    /**
     * The wikis "Fill from wiki" may read, as JSON: [{ "id", "label", "apiUrl" }]. Only these:
     * the API never fetches a URL a request sends it. Tests point it at a local fixture server.
     */
    GE_WIKI_SOURCES: z
      .string()
      .optional()
      .transform((text, context) => {
        if (text === undefined || text.trim() === '') return DEFAULT_WIKI_SOURCES;
        try {
          return z.array(WikiSourceConfig).min(1).parse(JSON.parse(text));
        } catch (error) {
          context.addIssue({
            code: 'custom',
            message: `Not a list of wiki sources: ${String(error)}`,
          });
          return z.NEVER;
        }
      }),
  })
  // Without login, anyone who can reach the API can change everything, so it must stay local.
  .refine((env) => env.GE_AUTH_MODE !== 'none' || LOOPBACK_HOSTS.has(env.GE_HOST), {
    path: ['GE_HOST'],
    message: 'GE_AUTH_MODE=none only allows a loopback host (127.0.0.1, ::1 or localhost)',
  })
  // Accounts need both: the secret to seal two-factor secrets, the URL for cookies and links.
  .refine(
    (env) =>
      env.GE_AUTH_MODE !== 'required' ||
      (env.GE_SESSION_SECRET !== undefined && env.GE_PUBLIC_URL !== undefined),
    {
      path: ['GE_SESSION_SECRET'],
      message: 'GE_AUTH_MODE=required needs GE_SESSION_SECRET and GE_PUBLIC_URL',
    },
  )
  .transform((env) => ({
    databaseUrl: env.DATABASE_URL,
    authMode: env.GE_AUTH_MODE,
    host: env.GE_HOST,
    port: env.GE_PORT,
    logLevel: env.GE_LOG_LEVEL,
    previewRoles: env.GE_PREVIEW_ROLES === 'on',
    sessionSecret: env.GE_SESSION_SECRET,
    /** Just the origin (scheme, host and port), which is what `Origin` headers carry. */
    publicUrl: env.GE_PUBLIC_URL === undefined ? undefined : new URL(env.GE_PUBLIC_URL).origin,
    trustProxy: env.GE_TRUST_PROXY,
    rateLimits: env.GE_RATE_LIMITS === 'on',
    wikiUserAgent: env.GE_WIKI_USER_AGENT,
    wikiSources: env.GE_WIKI_SOURCES,
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
