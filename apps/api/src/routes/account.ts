import { schema, type Database } from '@ge/db';
import { PasswordChange, StorageRead } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthContext } from '../auth/context.ts';
import { NotSignedIn, Refused, TooManyAttempts } from '../auth/errors.ts';
import { checkPassword, hashPassword } from '../auth/passwords.ts';
import { endSessionsOf } from '../auth/sessions.ts';
import { checkFreshCode } from '../auth/sign-in.ts';
import { routeAccess } from '../http/access-guard.ts';
import { rateLimit } from '../http/rate-limits.ts';
import { problem } from '../http/problems.ts';
import { envelope, problemResponses } from '../http/schemas.ts';
import { recordAccessEvent } from '../services/access-events.ts';

/**
 * The account page's own routes (M8-T13, ux.md §13): changing the password, and the media each
 * of the account's universes holds. Signed-in devices are `/auth/sessions` (M8-T1), API tokens
 * `/auth/tokens` (M8-T2). Both need a session (`session: true`), so API tokens never reach
 * them; with no accounts they answer 404, like the other account routes.
 */

const tags = ['auth'];
const { assets, universes, users } = schema;

export const accountRoutes: FastifyPluginCallbackZod<{
  db: Database;
  auth: AuthContext | null;
}> = (app, { db, auth }, done) => {
  if (!auth) {
    app.addHook('onRequest', async (_request, reply) =>
      reply
        .code(404)
        .type('application/problem+json')
        .send(problem(404, 'This server has no accounts: it runs with GE_AUTH_MODE=none.')),
    );
  }
  const authOf = (): AuthContext => {
    if (!auth) throw new NotSignedIn();
    return auth;
  };

  app.post(
    '/auth/password',
    {
      schema: {
        tags,
        operationId: 'auth.password.change',
        ...rateLimit('auth'),
        summary: 'Change the password',
        description:
          'Needs the current password and a current code from the authenticator app. Every other device is signed out; this one stays signed in. Failures count against the same limits as signing in.',
        ...routeAccess({ scope: 'open', session: true }),
        body: PasswordChange,
        response: { 204: z.null(), ...problemResponses },
      },
    },
    async (request, reply) => {
      const context = authOf();
      const account = request.account;
      if (!account) throw new NotSignedIn();
      const keys = [`password:user:${account.id}`];
      const waitS = context.limiter.retryAfterS(keys);
      if (waitS > 0) throw new TooManyAttempts(waitS);
      const [user] = await db.select().from(users).where(eq(users.id, account.id));
      if (!user || !(await checkPassword(user.passwordHash, request.body.currentPassword))) {
        context.limiter.fail(keys);
        throw new Refused('That isn’t your current password.');
      }
      await checkFreshCode(context, account, request.body.totp);
      const passwordHash = await hashPassword(request.body.newPassword);
      await db.transaction(async (tx) => {
        await tx.update(users).set({ passwordHash }).where(eq(users.id, account.id));
        // Anyone who had the old password and signed in elsewhere is signed out.
        await endSessionsOf(tx, account.id, request.sessionId ?? undefined);
        await recordAccessEvent(tx, request.requester, {
          action: 'user.password',
          userId: account.id,
          detail: { username: account.username },
        });
      });
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/storage',
    {
      schema: {
        tags,
        operationId: 'auth.storage',
        summary: 'Media used, by universe',
        description:
          'How much of the account’s media quota its universes use, universe by universe. Images count against the universe’s owner, whoever uploaded them.',
        ...routeAccess({ scope: 'open', session: true }),
        response: { 200: envelope(StorageRead), ...problemResponses },
      },
    },
    async (request) => {
      const account = request.account;
      if (!account) throw new NotSignedIn();
      const rows = await db
        .select({
          id: universes.id,
          slug: universes.slug,
          name: universes.namePlain,
          // The outer row in full: Drizzle would write a bare "id", the subquery's own.
          bytes: sql<string>`(select coalesce(sum(a.byte_size), 0) from ${assets} a
            where a.universe_id = "universes"."id")`,
        })
        .from(universes)
        .where(eq(universes.ownerId, account.id))
        .orderBy(universes.namePlain);
      const owned = rows.map((row) => ({ ...row, bytes: Number(row.bytes) }));
      return {
        data: {
          quotaBytes: account.mediaQuotaBytes,
          usedBytes: owned.reduce((sum, universe) => sum + universe.bytes, 0),
          universes: owned,
        },
      };
    },
  );

  done();
};
