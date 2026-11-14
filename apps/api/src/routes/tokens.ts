import type { Database } from '@ge/db';
import { ApiTokenCreate, ApiTokenCreated, ApiTokenRead, CurrentTokenRead } from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AuthContext } from '../auth/context.ts';
import { NotSignedIn } from '../auth/errors.ts';
import { requireFreshTotp } from '../auth/requester.ts';
import { createToken, listTokens, readToken, revokeToken } from '../auth/tokens.ts';
import { routeAccess } from '../http/access-guard.ts';
import { problem } from '../http/problems.ts';
import { envelope, problemResponses } from '../http/schemas.ts';
import { accessTo, tokenOf } from '../services/access.ts';
import { recordAccessEvent } from '../services/access-events.ts';
import { getUniverse } from '../services/container-service.ts';
import { NotFound } from '../services/errors.ts';

/**
 * API tokens (M8-T2, ux.md §13): the account page makes, lists and revokes them, signed in with
 * a session; an agent sends one as `Authorization: Bearer ge_…` and acts for the account. The
 * token itself is shown once, when it's made; the database keeps only its hash.
 *
 * Making one asks for a current two-factor code: a token outlives the session that made it, so
 * whoever holds a session for a moment shouldn't be able to leave one behind. Revoking one
 * doesn't: it only takes access away.
 */

const tags = ['auth'];
const TOKENS_DOC =
  'An API token acts for the account that made it, never doing more than that account may at the moment of each request: `read` reads as a viewer would, `write` changes content too, and a token for one universe reaches no other. Account, sharing and admin routes refuse tokens.';

export const tokenRoutes: FastifyPluginCallbackZod<{
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
  const accountOf = (account: { id: string; username: string } | null) => {
    if (!account) throw new NotSignedIn();
    return account;
  };

  app.get(
    '/auth/tokens',
    {
      schema: {
        tags,
        operationId: 'auth.tokens.list',
        summary: 'The account’s API tokens',
        description: `${TOKENS_DOC} Lists the tokens that still work, newest first, with when each was last used.`,
        ...routeAccess({ scope: 'open', session: true }),
        response: { 200: envelope(z.array(ApiTokenRead)), ...problemResponses },
      },
    },
    async (request) => ({ data: await listTokens(db, accountOf(request.account).id) }),
  );

  app.post(
    '/auth/tokens',
    {
      schema: {
        tags,
        operationId: 'auth.tokens.create',
        summary: 'Make an API token',
        description: `${TOKENS_DOC} Needs a current two-factor code in \`X-GE-TOTP\`. The response holds the token itself (\`secret\`), which is never shown again.`,
        ...routeAccess({ scope: 'open', session: true }),
        body: ApiTokenCreate,
        response: { 201: envelope(ApiTokenCreated), ...problemResponses },
      },
      preHandler: requireFreshTotp(auth),
    },
    async (request, reply) => {
      const account = accountOf(request.account);
      const { name, scope } = request.body;
      const universeId = request.body.universeId ?? null;
      // A token for a universe the account can't see would be a way to learn that it exists.
      // Share links don't count: a token's requests carry none, so it could never reach a
      // universe its account sees only through one.
      if (universeId) {
        const asAccount = { ...request.requester, shareKeys: new Map<string, string>() };
        const access = (await accessTo(db, asAccount, [universeId])).get(universeId);
        if (access === undefined || access === 'none') throw new NotFound('universe', universeId);
      }
      const data = await db.transaction(async (tx) => {
        const made = await createToken(tx, account.id, { name, scope, universeId });
        const universe = universeId ? await getUniverse(tx, universeId) : null;
        await recordAccessEvent(tx, request.requester, {
          action: 'token.create',
          userId: account.id,
          universeId,
          detail: { name, scope, ...(universe ? { universe: universe.slug } : {}) },
        });
        return { token: await readToken(tx, made.id), secret: made.secret };
      });
      return reply.code(201).send({ data });
    },
  );

  app.delete(
    '/auth/tokens/:tokenId',
    {
      schema: {
        tags,
        operationId: 'auth.tokens.revoke',
        summary: 'Revoke an API token',
        description: `${TOKENS_DOC} It stops working at once.`,
        ...routeAccess({ scope: 'open', session: true }),
        params: z.object({ tokenId: z.uuid() }),
        response: { 204: z.null(), ...problemResponses },
      },
    },
    async (request, reply) => {
      const account = accountOf(request.account);
      const revoked = await db.transaction(async (tx) => {
        const token = await revokeToken(tx, account.id, request.params.tokenId);
        if (token) {
          await recordAccessEvent(tx, request.requester, {
            action: 'token.revoke',
            userId: account.id,
            detail: { name: token.name },
          });
        }
        return token;
      });
      if (!revoked) {
        return reply
          .code(404)
          .type('application/problem+json')
          .send(problem(404, 'No such token: it may have been revoked already.'));
      }
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/auth/token',
    {
      schema: {
        tags,
        operationId: 'auth.token.current',
        summary: 'The API token this request is made with',
        description: `${TOKENS_DOC} Its name, scope and universe, and its account's username: what the MCP server checks before it serves anyone. Only for requests made with a token.`,
        ...routeAccess({ scope: 'open' }),
        response: { 200: envelope(CurrentTokenRead), ...problemResponses },
      },
    },
    async (request) => {
      const grant = tokenOf(request.requester);
      if (!grant || !request.account) {
        throw new NotSignedIn('Send an API token, as `Authorization: Bearer ge_…`.');
      }
      return { data: { ...(await readToken(db, grant.id)), username: request.account.username } };
    },
  );

  done();
};
