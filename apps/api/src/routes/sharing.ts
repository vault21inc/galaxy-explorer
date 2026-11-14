import type { Database } from '@ge/db';
import {
  UniverseMemberRead,
  UniverseMemberWrite,
  UniverseRead,
  UniverseTransfer,
  UniverseUnlock,
  Username,
} from '@ge/domain';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AuthContext } from '../auth/context.ts';
import {
  requireFreshTotp,
  requireSession,
  SHARE_COOKIE_TTL_MS,
  shareCookieName,
} from '../auth/requester.ts';
import { routeAccess } from '../http/access-guard.ts';
import { problem } from '../http/problems.ts';
import { envelope, problemResponses } from '../http/schemas.ts';
import type { Requester } from '../services/access.ts';
import { getUniverse, universeReads } from '../services/container-service.ts';
import {
  countDrafts,
  leaveUniverse,
  listMembers,
  removeMember,
  replaceShareKey,
  setMember,
  transferUniverse,
  universeForShareKey,
} from '../services/sharing-service.ts';

/**
 * Sharing a universe (M8-T12, D-34, ux.md §13): its members, its share link, and handing it to
 * another account. Changing its visibility is `PATCH /universes/{universeId}` (containers.ts).
 *
 * The access guard checks the level each route declares: listing members needs `edit` (editors
 * see the Sharing section, read-only), changing them `own`, and leaving `read` (a viewer may
 * leave too). Changes need a signed-in session, never an API token, and a transfer also needs a
 * current two-factor code. Every change is recorded in `access_events`.
 */

const tags = ['sharing'];
const universeParams = z.object({ universeId: z.uuid() });
const memberParams = universeParams.extend({ username: Username });

const SHARING_DOC =
  'Sharing (M8-T12): a universe is private to its owner and the accounts it’s shared with, link-only (anyone with its share link reads it), or public. Editors change its content; viewers read it. Only its owner changes who has access.';

