import { withTestDb } from '@ge/db/testing';
import type { OpenAPIV3_1 } from 'openapi-types';
import { describe, expect, it } from 'vitest';
import { createToken } from '../src/auth/tokens.ts';
import { RATE_LIMITS } from '../src/http/rate-limits.ts';
import { buildServer, type ApiServer } from '../src/server.ts';
import { authConfig, codeFor, makeAccount, ORIGIN, sessionOf, signIn } from './auth/auth-world.ts';

/**
 * The rate limits (M8-T3): which routes have which tier, and what happens past a limit. The
 * other tests run without them (helpers.ts), since they send far more requests from one
 * address than anyone would.
 */

const limited = (url: string): Promise<ApiServer> =>
  buildServer(authConfig(url, { rateLimits: true }));

const NOBODY = '00000000-0000-7000-8000-000000000000';

/**
 * The tier each route should have, worked out on its own from what the route does, as
 * architecture.md §7 describes the tiers: a route the rules miss shows up as a difference.
 */
function expectedTier(method: string, path: string, operation: OpenAPIV3_1.OperationObject) {
  // Uploads are streamed, not validated, so the document has no request body for them: their
  // descriptions say what to send.
  if (operation.description?.includes('multipart/form-data')) return 'uploads';
  if (path.startsWith('/api/v1/auth/links/')) return 'links';
  if (method === 'post' && path === '/api/v1/universes/unlock') return 'links';
  if (method === 'post' && ['/api/v1/auth/login', '/api/v1/auth/password'].includes(path))
    return 'auth';
  if (method === 'put' && path === '/api/v1/universes/{universeId}/members/{username}')
    return 'members';
  if (path === '/api/v1/media-access') return 'media';
  return undefined;
}

describe('rate limits (M8-T3)', () => {
  it('each route declares the tier its job calls for', async () => {
    const app = await buildServer(authConfig('postgres://unused@127.0.0.1:1/unused'));
    try {
      await app.ready();
      const document = app.swagger() as OpenAPIV3_1.Document;
      const differences: string[] = [];
      for (const [path, item] of Object.entries(document.paths ?? {})) {
        for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
          const operation = item?.[method] as
            (OpenAPIV3_1.OperationObject & { 'x-ge-rate-limit'?: string }) | undefined;
          if (!operation) continue;
          const declared = operation['x-ge-rate-limit'];
          const expected = expectedTier(method, path, operation);
          if (declared !== expected) {
            differences.push(
              `${method.toUpperCase()} ${path}: ${String(declared)}, not ${String(expected)}`,
            );
          }
        }
      }
      expect(differences).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('applies each tier’s limit to its routes, and the default to the rest', () =>
    withTestDb(async (_db, url) => {
      const app = await limited(url);
      try {
        const limitOf = async (method: 'GET' | 'POST' | 'PUT', path: string) => {
          const response = await app.inject({
            method,
            url: path,
            headers: ORIGIN,
            remoteAddress: '198.51.100.1',
          });
          return Number(response.headers['x-ratelimit-limit']);
        };
        expect(await limitOf('GET', '/api/v1/auth/me')).toBe(RATE_LIMITS.default.max);
        expect(await limitOf('GET', '/api/v1/no-such-route')).toBe(RATE_LIMITS.default.max);
        expect(await limitOf('POST', '/api/v1/auth/login')).toBe(RATE_LIMITS.auth.max);
        expect(await limitOf('GET', '/api/v1/auth/links/nothing-here')).toBe(RATE_LIMITS.links.max);
        expect(await limitOf('POST', '/api/v1/universes/unlock')).toBe(RATE_LIMITS.links.max);
        expect(await limitOf('PUT', `/api/v1/universes/${NOBODY}/members/someone`)).toBe(
          RATE_LIMITS.members.max,
        );
        expect(await limitOf('POST', `/api/v1/universes/${NOBODY}/assets`)).toBe(
          RATE_LIMITS.uploads.max,
        );
        expect(await limitOf('GET', '/api/v1/media-access')).toBe(RATE_LIMITS.media.max);
        expect(await limitOf('GET', `/media/u/${NOBODY}/${NOBODY}/thumb.webp`)).toBe(
          RATE_LIMITS.media.max,
        );
      } finally {
        await app.close();
      }
    }));

  it('past the default budget, an address gets 429s on every route without a tier of its own; an account and a token count apart', () =>
    withTestDb(async (db, url) => {
      const app = await limited(url);
      try {
        const account = await makeAccount(db, 'busy');
        const from = '203.0.113.7';
        const session = sessionOf(await signIn(app, account, await codeFor(account.secret), from));
        const token = await createToken(db, account.id, {
          name: 'agent',
          scope: 'read',
          universeId: null,
        });

        // Asking for routes that don't exist counts too.
        for (let sent = 0; sent < RATE_LIMITS.default.max; sent++) {
          await app.inject({ method: 'GET', url: '/api/v1/no-such-route', remoteAddress: from });
        }
        const refused = await app.inject({
          method: 'GET',
          url: '/api/v1/auth/me',
          remoteAddress: from,
        });
        expect(refused.statusCode).toBe(429);
        expect(refused.headers['content-type']).toContain('application/problem+json');
        expect(Number(refused.headers['retry-after'])).toBeGreaterThan(0);
        expect(refused.json<{ detail: string }>().detail).toMatch(
          /^Too many requests\. Wait (\d+ seconds?|1 minute) and try again\.$/,
        );

        const me = (headers: Record<string, string>, remoteAddress = from) =>
          app.inject({ method: 'GET', url: '/api/v1/universes', headers, remoteAddress });
        // Another address has its own budget.
        expect((await me({}, '203.0.113.8')).statusCode).toBe(200);
        // So does the account signed in at this address, and its token.
        expect((await me(session)).statusCode).toBe(200);
        expect((await me({ authorization: `Bearer ${token.secret}` })).statusCode).toBe(200);
        // A route with a tier of its own keeps its own count: signing in is still a 400 for
        // a body that isn't one, not a 429.
        const login = await app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          headers: ORIGIN,
          payload: {},
          remoteAddress: from,
        });
        expect(login.statusCode).toBe(400);
      } finally {
        await app.close();
      }
    }));

  it('signing in allows ten tries a minute per address, and an IPv6 address counts by its /64', () =>
    withTestDb(async (_db, url) => {
      const app = await limited(url);
      try {
        // Bodies that aren't sign-ins: refused before any password is checked, so only the
        // rate limit counts them (not the failed sign-in limiter).
        const login = (remoteAddress: string) =>
          app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            headers: ORIGIN,
            payload: {},
            remoteAddress,
          });
        for (let sent = 0; sent < RATE_LIMITS.auth.max; sent++) {
          expect((await login('2001:db8::1')).statusCode).toBe(400);
        }
        expect((await login('2001:db8::1')).statusCode).toBe(429);
        // The same /64: the same home or phone.
        expect((await login('2001:db8::2')).statusCode).toBe(429);
        // Another /64, and an IPv4 address, are someone else.
        expect((await login('2001:db8:0:1::1')).statusCode).toBe(400);
        expect((await login('192.0.2.1')).statusCode).toBe(400);
      } finally {
        await app.close();
      }
    }));
});
