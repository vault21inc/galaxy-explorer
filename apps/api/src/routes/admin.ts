import { withBatch, type Database } from '@ge/db';
import {
  AccessEventRead,
  AdminInviteCreate,
  AdminLinkRead,
  AdminUniverseRead,
  AdminUniverseUpdate,
  AdminUserRead,
  AdminUserUpdate,
} from '@ge/domain';
import type { FastifyRequest } from 'fastify';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { AuthContext } from '../auth/context.ts';
import { confirmationOf, requireConfirmation } from '../auth/requester.ts';
import { checkConfirmation } from '../auth/sign-in.ts';
import { routeAccess } from '../http/access-guard.ts';
import { actorOf } from '../http/batch.ts';
import { envelope, listQuery, page, problemResponses } from '../http/schemas.ts';
import { recordAccessEvent } from '../services/access-events.ts';
import {
  createInvite,
  createResetLink,
  deleteAdminUser,
  listAccessEvents,
  listAdminUniverses,
  listAdminUsers,
  takeDownUniverse,
  updateAdminUser,
} from '../services/admin-service.ts';
import { deleteUniverse, getUniverse } from '../services/container-service.ts';
import { NotFound } from '../services/errors.ts';
import { transferUniverse } from '../services/sharing-service.ts';

/**
 * The admin routes (M8-T13, D-34, ux.md §13), for accounts with the `admin` role signed in with
 * a session. Anyone else, an API token included, gets a 404, as if they weren't there (the
 * access guard's `admin` scope). Admins manage accounts, not content: the universes list holds
 * no content, and opening a universe goes through `universeAccess` like anyone's request.
 *
 * Disabling, deleting, changing a role, a reset link, a transfer and deleting a universe each
 * need a confirmation: a current two-factor code (`X-GE-TOTP`), or the password for an account
 * with codes off (`X-GE-Password`, D-47). Every action is recorded in `access_events`.
 */

const tags = ['admin'];
const admin = routeAccess({ scope: 'admin' });
const userParams = z.object({ userId: z.uuid() });
const universeParams = z.object({ universeId: z.uuid() });
const ADMIN_DOC =
  'Admins only (M8-T13): everyone else gets a 404. Disabling, deleting, a role change, a reset link, a transfer and deleting a universe need a confirmation: a current two-factor code in `X-GE-TOTP`, or, for an account with codes off, its password in `X-GE-Password`, percent-encoded (D-47).';

