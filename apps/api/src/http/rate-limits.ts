import fastifyRateLimit, { normalizeIP } from '@fastify/rate-limit';
import type { FastifyInstance, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { TooManyAttempts } from '../auth/errors.ts';
import { tokenOf } from '../services/access.ts';

/**
 * Rate limits (M8-T3, architecture.md §7): how many requests one requester may make in a time
 * window, per route tier. Past it, the API answers 429 with `Retry-After`, until the window
 * starts over. Counts are kept in memory, like the sign-in limiter's (auth/attempt-limiter.ts):
 * one API process serves the site, and a restart forgetting them is harmless.
 *
 * Routes without a tier share one budget (`default`); a route with a tier counts on its own.
 * A route declares its tier in its schema as `x-ge-rate-limit` (`rateLimit()` below), which
 * the OpenAPI document shows.
 *
 * The limits are generous for a person and for an agent working through the API; they're
 * there to stop floods and guessing. The stricter tiers guard what a script could abuse:
 * passwords, links, which usernames exist, and storage.
 */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/** Who a tier counts: the account or token behind a request (else its address), or always its address. */
type CountedBy = 'requester' | 'address';

interface RateLimitTier {
  max: number;
  windowMs: number;
  by: CountedBy;
  /** For the OpenAPI document and the docs. */
  why: string;
}

export const RATE_LIMITS = {
  default: {
    max: 600,
    windowMs: MINUTE_MS,
    by: 'requester',
    why: 'Every route without a tier, sharing one budget: ten requests a second.',
  },
  media: {
    max: 3_000,
    windowMs: MINUTE_MS,
    by: 'requester',
    why: 'Media files and the check before each (`/media-access`): a gallery is many images at once, and they don’t count against the rest.',
  },
  auth: {
    max: 10,
    windowMs: MINUTE_MS,
    by: 'address',
    why: 'Signing in and changing a password: guessing. Failed tries are limited further, per address and per username (5 in 15 minutes).',
  },
  links: {
    max: 20,
    windowMs: MINUTE_MS,
    by: 'address',
    why: 'Invite and reset links, and share links: guessing.',
  },
  members: {
    max: 60,
    windowMs: HOUR_MS,
    by: 'requester',
    why: 'Adding a member, whose answer says whether a username exists.',
  },
  uploads: {
    max: 120,
    windowMs: HOUR_MS,
    by: 'requester',
    why: 'Uploads and imports: storage and the work of reading them.',
  },
} as const satisfies Record<string, RateLimitTier>;

export type RateLimitTierName = keyof typeof RATE_LIMITS;

declare module 'fastify' {
  interface FastifySchema {
    'x-ge-rate-limit'?: Exclude<RateLimitTierName, 'default'>;
  }
}

/** For a route's schema: `{ ...rateLimit('auth') }`. Routes without one are in `default`. */
export function rateLimit(tier: Exclude<RateLimitTierName, 'default'>): {
  'x-ge-rate-limit': Exclude<RateLimitTierName, 'default'>;
} {
  return { 'x-ge-rate-limit': tier };
}

/**
 * The key a request is counted under. Behind Caddy, `request.ip` is the visitor's address
 * (GE_TRUST_PROXY). IPv6 addresses count by their /64, which is what one home or phone gets,
 * so an attacker can't dodge the limit by hopping addresses within it.
 */
function keyOf(by: CountedBy) {
  return (request: FastifyRequest): string => {
    if (by === 'requester') {
      // A token counts apart from its account's browser sessions, so a busy agent doesn't
      // lock its owner out of the site.
      const token = tokenOf(request.requester);
      if (token) return `token:${token.id}`;
      if (request.account) return `account:${request.account.id}`;
    }
    return `address:${normalizeIP(request.ip)}`;
  };
}

/**
 * Turns on the rate limits, before any route is added, and returns the limiter for the
 * not-found handler, so probing for routes counts too. Off (GE_RATE_LIMITS=off) for the e2e
 * tests and `pnpm perf`, whose parallel browsers all come from one address.
 */
export async function registerRateLimits(
  app: FastifyInstance,
): Promise<preHandlerAsyncHookHandler> {
  // Each route's tier becomes the plugin's per-route setting. This hook runs before the
  // plugin's own, which reads the setting, because it's added first.
  app.addHook('onRoute', (route) => {
    const tierName = route.schema?.['x-ge-rate-limit'];
    if (tierName === undefined) return;
    const tier: RateLimitTier = RATE_LIMITS[tierName];
    route.config = {
      ...route.config,
      rateLimit: { max: tier.max, timeWindow: tier.windowMs, keyGenerator: keyOf(tier.by) },
    };
  });
  await app.register(fastifyRateLimit, {
    global: true,
    max: RATE_LIMITS.default.max,
    timeWindow: RATE_LIMITS.default.windowMs,
    keyGenerator: keyOf(RATE_LIMITS.default.by),
    // The error handler turns it into problem+json; the plugin has set Retry-After already.
    errorResponseBuilder: (_request, context) =>
      new TooManyAttempts(Math.ceil(context.ttl / 1000), 'requests'),
  });
  return app.rateLimit();
}

/** One sentence per tier, for the OpenAPI document's description. */
export function rateLimitsText(): string {
  const per = (windowMs: number) => (windowMs === HOUR_MS ? 'an hour' : 'a minute');
  return Object.entries(RATE_LIMITS)
    .map(
      ([name, tier]) =>
        `\`${name}\`: ${String(tier.max)} ${per(tier.windowMs)} per ${tier.by === 'address' ? 'address' : 'token, account or address'}. ${tier.why}`,
    )
    .join(' ');
}
