import type { Database } from '@ge/db';
import { AccountRead, TwoFactorDisable, TwoFactorEnable, TwoFactorSetup } from '@ge/domain';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { accountRead, type AuthContext, type SignedIn } from '../auth/context.ts';
import { NotSignedIn } from '../auth/errors.ts';
import { disableTwoFactor, enableTwoFactor, startTwoFactor } from '../auth/two-factor.ts';
import { routeAccess } from '../http/access-guard.ts';
import { problem } from '../http/problems.ts';
import { rateLimit } from '../http/rate-limits.ts';
import { envelope, problemResponses } from '../http/schemas.ts';
import { mediaUsedBytes } from '../services/quota.ts';

/**
 * Two-factor codes on the account page (D-47, ux.md §13): optional per account, turned on in two
 * steps and off with the password and a code (auth/two-factor.ts). They need a session, so API
 * tokens never reach them; with no accounts they answer 404, like the other account routes.
 */

const tags = ['auth'];
const session = routeAccess({ scope: 'open', session: true });

export const twoFactorRoutes: FastifyPluginCallbackZod<{
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
  const accountOf = (request: FastifyRequest): SignedIn => {
    if (!request.account) throw new NotSignedIn();
    return request.account;
  };
  const read = async (account: SignedIn) => ({
    data: accountRead(account, await mediaUsedBytes(db, account.id)),
  });

  app.post(
    '/auth/two-factor/setup',
    {
      schema: {
        tags,
        operationId: 'auth.twoFactor.setup',
        ...session,
        summary: 'Step 1 of turning two-factor codes on: a new secret',
        description:
          'Returns a new two-factor secret, as text and as a QR code, with the sealed `setup` to send back to `enable` with one code. Nothing is saved yet. A 422 if the account has codes on already.',
        response: { 200: envelope(TwoFactorSetup), ...problemResponses },
      },
    },
    async (request) => ({ data: await startTwoFactor(authOf(), accountOf(request)) }),
  );

  app.post(
    '/auth/two-factor/enable',
    {
      schema: {
        tags,
        operationId: 'auth.twoFactor.enable',
        ...rateLimit('auth'),
        ...session,
        summary: 'Step 2: turn two-factor codes on',
        description:
          'Checks one code from the authenticator app against the setup from `setup`, then saves the secret: from now on, signing in and the confirmations ask for a code. Returns the account.',
        body: TwoFactorEnable,
        response: { 200: z.object({ data: AccountRead }), ...problemResponses },
      },
    },
    async (request) =>
      read(await enableTwoFactor(authOf(), request.requester, accountOf(request), request.body)),
  );

  app.post(
    '/auth/two-factor/disable',
    {
      schema: {
        tags,
        operationId: 'auth.twoFactor.disable',
        ...rateLimit('auth'),
        ...session,
        summary: 'Turn two-factor codes off',
        description:
          'Needs the current password and a current code. From then on the account signs in with its password alone, and the confirmations ask for the password. Failures count against the same limits as signing in. Returns the account.',
        body: TwoFactorDisable,
        response: { 200: z.object({ data: AccountRead }), ...problemResponses },
      },
    },
    async (request) =>
      read(await disableTwoFactor(authOf(), request.requester, accountOf(request), request.body)),
  );

  done();
};
