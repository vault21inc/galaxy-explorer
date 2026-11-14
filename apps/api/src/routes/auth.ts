import {
  AccountLinkFinish,
  AccountLinkRead,
  AccountLinkSetup,
  AccountLinkStart,
  AccountRead,
  LoginRequest,
  SessionRead,
} from '@ge/domain';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { accountRead, type AuthContext, type SignedIn } from '../auth/context.ts';
import { NotSignedIn } from '../auth/errors.ts';
import { describeLink, finishLink, startLink } from '../auth/links.ts';
import { SESSION_COOKIE, sessionCookie } from '../auth/requester.ts';
import { endSession, endSessionsOf, listSessions } from '../auth/sessions.ts';
import { signIn } from '../auth/sign-in.ts';
import { problem } from '../http/problems.ts';
import { mediaUsedBytes } from '../services/quota.ts';
import { routeAccess } from '../http/access-guard.ts';

/**
 * Signing in and account links (M8-T1, architecture.md §7, ux.md §13), under /api/v1/auth.
 * They exist only with GE_AUTH_MODE=required. With `none` there are no accounts, and every
 * route here answers 404, though the routes stay in the OpenAPI document and the client.
 */

const tags = ['auth'];
const account = z.object({ data: AccountRead });
const linkToken = z.object({ token: z.string().min(1).max(200) });

/** The client's address and browser, for the rate limits and the devices list. */
function clientOf(request: FastifyRequest) {
  const userAgent = request.headers['user-agent'];
  return { ip: request.ip, userAgent: typeof userAgent === 'string' ? userAgent : null };
}

