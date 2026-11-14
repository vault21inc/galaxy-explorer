import type { Database } from '@ge/db';
import type { UniverseAccess } from '@ge/domain';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { TOKENS_REFUSED } from '../auth/requester.ts';
import {
  accessFactsOf,
  accountAccess,
  atLeast,
  tokenOf,
  universeAccess,
} from '../services/access.ts';
import { problem } from './problems.ts';
import { namesUniverse, routeUniverse } from './route-universe.ts';

/**
 * The access check (M8-T11, data-model §8): one `preValidation` hook in front of every
 * /api/v1 route, so no route can forget it. Before the route's own validation or handler runs,
 * it finds the universe from the path (http/route-universe.ts), asks `universeAccess`, and
 * answers:
 * - **404** for a universe the requester can't read, exactly as for one that doesn't exist;
 * - **403** (401 when signed out) for one they can read but may not do this in.
 *
 * Each route says what it needs in its schema, as `x-ge-access` (`routeAccess()` below), which
 * also lands in the OpenAPI document, where the access contract suite reads it. A route whose
 * path names a universe needs `read` to GET and `edit` for anything else, unless it says more.
 *
 * **API tokens** (M8-T2) get their account's access, narrowed by the token (services/access.ts),
 * and never reach the account, sharing and admin routes: those marked `session: true`, every
 * `/auth/` route but `GET /auth/token`, and the `admin` scope.
 */
export type RouteAccess =
  /** The route's path names a universe; at least this much access is needed. */
  (
    | {
        scope: 'universe';
        level?: Exclude<UniverseAccess, 'none'>;
        /** Body fields that need `own` to change, such as a universe's `slug`. */
        ownFields?: readonly string[];
      }
    /** Not about one universe, for anyone: health, icons, signing in, lists that filter themselves. */
    | { scope: 'open' }
    /**
     * Not about one universe, for someone who may make changes (signed in, or anyone locally):
     * creating a universe, the batch endpoint (which checks each operation's universe itself),
     * reading wikis for "Fill from wiki".
     */
    | {
        scope: 'editor';
        /** It makes a new universe: a token for one universe can't (M8-T2). */
        newUniverse?: true;
      }
    /**
     * The admin screens (M8-T13): only an account with the `admin` role, signed in with a session
     * (never an API token). Everyone else gets a 404, as if the routes weren't there. A universe
     * in an admin route's path isn't opened through `universeAccess`: the admin routes deal with
     * universes without reading their content.
     */
    | { scope: 'admin' }
  ) & {
    /**
     * An account or sharing action (architecture.md §7): it needs someone signed in on the site,
     * with a session. An API token gets a 403, someone signed out a 401. Locally, there are no
     * sessions to need.
     */
    session?: true;
  };

/** Signing in, account links and the account's own settings: an API token has no business here. */
const AUTH_ROUTES = '/api/v1/auth/';
/** The one account route for tokens: the token's own name and scope, for the MCP server. */
const TOKEN_ROUTE = '/api/v1/auth/token';

declare module 'fastify' {
  interface FastifySchema {
    'x-ge-access'?: RouteAccess;
  }
  interface FastifyRequest {
    /** What the requester may do in the universe this route is about, once checked. */
    universeAccess: UniverseAccess | null;
  }
}

/** For a route's schema: `{ ...routeAccess({ scope: 'open' }) }`. */
export function routeAccess(access: RouteAccess): { 'x-ge-access': RouteAccess } {
  return { 'x-ge-access': access };
}

const READS = new Set(['GET', 'HEAD']);

function refuse(reply: FastifyReply, status: number, detail: string) {
  return reply.code(status).type('application/problem+json').send(problem(status, detail));
}

/** Refuses someone who may read but not do this: 401 if they could sign in, else 403. */
function notAllowed(request: FastifyRequest, reply: FastifyReply, detail: string) {
  // A read token's account may well be allowed: the token is what isn't.
  if (tokenOf(request.requester)?.scope === 'read') return refuse(reply, 403, READ_TOKEN);
  if (request.requester.kind !== 'anonymous') return refuse(reply, 403, detail);
  return refuse(
    reply,
    401,
    READS.has(request.method) ? 'Sign in to see this.' : 'Sign in to make changes.',
  );
}

const READ_TOKEN =
  'This API token can only read, as a viewer does. Make a write token on your account page to change things.';

const NEEDS: Record<Exclude<UniverseAccess, 'none'>, string> = {
  read: 'You can’t read this universe.',
  edit: 'You can read this universe but not change it.',
  own: 'Only the universe’s owner can do this.',
};