export const adminRoutes: FastifyPluginCallbackZod<{
  db: Database;
  auth: AuthContext | null;
}> = (app, { db, auth }, done) => {
  const fresh = requireConfirmation(auth);
  /** The site's address, for links: the admin scope means there are accounts, hence a URL. */
  const publicUrl = (): string => {
    if (!auth) throw new Error('Admin routes ran without accounts.');
    return auth.publicUrl;
  };
  /** A confirmation (a current code, or the password, D-47), for a change that needs one. */
  const freshCode = async (request: FastifyRequest) => {
    if (!auth || !request.account) return;
    await checkConfirmation(auth, request.account, confirmationOf(request));
  };

  app.get(
    '/admin/users',
    {
      schema: {
        tags,
        operationId: 'admin.users.list',
        summary: 'Every account',
        description: `${ADMIN_DOC} Each with its role, last sign-in, universes owned, media used of its quota, and whether it's disabled.`,
        ...admin,
        response: { 200: z.object({ data: z.array(AdminUserRead) }), ...problemResponses },
      },
    },
    async () => ({ data: await listAdminUsers(db) }),
  );

  app.post(
    '/admin/invites',
    {
      schema: {
        tags,
        operationId: 'admin.invites.create',
        summary: 'Make an invite link',
        description: `${ADMIN_DOC} The link makes one account of the role given, within 7 days. It's returned once and never stored: pass it on.`,
        ...admin,
        body: AdminInviteCreate,
        response: { 201: envelope(AdminLinkRead), ...problemResponses },
      },
    },
    async (request, reply) => {
      const data = await db.transaction((tx) =>
        createInvite(tx, request.requester, request.body.role, publicUrl()),
      );
      return reply.code(201).send({ data });
    },
  );

  app.post(
    '/admin/users/:userId/reset-link',
    {
      schema: {
        tags,
        operationId: 'admin.users.resetLink',
        summary: 'Make a reset link for an account',
        description: `${ADMIN_DOC} For someone who forgot their password or lost their codes: within 24 hours, the link sets a new password and new codes, and signs out the account's sessions. Returned once.`,
        ...admin,
        params: userParams,
        response: { 201: envelope(AdminLinkRead), ...problemResponses },
      },
      preHandler: fresh,
    },
    async (request, reply) => {
      const data = await db.transaction((tx) =>
        createResetLink(tx, request.requester, request.params.userId, publicUrl()),
      );
      return reply.code(201).send({ data });
    },
  );

  app.patch(
    '/admin/users/:userId',
    {
      schema: {
        tags,
        operationId: 'admin.users.update',
        summary: 'Change an account’s role, status or quota',
        description: `${ADMIN_DOC} Disabling signs the account out at once. The last admin who can sign in can't be demoted or disabled. Changing the role or the status needs a code; the quota doesn't.`,
        ...admin,
        params: userParams,
        body: AdminUserUpdate,
        response: { 200: envelope(AdminUserRead), ...problemResponses },
      },
    },
    async (request) => {
      if (request.body.role !== undefined || request.body.disabled !== undefined) {
        await freshCode(request);
      }
      const data = await db.transaction((tx) =>
        updateAdminUser(tx, request.requester, request.params.userId, request.body),
      );
      return { data };
    },
  );

  app.delete(
    '/admin/users/:userId',
    {
      schema: {
        tags,
        operationId: 'admin.users.delete',
        summary: 'Delete an account',
        description: `${ADMIN_DOC} Only once it owns no universes: transfer or delete them first, so deleting an account never deletes content.`,
        ...admin,
        params: userParams,
        response: { 204: z.null(), ...problemResponses },
      },
      preHandler: fresh,
    },
    async (request, reply) => {
      await db.transaction((tx) => deleteAdminUser(tx, request.requester, request.params.userId));
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/admin/universes',
    {
      schema: {
        tags,
        operationId: 'admin.universes.list',
        summary: 'Every universe, without its content',
        description: `${ADMIN_DOC} Name, owner, visibility, object count, media and last change: enough to manage them, nothing of what's in them.`,
        ...admin,
        response: { 200: z.object({ data: z.array(AdminUniverseRead) }), ...problemResponses },
      },
    },
    async () => ({ data: await listAdminUniverses(db) }),
  );

  app.patch(
    '/admin/universes/:universeId',
    {
      schema: {
        tags,
        operationId: 'admin.universes.update',
        summary: 'Transfer a universe, or take it down',
        description: `${ADMIN_DOC} \`{ "owner": username }\` hands it to that account, whose quota must have room; the previous owner keeps no access (needs a code). \`{ "visibility": "private" }\` takes it down: only its owner and members can reach it, and its share link stops.`,
        ...admin,
        params: universeParams,
        body: AdminUniverseUpdate,
        response: { 200: envelope(AdminUniverseRead), ...problemResponses },
      },
    },
    async (request) => {
      const { universeId } = request.params;
      const { body } = request;
      if ('owner' in body) await freshCode(request);
      await db.transaction((tx) =>
        'owner' in body
          ? transferUniverse(tx, request.requester, universeId, body.owner, {
              previousOwnerKeeps: false,
            })
          : takeDownUniverse(tx, request.requester, universeId),
      );
      const data = (await listAdminUniverses(db)).find((universe) => universe.id === universeId);
      if (!data) throw new NotFound('universe', universeId);
      return { data };
    },
  );

  app.delete(
    '/admin/universes/:universeId',
    {
      schema: {
        tags,
        operationId: 'admin.universes.delete',
        summary: 'Delete a universe and everything in it',
        description: `${ADMIN_DOC} As its owner could, without opening it.`,
        ...admin,
        params: universeParams,
        response: { 204: z.null(), ...problemResponses },
      },
      preHandler: fresh,
    },
    async (request, reply) => {
      const { universeId } = request.params;
      // Content goes, so it's a change batch, like the owner's delete (D-41: History won't
      // undo it with accounts).
      await withBatch(db, actorOf(request), 'Delete universe (admin)', async (tx) => {
        const universe = await getUniverse(tx, universeId);
        await recordAccessEvent(tx, request.requester, {
          action: 'universe.delete',
          universeId,
          detail: { slug: universe.slug, name: universe.namePlain, byAdmin: true },
        });
        await deleteUniverse(tx, universeId, universe.version);
      });
      return reply.code(204).send(null);
    },
  );

  app.get(
    '/admin/events',
    {
      schema: {
        tags,
        operationId: 'admin.events.list',
        summary: 'The account and access log',
        description: `${ADMIN_DOC} Every account and sharing change, newest first: who did it, what, and to which account or universe.`,
        ...admin,
        querystring: listQuery,
        response: { 200: page(AccessEventRead), ...problemResponses },
      },
    },
    async (request) => {
      const { cursor, limit } = request.query;
      const result = await listAccessEvents(db, { limit, ...(cursor ? { cursor } : {}) });
      return { data: result.items, nextCursor: result.nextCursor } as never;
    },
  );

  done();
};