export const authRoutes: FastifyPluginCallbackZod<{ auth: AuthContext | null }> = (
  app,
  { auth: maybeAuth },
  done,
) => {
  if (!maybeAuth) {
    app.addHook('onRequest', async (_request, reply) =>
      reply
        .code(404)
        .type('application/problem+json')
        .send(problem(404, 'This server has no accounts: it runs with GE_AUTH_MODE=none.')),
    );
  }
  // Routes below run only with accounts; the hook above answers for them otherwise.
  const authOf = (): AuthContext => {
    if (!maybeAuth) throw new Error('Account routes ran without accounts.');
    return maybeAuth;
  };
  const signedInAs = (reply: FastifyReply, token: string, expiresAt: Date) =>
    reply.setCookie(SESSION_COOKIE, token, sessionCookie(authOf(), expiresAt));
  const read = async (account: SignedIn) =>
    accountRead(account, await mediaUsedBytes(authOf().db, account.id));
  const requireAccount = (request: FastifyRequest) => {
    if (!request.account) throw new NotSignedIn();
    return request.account;
  };

  app.post(
    '/auth/login',
    {
      schema: {
        tags,
        operationId: 'auth.login',
        ...routeAccess({ scope: 'open' }),
        summary: 'Sign in',
        description:
          'Signs in with a username, password and a current two-factor code, and sets the session cookie (30 days, renewed as it’s used). Any mistake gets the same 401. Five failures in 15 minutes from one address, or for one username, get 429s until the window passes.',
        body: LoginRequest,
        response: { 200: account },
      },
    },
    async (request, reply) => {
      const result = await signIn(authOf(), request.body, clientOf(request));
      signedInAs(reply, result.token, result.expiresAt);
      return { data: await read(result.account) };
    },
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags,
        operationId: 'auth.logout',
        ...routeAccess({ scope: 'open' }),
        summary: 'Sign out',
        description:
          'Ends this session and clears its cookie. Signed out already, it does nothing.',
      },
    },
    async (request, reply) => {
      if (request.account && request.sessionId) {
        await endSession(authOf().db, request.account.id, request.sessionId);
      }
      return reply.clearCookie(SESSION_COOKIE, { path: '/' }).code(204).send();
    },
  );

  app.get(
    '/auth/me',
    {
      schema: {
        tags,
        operationId: 'auth.me',
        ...routeAccess({ scope: 'open' }),
        summary: 'The signed-in account',
        description: 'The account this request is signed in as, or `null` when it isn’t.',
        response: { 200: z.object({ data: AccountRead.nullable() }) },
      },
    },
    async (request) => ({ data: request.account ? await read(request.account) : null }),
  );

  app.get(
    '/auth/sessions',
    {
      schema: {
        tags,
        operationId: 'auth.sessions.list',
        ...routeAccess({ scope: 'open' }),
        summary: 'The account’s signed-in devices',
        response: { 200: z.object({ data: z.array(SessionRead) }) },
      },
    },
    async (request) => {
      const signed = requireAccount(request);
      return { data: await listSessions(authOf().db, signed.id, request.sessionId) };
    },
  );

  app.delete(
    '/auth/sessions',
    {
      schema: {
        tags,
        operationId: 'auth.sessions.endOthers',
        ...routeAccess({ scope: 'open' }),
        summary: 'Sign out every other device',
        description: 'Ends all of the account’s sessions except this one.',
      },
    },
    async (request, reply) => {
      const signed = requireAccount(request);
      await endSessionsOf(authOf().db, signed.id, request.sessionId ?? undefined);
      return reply.code(204).send();
    },
  );

  app.delete(
    '/auth/sessions/:sessionId',
    {
      schema: {
        tags,
        operationId: 'auth.sessions.end',
        ...routeAccess({ scope: 'open' }),
        summary: 'Sign out one device',
        params: z.object({ sessionId: z.uuid() }),
      },
    },
    async (request, reply) => {
      const signed = requireAccount(request);
      if (!(await endSession(authOf().db, signed.id, request.params.sessionId))) {
        return reply
          .code(404)
          .type('application/problem+json')
          .send(problem(404, 'No such device.'));
      }
      if (request.params.sessionId === request.sessionId) {
        void reply.clearCookie(SESSION_COOKIE, { path: '/' });
      }
      return reply.code(204).send();
    },
  );

  app.get(
    '/auth/links/:token',
    {
      schema: {
        tags,
        operationId: 'auth.links.get',
        ...routeAccess({ scope: 'open' }),
        summary: 'What an invite or reset link is for',
        description:
          'Whether the link is an invite or a reset, and whether it still works (`ready`), was used, or expired. An unknown link is a 404.',
        params: linkToken,
        response: { 200: z.object({ data: AccountLinkRead }) },
      },
    },
    async (request) => ({
      data: await describeLink(authOf(), request.params.token, request.ip),
    }),
  );

  app.post(
    '/auth/links/:token/start',
    {
      schema: {
        tags,
        operationId: 'auth.links.start',
        ...routeAccess({ scope: 'open' }),
        summary: 'Step 1 of a link: username and password',
        description:
          'Checks the username (an invite only; 409 if it’s taken) and the password, and returns a new two-factor secret, as text and as a QR code, with the sealed `setup` to send back to `finish`. Nothing is saved yet.',
        params: linkToken,
        body: AccountLinkStart,
        response: { 200: z.object({ data: AccountLinkSetup }) },
      },
    },
    async (request) => ({
      data: await startLink(authOf(), request.params.token, request.body, request.ip),
    }),
  );

  app.post(
    '/auth/links/:token/finish',
    {
      schema: {
        tags,
        operationId: 'auth.links.finish',
        ...routeAccess({ scope: 'open' }),
        summary: 'Step 2 of a link: the first code',
        description:
          'Checks one code from the authenticator app against the setup from `start`. Then the account is made (an invite) or its password and two-factor codes are replaced and its sessions ended (a reset), the link is used up, and this browser is signed in.',
        params: linkToken,
        body: AccountLinkFinish,
        response: { 200: account },
      },
    },
    async (request, reply) => {
      const result = await finishLink(
        authOf(),
        request.params.token,
        request.body,
        clientOf(request),
      );
      signedInAs(reply, result.token, result.expiresAt);
      return { data: await read(result.account) };
    },
  );

  done();
};