export function registerAccessGuard(app: FastifyInstance, db: Database): void {
  app.decorateRequest('universeAccess', null);
  app.addHook('preValidation', async (request, reply) => {
    const url = request.routeOptions.url ?? '';
    if (!url.startsWith('/api/v1/')) return;
    const declared = request.routeOptions.schema?.['x-ge-access'];
    const access: RouteAccess | undefined =
      declared ?? (namesUniverse(url) ? { scope: 'universe' } : undefined);
    if (!access) {
      // A new route that names no universe and says nothing: refuse it until it does.
      request.log.error({ url }, 'route declares no access (x-ge-access)');
      return refuse(reply, 500, 'This route declares no access rule.');
    }
    const token = tokenOf(request.requester);
    if (access.scope === 'admin') {
      const { requester } = request;
      const admin =
        requester.kind === 'account' &&
        requester.account.role === 'admin' &&
        request.sessionId !== null;
      if (!admin) return refuse(reply, 404, `No route for ${request.method} ${request.url}.`);
      return;
    }
    // Account and sharing actions need a person at the site, not a program with a token. The
    // same answer whatever the path names, so it tells a token nothing about any universe.
    const accountRoute = url.startsWith(AUTH_ROUTES) && url !== TOKEN_ROUTE;
    if (token && (access.session || accountRoute)) return refuse(reply, 403, TOKENS_REFUSED);
    // Someone signed out is asked to sign in, but only once the universe check below has
    // answered 404 for one they couldn't see anyway.
    const signInFirst = () =>
      access.session && request.requester.kind === 'anonymous'
        ? refuse(reply, 401, 'Sign in to do this.')
        : undefined;
    if (access.scope === 'open') return signInFirst();
    if (access.scope === 'editor') {
      if (!request.canEdit) return notAllowed(request, reply, 'You can’t make changes here.');
      if (access.newUniverse && token?.universeId) {
        return refuse(reply, 403, 'This API token is for one universe: it can’t make new ones.');
      }
      return signInFirst();
    }

    const found = await routeUniverse(db, url, request.params as Record<string, string>);
    // Ids that aren't ids: the route's validation answers.
    if (found === null) return;
    if (found.found === 'unknown') {
      request.log.error(
        { url, param: found.param },
        'route has a parameter the access check doesn’t know',
      );
      return refuse(reply, 500, 'This route’s access can’t be checked.');
    }
    if (!found.found) return refuse(reply, 404, `No ${found.what} with id ${found.id}.`);

    let level: UniverseAccess;
    let listed = true;
    if (found.universeId === null) {
      // A change batch that recorded no universe: only on your own machine, where all is yours.
      level =
        request.requester.kind === 'local' ? (request.requester.mayEdit ? 'own' : 'read') : 'none';
    } else {
      const facts = (await accessFactsOf(db, request.requester, [found.universeId])).get(
        found.universeId,
      );
      level = facts ? universeAccess(request.requester, facts) : 'none';
      listed = facts?.visibility === 'public';
      // A token for another universe, whose account could read this one: say what's wrong, as
      // there's nothing to hide from the account itself.
      if (
        facts &&
        level === 'none' &&
        token &&
        accountAccess(request.requester, facts) !== 'none'
      ) {
        return refuse(reply, 403, 'This API token is for another universe.');
      }
    }
    // Hidden reads exactly like missing: nothing says that something is there.
    if (level === 'none') return refuse(reply, 404, `No ${found.what} with id ${found.id}.`);
    // Private and link-only universes are kept out of search engines (M8-T12). Only now, after
    // the 404: a hidden universe's answer must carry nothing a missing one's doesn't.
    if (!listed) void reply.header('x-robots-tag', 'noindex');

    const body = request.body as Record<string, unknown> | undefined;
    const touchesOwnFields = access.ownFields?.some((field) => body?.[field] !== undefined);
    const needed = touchesOwnFields
      ? 'own'
      : (access.level ?? (READS.has(request.method) ? 'read' : 'edit'));
    const signIn = signInFirst();
    if (signIn) return signIn;
    if (!atLeast(level, needed)) return notAllowed(request, reply, NEEDS[needed]);
    const query = request.query as Record<string, unknown> | undefined;
    if (query?.includeDrafts === 'true' && !atLeast(level, 'edit')) {
      return notAllowed(request, reply, 'Drafts are only for those who can edit this universe.');
    }
    request.universeAccess = level;
  });
}
