import type { Actor } from '@ge/db';
import type { CookieSerializeOptions } from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { LOCAL_ACTOR } from '../http/batch.ts';
import { isEditor } from '../http/preview-roles.ts';
import { problem } from '../http/problems.ts';
import type { Requester } from '../services/access.ts';
import type { AuthContext, SignedIn } from './context.ts';
import { NotSignedIn } from './errors.ts';
import { resolveSession } from './sessions.ts';
import { checkFreshCode } from './sign-in.ts';

/**
 * Who is asking (M8-T1, architecture.md §7), worked out once per request in an `onRequest`
 * hook, before any route runs:
 *
 * - `GE_AUTH_MODE=none` (your own machine): every request is the local actor, who may edit,
 *   except readers of the private preview (http/preview-roles.ts).
 * - `GE_AUTH_MODE=required`: the account behind the session cookie, or nobody.
 *
 * What the requester may do in a universe is decided per route by the access guard
 * (http/access-guard.ts), from `request.requester` (services/access.ts).
 */
declare module 'fastify' {
  interface FastifyRequest {
    /** The signed-in account; null when signed out, and always with GE_AUTH_MODE=none. */
    account: SignedIn | null;
    /** The session making the request, if it's signed in. */
    sessionId: string | null;
    /** Who a change is recorded as (History); null for an anonymous visitor. */
    actor: Actor | null;
    /** Who is asking, for `universeAccess` (M8-T11). */
    requester: Requester;
    /**
     * Whether this request may make anything at all: start a universe, use the batch endpoint
     * or read wikis. Locally, everyone but the preview's readers; with accounts, anyone signed
     * in. What it may do in a given universe is `universeAccess`'s to say.
     */
    canEdit: boolean;
  }
}

/** No share links unlocked: M8-T12 reads them from the browser's cookies. */
const NO_SHARE_KEYS: ReadonlyMap<string, string> = new Map();
const ANONYMOUS: Requester = { kind: 'anonymous', shareKeys: NO_SHARE_KEYS };

export const SESSION_COOKIE = 'ge_session';
/** The header a request carries a current two-factor code in, for `requireFreshTotp`. */
export const FRESH_TOTP_HEADER = 'x-ge-totp';

const MUTATIONS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * The session cookie: `HttpOnly` so page scripts can't read it, `SameSite=Lax` so other sites'
 * forms and scripts don't send it, `Secure` whenever the site is served over https. (Browsers
 * treat http://localhost as secure, but WebKit won't send a `Secure` cookie there, so a local
 * site over http gets one without the flag.)
 */
export function sessionCookie(auth: AuthContext, expiresAt: Date): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: auth.secureCookies,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  };
}

function refuse(reply: FastifyReply, status: number, detail: string) {
  return reply.code(status).type('application/problem+json').send(problem(status, detail));
}

export function registerRequester(
  app: FastifyInstance,
  options: { auth: AuthContext | null; previewRoles: boolean },
): void {
  const { auth, previewRoles } = options;
  app.decorateRequest('account', null);
  app.decorateRequest('sessionId', null);
  app.decorateRequest('actor', null);
  app.decorateRequest('canEdit', false);
  // Anonymous until a hook below says otherwise. Fastify can't decorate requests with a shared
  // object, so each request's requester is kept beside it.
  const requesters = new WeakMap<FastifyRequest, Requester>();
  app.decorateRequest('requester', {
    getter(this: FastifyRequest) {
      return requesters.get(this) ?? ANONYMOUS;
    },
    setter(this: FastifyRequest, value: Requester) {
      requesters.set(this, value);
    },
  });

  if (!auth) {
    app.addHook('onRequest', (request, _reply, done) => {
      const mayEdit = isEditor(request, previewRoles);
      request.actor = LOCAL_ACTOR;
      request.canEdit = mayEdit;
      request.requester = { kind: 'local', mayEdit, shareKeys: NO_SHARE_KEYS };
      done();
    });
    return;
  }

  app.addHook('onRequest', async (request, reply) => {
    // The API and the media files it guards (architecture.md §8) need to know who's asking.
    if (!request.url.startsWith('/api/') && !request.url.startsWith('/media/')) return;
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      const session = await resolveSession(auth.db, token);
      if (session) {
        request.account = session.account;
        request.sessionId = session.sessionId;
        // The session slid forward: so does the cookie.
        if (session.renewedUntil) {
          void reply.setCookie(SESSION_COOKIE, token, sessionCookie(auth, session.renewedUntil));
        }
      } else {
        // Expired, signed out elsewhere, or a disabled account's: the browser forgets it.
        void reply.clearCookie(SESSION_COOKIE, { path: '/' });
      }
    }
    const { account } = request;
    request.actor = account ? { type: 'user', id: account.id, label: account.username } : null;
    request.canEdit = account !== null;
    request.requester = account
      ? { kind: 'account', account, shareKeys: NO_SHARE_KEYS }
      : { kind: 'anonymous', shareKeys: NO_SHARE_KEYS };

    // CSRF: browsers always send `Origin` with a write. One from another site is refused here,
    // and `SameSite=Lax` already keeps the cookie off most of them.
    if (MUTATIONS.has(request.method) && request.headers.origin !== auth.publicUrl) {
      return refuse(reply, 403, 'Changes must come from this site’s own pages.');
    }
    // Drafts are never for someone signed out, whichever universe it is.
    const query = request.query as Record<string, unknown> | undefined;
    if (!account && query?.includeDrafts === 'true') {
      return refuse(reply, 401, 'Sign in to see drafts.');
    }
  });
}

/**
 * A route guard for destructive actions (M8-T12, T13): the request must carry a current
 * two-factor code in `X-GE-TOTP`, checked like a sign-in's. With no accounts there is no code
 * to ask for, and nothing is checked.
 */
export function requireFreshTotp(auth: AuthContext | null) {
  return async (request: FastifyRequest): Promise<void> => {
    if (!auth) return;
    if (!request.account) throw new NotSignedIn();
    const code = request.headers[FRESH_TOTP_HEADER];
    await checkFreshCode(auth, request.account, typeof code === 'string' ? code : undefined);
  };
}