export const sharingRoutes: FastifyPluginCallbackZod<{
  db: Database;
  auth: AuthContext | null;
}> = (app, { db, auth }, done) => {
  const session = requireSession(auth);

  /** The universe as this requester now sees it. */
  const readFor = async (requester: Requester, universeId: string) => {
    const [data] = await universeReads(db, requester, [await getUniverse(db, universeId)]);
    if (!data) throw new Error('The universe is out of reach.');
    return data;
  };

  app.get(
    '/universes/:universeId/members',
    {
      schema: {
        tags,
        summary: 'List the accounts a universe is shared with',
        description: `${SHARING_DOC} Its owner isn’t listed: that’s the universe’s \`owner\`. For its owner and editors.`,
        operationId: 'universes.members.list',
        ...routeAccess({ scope: 'universe', level: 'edit' }),
        params: universeParams,
        response: { 200: envelope(z.array(UniverseMemberRead)), ...problemResponses },
      },
    },
    async (request) => ({ data: await listMembers(db, request.params.universeId) }),
  );

  app.get(
    '/universes/:universeId/drafts',
    {
      schema: {
        tags,
        summary: 'Count a universe’s drafts',
        description: `${SHARING_DOC} How many maps and entries are drafts, which readers never see: what making the universe public leaves hidden. For its owner and editors.`,
        operationId: 'universes.drafts.count',
        ...routeAccess({ scope: 'universe', level: 'edit' }),
        params: universeParams,
        response: {
          200: envelope(z.object({ maps: z.int().nonnegative(), entries: z.int().nonnegative() })),
          ...problemResponses,
        },
      },
    },
    async (request) => ({ data: await countDrafts(db, request.params.universeId) }),
  );

  app.put(
    '/universes/:universeId/members/:username',
    {
      schema: {
        tags,
        summary: 'Share a universe with an account, or change its role',
        description: `${SHARING_DOC} Takes an exact username: one that doesn’t exist is a 404 that says so, and nothing lists or suggests accounts.`,
        operationId: 'universes.members.put',
        ...routeAccess({ scope: 'universe', level: 'own' }),
        params: memberParams,
        body: UniverseMemberWrite,
        response: { 200: envelope(UniverseMemberRead), ...problemResponses },
      },
      preHandler: session,
    },
    async (request) => {
      const { universeId, username } = request.params;
      const data = await db.transaction((tx) =>
        setMember(tx, request.requester, universeId, username, request.body.role),
      );
      return { data };
    },
  );

  app.delete(
    '/universes/:universeId/members/:username',
    {
      schema: {
        tags,
        summary: 'Stop sharing a universe with an account',
        description: `${SHARING_DOC} A member leaving uses \`DELETE /universes/{universeId}/membership\` instead.`,
        operationId: 'universes.members.delete',
        ...routeAccess({ scope: 'universe', level: 'own' }),
        params: memberParams,
        response: { 204: z.null(), ...problemResponses },
      },
      preHandler: session,
    },
    async (request, reply) => {
      const { universeId, username } = request.params;
      await db.transaction((tx) => removeMember(tx, request.requester, universeId, username));
      return reply.code(204).send(null);
    },
  );

  app.delete(
    '/universes/:universeId/membership',
    {
      schema: {
        tags,
        summary: 'Leave a universe shared with you',
        description: `${SHARING_DOC} The signed-in account stops being a member. Its owner can’t leave: they transfer or delete it instead.`,
        operationId: 'universes.leave',
        ...routeAccess({ scope: 'universe', level: 'read' }),
        params: universeParams,
        response: { 204: z.null(), ...problemResponses },
      },
      preHandler: session,
    },
    async (request, reply) => {
      await db.transaction((tx) => leaveUniverse(tx, request.requester, request.params.universeId));
      return reply.code(204).send(null);
    },
  );

  app.post(
    '/universes/:universeId/share-key',
    {
      schema: {
        tags,
        summary: 'Make a new share link',
        description: `${SHARING_DOC} Replaces a link-only universe’s key, so the old link stops working for everyone who had it, at once. The new link is \`/u/{slug}?k={shareKey}\`.`,
        operationId: 'universes.shareKey.replace',
        ...routeAccess({ scope: 'universe', level: 'own' }),
        params: universeParams,
        response: { 200: envelope(UniverseRead), ...problemResponses },
      },
      preHandler: session,
    },
    async (request) => {
      const { universeId } = request.params;
      await db.transaction((tx) => replaceShareKey(tx, request.requester, universeId));
      return { data: await readFor(request.requester, universeId) };
    },
  );

  app.post(
    '/universes/:universeId/transfer',
    {
      schema: {
        tags,
        summary: 'Hand a universe to another account',
        description: `${SHARING_DOC} Makes that account the owner, if its media quota has room for the universe’s images; the previous owner stays on as an editor. Needs a current two-factor code in \`X-GE-TOTP\`.`,
        operationId: 'universes.transfer',
        ...routeAccess({ scope: 'universe', level: 'own' }),
        params: universeParams,
        body: UniverseTransfer,
        response: { 200: envelope(UniverseRead), ...problemResponses },
      },
      preHandler: [session, requireFreshTotp(auth)],
    },
    async (request) => {
      const { universeId } = request.params;
      await db.transaction((tx) =>
        transferUniverse(tx, request.requester, universeId, request.body.username),
      );
      return { data: await readFor(request.requester, universeId) };
    },
  );

  app.post(
    '/universes/unlock',
    {
      schema: {
        tags,
        summary: 'Open a share link',
        description: `${SHARING_DOC} A share link is \`/u/{slug}?k={key}\`. Given the slug and key, this remembers the key in an HttpOnly cookie for that universe, so this browser can read it (and its images) until the link is replaced. Anything but a current link is a 404, as for an address that’s free.`,
        operationId: 'universes.unlock',
        // It finds the universe from the link itself, and a wrong key reads as nothing there.
        ...routeAccess({ scope: 'open' }),
        body: UniverseUnlock,
        response: { 200: envelope(UniverseRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const { slug, key } = request.body;
      const universeId = await universeForShareKey(db, slug, key);
      if (!universeId) {
        return reply
          .code(404)
          .type('application/problem+json')
          .send(problem(404, `No universe at /u/${slug}.`));
      }
      void reply
        .setCookie(shareCookieName(universeId), key, {
          httpOnly: true,
          secure: auth?.secureCookies ?? false,
          sameSite: 'lax',
          path: '/',
          expires: new Date(Date.now() + SHARE_COOKIE_TTL_MS),
        })
        // Link-only: reachable, but not for search engines (M8-T12).
        .header('x-robots-tag', 'noindex');
      const shareKeys = new Map(request.requester.shareKeys).set(universeId, key);
      return { data: await readFor({ ...request.requester, shareKeys }, universeId) };
    },
  );

  done();
};
