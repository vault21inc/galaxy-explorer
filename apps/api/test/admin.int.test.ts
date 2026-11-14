import { schema, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { ApiServer } from '../src/server.ts';
import { buildServer } from '../src/server.ts';
import {
  authServer,
  codeFor,
  makeAccount,
  ORIGIN,
  sessionOf,
  signIn,
  whoAmI,
  type TestAccount,
} from './auth/auth-world.ts';
import { testConfig } from './helpers.ts';

/** The account page's routes and the admin routes (M8-T13). */

type Who = 'admin' | 'member' | 'other' | 'anonymous';

async function setUp(db: Database, url: string) {
  const app = await authServer(url);
  const accounts: Record<Exclude<Who, 'anonymous'>, TestAccount> = {
    admin: await makeAccount(db, 'admin', { role: 'admin' }),
    member: await makeAccount(db, 'member'),
    other: await makeAccount(db, 'other'),
  };
  const headers = { anonymous: {} } as Record<Who, Record<string, string>>;
  for (const [who, account] of Object.entries(accounts)) {
    headers[who as Who] = sessionOf(await signIn(app, account, await codeFor(account.secret)));
  }
  /**
   * A current code for `who`. Each code works once, and the next is 30 seconds away, so the
   * tests forget the account's last code first: these tests are about the routes, M8-T1's about
   * codes being single-use.
   */
  const fresh = async (who: Exclude<Who, 'anonymous'>) => {
    await db
      .update(schema.users)
      .set({ totpLastStep: null })
      .where(eq(schema.users.id, accounts[who].id));
    return { 'x-ge-totp': await codeFor(accounts[who].secret) };
  };
  const as = async (
    who: Who,
    method: string,
    path: string,
    payload?: unknown,
    extra: Record<string, string> = {},
  ) => {
    const response = await app.inject({
      method: method as 'GET',
      url: `/api/v1${path}`,
      headers: { ...headers[who], ...ORIGIN, ...extra },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return {
      status: response.statusCode,
      body: response.body ? response.json<Record<string, any>>() : {},
    };
  };
  /** A universe of `who`'s, with one object in it. */
  const universe = async (who: Exclude<Who, 'anonymous'>, slug: string) => {
    const made = await as(who, 'POST', '/universes', { slug, name: rt.plain(slug) });
    const id = made.body.data.id as string;
    const map = await as(who, 'POST', `/universes/${id}/maps`, {
      slug: 'main',
      name: rt.plain('Main'),
    });
    await as(who, 'POST', `/maps/${String(map.body.data.id)}/objects`, {
      name: rt.plain('Gudrun'),
      baseType: 'system',
    });
    return id;
  };
  const events = async () =>
    (await as('admin', 'GET', '/admin/events')).body.data as {
      action: string;
      actor: string;
      user: string | null;
      detail: Record<string, unknown>;
    }[];
  return { app, accounts, headers, fresh, as, universe, events };
}

const run = (fn: (world: Awaited<ReturnType<typeof setUp>>, db: Database) => Promise<void>) =>
  withTestDb(async (db, url) => {
    const world = await setUp(db, url);
    try {
      await fn(world, db);
    } finally {
      await world.app.close();
    }
  });

/** Every admin route in the OpenAPI document, with its path filled in. */
function adminRoutes(app: ApiServer) {
  const doc = app.swagger() as {
    paths: Record<string, Record<string, { 'x-ge-access'?: { scope: string } }>>;
  };
  return Object.entries(doc.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([, op]) => op['x-ge-access']?.scope === 'admin')
      .map(([method, op]) => ({
        method: method.toUpperCase(),
        url: path.replace(/\{[A-Za-z]+\}/g, '01a1d810-0000-7000-8000-000000000000'),
        op,
      })),
  );
}

describe('the admin routes', () => {
  it('are "not found" for anyone but an admin', () =>
    run(async (world) => {
      const routes = adminRoutes(world.app);
      expect(routes.length).toBeGreaterThanOrEqual(9);
      for (const who of ['member', 'anonymous'] as const) {
        for (const route of routes) {
          const response = await world.app.inject({
            method: route.method as 'GET',
            url: route.url,
            headers: { ...world.headers[who], ...ORIGIN },
            ...(route.method === 'GET' ? {} : { payload: {} }),
          });
          expect(response.statusCode, `${route.method} ${route.url} as ${who}`).toBe(404);
          // Exactly like a route that doesn't exist.
          expect(response.json()).toMatchObject({
            detail: `No route for ${route.method} ${route.url}.`,
          });
        }
      }
      // And for everyone without accounts.
      const local = await buildServer(testConfig());
      try {
        for (const route of routes) {
          const response = await local.inject({ method: route.method as 'GET', url: route.url });
          expect(response.statusCode, `${route.method} ${route.url} locally`).toBe(404);
        }
      } finally {
        await local.close();
      }
    }));

  it('list accounts, and make invite and reset links', () =>
    run(async (world) => {
      await world.universe('member', 'members-own');
      const users = (await world.as('admin', 'GET', '/admin/users')).body.data as Record<
        string,
        unknown
      >[];
      expect(users.map((user) => user.username)).toEqual(['admin', 'member', 'other']);
      expect(users.find((user) => user.username === 'member')).toMatchObject({
        role: 'member',
        universesOwned: 1,
        mediaUsedBytes: 0,
        mediaQuotaBytes: 2 * 1024 ** 3,
        disabledAt: null,
      });

      const invite = await world.as('admin', 'POST', '/admin/invites', { role: 'admin' });
      expect(invite.status).toBe(201);
      const token = /\/link\/([A-Za-z0-9_-]+)$/.exec(invite.body.data.url as string)?.[1] ?? '';
      expect((await world.as('anonymous', 'GET', `/auth/links/${token}`)).body.data).toMatchObject({
        purpose: 'invite',
        state: 'ready',
      });

      // A reset link needs a current code.
      const memberId = world.accounts.member.id;
      expect((await world.as('admin', 'POST', `/admin/users/${memberId}/reset-link`)).status).toBe(
        403,
      );
      const reset = await world.as(
        'admin',
        'POST',
        `/admin/users/${memberId}/reset-link`,
        undefined,
        await world.fresh('admin'),
      );
      expect(reset.status).toBe(201);
      const resetToken = /\/link\/([A-Za-z0-9_-]+)$/.exec(reset.body.data.url as string)?.[1] ?? '';
      expect(
        (await world.as('anonymous', 'GET', `/auth/links/${resetToken}`)).body.data,
      ).toMatchObject({
        purpose: 'reset',
        username: 'member',
      });

      expect((await world.events()).slice(0, 2)).toMatchObject([
        { action: 'user.reset', actor: 'admin', user: 'member' },
        { action: 'invite.create', actor: 'admin', detail: { role: 'admin' } },
      ]);
    }));

  it('disable and enable accounts, change roles, and keep the last admin', () =>
    run(async (world) => {
      const member = world.accounts.member;
      const patch = async (userId: string, body: Record<string, unknown>, code = true) =>
        world.as(
          'admin',
          'PATCH',
          `/admin/users/${userId}`,
          body,
          code ? await world.fresh('admin') : {},
        );

      expect((await patch(member.id, { disabled: true }, false)).status).toBe(403);
      const disabled = await patch(member.id, { disabled: true });
      expect(disabled.body.data.disabledAt).not.toBeNull();
      // Signed out at once, and can't sign back in.
      expect(await whoAmI(world.app, world.headers.member)).toBeNull();
      expect((await signIn(world.app, member, await codeFor(member.secret, 30))).statusCode).toBe(
        401,
      );
      expect((await patch(member.id, { disabled: false })).body.data.disabledAt).toBeNull();
      await world.fresh('member');
      const back = await signIn(world.app, member, await codeFor(member.secret));
      expect(back.statusCode).toBe(200);
      // Disabling ended the old session: this is the member's new one.
      world.headers.member = sessionOf(back);

      // The last admin can be neither demoted nor disabled.
      const admin = world.accounts.admin;
      const demote = await patch(admin.id, { role: 'member' });
      expect(demote.status).toBe(422);
      expect(demote.body.detail).toMatch(/last admin/);
      expect((await patch(admin.id, { disabled: true })).status).toBe(422);
      // With a second admin, it can.
      expect((await patch(member.id, { role: 'admin' })).body.data.role).toBe('admin');
      expect((await patch(admin.id, { role: 'member' })).status).toBe(200);

      // No longer an admin, the first account gets 404s; the new admin sets a quota, with no
      // code needed.
      expect((await world.as('admin', 'GET', '/admin/users')).status).toBe(404);
      const quota = await world.as('member', 'PATCH', `/admin/users/${member.id}`, {
        mediaQuotaBytes: 1024,
      });
      expect(quota.body.data.mediaQuotaBytes).toBe(1024);

      expect((await world.as('member', 'GET', '/admin/events')).status).toBe(200);
      const actions = (
        (await world.as('member', 'GET', '/admin/events')).body.data as { action: string }[]
      ).map((event) => event.action);
      expect(actions).toEqual([
        'user.quota',
        'user.role',
        'user.role',
        'user.enable',
        'user.disable',
      ]);
    }));

  it('delete only an account that owns no universes', () =>
    run(async (world) => {
      await world.universe('member', 'members-own');
      const member = world.accounts.member.id;
      const refused = await world.as(
        'admin',
        'DELETE',
        `/admin/users/${member}`,
        undefined,
        await world.fresh('admin'),
      );
      expect(refused.status).toBe(422);
      expect(refused.body.detail).toBe('member owns 1 universe. Transfer or delete it first.');

      const other = world.accounts.other.id;
      expect((await world.as('admin', 'DELETE', `/admin/users/${other}`)).status).toBe(403);
      const deleted = await world.as(
        'admin',
        'DELETE',
        `/admin/users/${other}`,
        undefined,
        await world.fresh('admin'),
      );
      expect(deleted.status).toBe(204);
      expect(await whoAmI(world.app, world.headers.other)).toBeNull();
      // The log keeps the name once the account is gone.
      expect((await world.events())[0]).toMatchObject({
        action: 'user.delete',
        user: null,
        detail: { username: 'other' },
      });
    }));
});

describe('the admin universe routes', () => {
  it('list universes without opening them', () =>
    run(async (world) => {
      const id = await world.universe('member', 'secret');
      expect((await world.as('admin', 'GET', `/universes/${id}`)).status).toBe(404);
      const listed = (await world.as('admin', 'GET', '/admin/universes')).body.data as Record<
        string,
        unknown
      >[];
      expect(listed).toEqual([
        expect.objectContaining({
          id,
          slug: 'secret',
          name: 'secret',
          owner: 'member',
          visibility: 'private',
          objectCount: 1,
          mediaBytes: 0,
        }),
      ]);
      // Listing it gave the admin no more access than before.
      expect((await world.as('admin', 'GET', `/universes/${id}`)).status).toBe(404);
      expect((await world.as('admin', 'GET', `/universes/by-slug/secret`)).status).toBe(404);
    }));

  it('transfer a universe, leaving the previous owner no access, and take one down', () =>
    run(async (world) => {
      const id = await world.universe('member', 'moving');
      expect(
        (await world.as('admin', 'PATCH', `/admin/universes/${id}`, { owner: 'other' })).status,
      ).toBe(403);
      const moved = await world.as(
        'admin',
        'PATCH',
        `/admin/universes/${id}`,
        { owner: 'other' },
        await world.fresh('admin'),
      );
      expect(moved.body.data).toMatchObject({ owner: 'other' });
      expect((await world.as('other', 'GET', `/universes/${id}`)).body.data).toMatchObject({
        access: 'own',
      });
      expect((await world.as('member', 'GET', `/universes/${id}`)).status).toBe(404);
      expect((await world.events())[0]).toMatchObject({
        action: 'universe.transfer',
        user: 'other',
        universe: 'moving',
        detail: { byAdmin: true },
      });

      // A takedown: public, then private again by an admin, without a code.
      const current = await world.as('other', 'GET', `/universes/${id}`);
      await world.as('other', 'PATCH', `/universes/${id}`, {
        visibility: 'link',
        version: current.body.data.version,
      });
      expect((await world.as('anonymous', 'GET', '/universes/by-slug/moving')).status).toBe(404);
      const down = await world.as('admin', 'PATCH', `/admin/universes/${id}`, {
        visibility: 'private',
      });
      expect(down.body.data).toMatchObject({ visibility: 'private' });
      expect((await world.events())[0]).toMatchObject({
        action: 'universe.takedown',
        detail: { from: 'link' },
      });
    }));

  it('delete a universe, with a code', () =>
    run(async (world) => {
      const id = await world.universe('member', 'doomed');
      expect((await world.as('admin', 'DELETE', `/admin/universes/${id}`)).status).toBe(403);
      const gone = await world.as(
        'admin',
        'DELETE',
        `/admin/universes/${id}`,
        undefined,
        await world.fresh('admin'),
      );
      expect(gone.status).toBe(204);
      expect((await world.as('member', 'GET', `/universes/${id}`)).status).toBe(404);
      expect((await world.events())[0]).toMatchObject({
        action: 'universe.delete',
        universe: null,
        detail: { slug: 'doomed', byAdmin: true },
      });
    }));

  it('page the log, newest first', () =>
    run(async (world) => {
      for (const role of ['member', 'member', 'admin'] as const) {
        await world.as('admin', 'POST', '/admin/invites', { role });
      }
      const first = await world.as('admin', 'GET', '/admin/events?limit=2');
      expect(
        (first.body.data as { detail: { role: string } }[]).map((event) => event.detail.role),
      ).toEqual(['admin', 'member']);
      const rest = await world.as(
        'admin',
        'GET',
        `/admin/events?limit=2&cursor=${String(first.body.nextCursor)}`,
      );
      expect(rest.body.data).toHaveLength(1);
      expect(rest.body.nextCursor).toBeNull();
    }));
});

describe('the account page', () => {
  it('changes the password with the current one and a code, signing out other devices', () =>
    run(async (world) => {
      const member = world.accounts.member;
      await world.fresh('member');
      const laptop = sessionOf(await signIn(world.app, member, await codeFor(member.secret)));
      const change = (body: Record<string, unknown>) =>
        world.as('member', 'POST', '/auth/password', body);
      const newPassword = 'an entirely new long password';
      expect(
        (await change({ currentPassword: 'wrong password', newPassword, totp: '000000' })).status,
      ).toBe(403);
      await world.fresh('member');
      expect(
        (await change({ currentPassword: member.password, newPassword, totp: '000000' })).status,
      ).toBe(403);
      const changed = await change({
        currentPassword: member.password,
        newPassword,
        totp: (await world.fresh('member'))['x-ge-totp'],
      });
      expect(changed.status).toBe(204);
      expect(await whoAmI(world.app, world.headers.member)).toBe('member');
      expect(await whoAmI(world.app, laptop)).toBeNull();
      await world.fresh('member');
      expect(
        (
          await signIn(
            world.app,
            { ...member, password: newPassword },
            await codeFor(member.secret),
          )
        ).statusCode,
      ).toBe(200);
      expect((await world.events())[0]).toMatchObject({ action: 'user.password', actor: 'member' });
    }));

  it('shows the media used, by universe', () =>
    run(async (world) => {
      const id = await world.universe('member', 'mine');
      const storage = await world.as('member', 'GET', '/auth/storage');
      expect(storage.body.data).toEqual({
        quotaBytes: 2 * 1024 ** 3,
        usedBytes: 0,
        universes: [{ id, slug: 'mine', name: 'mine', bytes: 0 }],
      });
      expect((await world.as('anonymous', 'GET', '/auth/storage')).status).toBe(401);
    }));
});
