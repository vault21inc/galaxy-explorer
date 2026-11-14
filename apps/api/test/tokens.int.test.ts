import { schema, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { buildServer, type ApiServer } from '../src/server.ts';
import {
  authConfig,
  codeFor,
  makeAccount,
  ORIGIN,
  sessionOf,
  signIn,
  type TestAccount,
} from './auth/auth-world.ts';

/**
 * API tokens (M8-T2, data-model §3.8): made on the account page, sent as
 * `Authorization: Bearer ge_…`, acting for their account and never more. The access contract
 * suite tries every route with tokens; this checks what tokens do, and the Done-when items:
 * a read token can't write, a revoked token gets 401, a universe-scoped token can't touch
 * another universe, a token loses a universe when its account does, and account, sharing and
 * admin routes refuse tokens.
 *
 * Each account signs in with the current step's code, so the fresh code that making a token
 * asks for is the next step's (`codeFor(secret, 30)`): each code works once.
 */

type Who = 'owner' | 'alice' | 'admin';

interface Call {
  status: number;
  body: Record<string, any>;
  headers: Record<string, unknown>;
}

async function setUp(db: Database, url: string) {
  const app: ApiServer = await buildServer(authConfig(url));
  const accounts: Record<Who, TestAccount> = {
    owner: await makeAccount(db, 'owner'),
    alice: await makeAccount(db, 'alice'),
    admin: await makeAccount(db, 'admin', { role: 'admin' }),
  };
  const sessions = {} as Record<Who, Record<string, string>>;
  for (const [who, account] of Object.entries(accounts)) {
    sessions[who as Who] = sessionOf(await signIn(app, account, await codeFor(account.secret)));
  }
  const send = async (
    headers: Record<string, string>,
    method: string,
    path: string,
    payload?: unknown,
  ): Promise<Call> => {
    const response = await app.inject({
      method: method as 'GET',
      url: `/api/v1${path}`,
      headers,
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return {
      status: response.statusCode,
      body: response.body ? response.json<Record<string, any>>() : {},
      headers: response.headers,
    };
  };
  /** A request from the site's own pages, signed in as `who`. */
  const as = (who: Who, method: string, path: string, payload?: unknown, extra = {}) =>
    send({ ...sessions[who], ...ORIGIN, ...extra }, method, path, payload);
  /** A request made with a token, as an agent makes it: no cookie, no Origin. */
  const withToken = (secret: string, method: string, path: string, payload?: unknown) =>
    send({ authorization: `Bearer ${secret}` }, method, path, payload);
  /** Makes a token on the account page, with a fresh code; returns its id and text. */
  const makeToken = async (
    who: Who,
    body: { name: string; scope: 'read' | 'write'; universeId?: string },
  ) => {
    // Each code works once: forget the last one, as admin.int.test.ts does, since this is
    // about tokens, not codes.
    await db
      .update(schema.users)
      .set({ totpLastStep: null })
      .where(eq(schema.users.id, accounts[who].id));
    const made = await as(who, 'POST', '/auth/tokens', body, {
      'x-ge-totp': await codeFor(accounts[who].secret, 30),
    });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    return made.body.data as { token: { id: string }; secret: string };
  };
  const universe = async (who: Who, slug: string) => {
    const made = await as(who, 'POST', '/universes', { slug, name: rt.plain(slug) });
    expect(made.status).toBe(201);
    return made.body.data as { id: string; version: number };
  };
  return { app, accounts, sessions, as, withToken, makeToken, universe };
}

describe('API tokens (M8-T2)', () => {
  it('are made with a code, shown once, listed with their last use, and revoked', () =>
    withTestDb(async (db, url) => {
      const { app, accounts, as, withToken, makeToken } = await setUp(db, url);
      try {
        // Without a code, no token: one outlives the session that made it.
        const noCode = await as('owner', 'POST', '/auth/tokens', { name: 'x', scope: 'read' });
        expect(noCode.status).toBe(403);

        const made = await makeToken('owner', { name: 'claude-code', scope: 'write' });
        expect(made.secret).toMatch(/^ge_[A-Za-z0-9_-]{43}$/);
        // Only its hash is kept.
        const [row] = await db.select().from(schema.apiTokens);
        expect(row?.tokenHash.toString('utf8')).not.toContain(made.secret);

        const before = await as('owner', 'GET', '/auth/tokens');
        expect(before.body.data).toMatchObject([
          { name: 'claude-code', scope: 'write', universe: null, lastUsedAt: null },
        ]);
        expect(JSON.stringify(before.body)).not.toContain(made.secret);

        const me = await withToken(made.secret, 'GET', '/auth/token');
        expect(me.status).toBe(200);
        expect(me.body.data).toMatchObject({ name: 'claude-code', username: 'owner' });
        const used = await as('owner', 'GET', '/auth/tokens');
        expect(used.body.data[0].lastUsedAt).not.toBeNull();

        // Revoked: it stops at once, with a 401 that says how bearer tokens fail.
        const id = made.token.id;
        expect((await as('owner', 'DELETE', `/auth/tokens/${id}`)).status).toBe(204);
        const after = await withToken(made.secret, 'GET', '/universes');
        expect(after.status).toBe(401);
        expect(after.headers['www-authenticate']).toBe('Bearer error="invalid_token"');
        expect((await as('owner', 'GET', '/auth/tokens')).body.data).toEqual([]);
        expect((await as('owner', 'DELETE', `/auth/tokens/${id}`)).status).toBe(404);
        // Someone else's token isn't yours to revoke.
        const alices = await makeToken('alice', { name: 'alice', scope: 'read' });
        expect((await as('owner', 'DELETE', `/auth/tokens/${alices.token.id}`)).status).toBe(404);

        // Without a token, the token route says to send one; with nonsense, 401 too.
        expect((await as('owner', 'GET', '/auth/token')).status).toBe(401);
        expect((await withToken('ge_nonsense', 'GET', '/universes')).status).toBe(401);

        const events = await db
          .select()
          .from(schema.accessEvents)
          .where(eq(schema.accessEvents.userId, accounts.owner.id))
          .orderBy(asc(schema.accessEvents.id));
        expect(events.map((event) => [event.action, event.detail])).toEqual([
          ['token.create', { name: 'claude-code', scope: 'write' }],
          ['token.revoke', { name: 'claude-code' }],
        ]);
      } finally {
        await app.close();
      }
    }));

  it('act for their account: changes are recorded under the token’s name', () =>
    withTestDb(async (db, url) => {
      const { app, withToken, makeToken, universe } = await setUp(db, url);
      try {
        const own = await universe('owner', 'own');
        const { secret } = await makeToken('owner', { name: 'claude-code', scope: 'write' });
        // No Origin: an agent isn't a page, and a token isn't a cookie a page could misuse.
        const made = await withToken(secret, 'POST', `/universes/${own.id}/characters`, {
          name: rt.plain('Aemos'),
        });
        expect(made.status).toBe(201);
        const batchId = made.headers['x-ge-batch-id'] as string;
        const [batch] = await db
          .select()
          .from(schema.changeBatches)
          .where(eq(schema.changeBatches.id, batchId));
        expect(batch).toMatchObject({
          actorType: 'api_token',
          actorLabel: 'token: claude-code, for owner',
        });
        // The universe a token makes is its account's, private, as from the site.
        const fresh = await withToken(secret, 'POST', '/universes', {
          slug: 'agent-made',
          name: rt.plain('Agent made'),
        });
        expect(fresh.status).toBe(201);
        expect(fresh.body.data).toMatchObject({ owner: 'owner', visibility: 'private' });
      } finally {
        await app.close();
      }
    }));

  it('a read token reads, as a viewer would, and can’t write', () =>
    withTestDb(async (db, url) => {
      const { app, as, withToken, makeToken, universe } = await setUp(db, url);
      try {
        const own = await universe('owner', 'own');
        const map = await as('owner', 'POST', `/universes/${own.id}/maps`, {
          slug: 'main',
          name: rt.plain('Main'),
        });
        const { secret } = await makeToken('owner', { name: 'reader', scope: 'read' });
        const read = await withToken(secret, 'GET', `/universes/${own.id}`);
        expect(read.status).toBe(200);
        expect(read.body.data.access).toBe('read');

        const write = await withToken(secret, 'POST', `/universes/${own.id}/characters`, {
          name: rt.plain('Nope'),
        });
        expect(write.status).toBe(403);
        expect(write.body.detail).toMatch(/can only read/);
        const batch = await withToken(secret, 'POST', '/batch', {
          description: 'nope',
          operations: [
            { op: 'create', kind: 'character', universeId: own.id, data: { name: rt.plain('X') } },
          ],
        });
        expect(batch.status).toBe(403);
        expect((await withToken(secret, 'POST', '/universes', { slug: 'x' })).status).toBe(403);
        // No drafts, and none of what only editors see.
        const mapId = map.body.data.id as string;
        const drafts = await withToken(secret, 'GET', `/maps/${mapId}/objects?includeDrafts=true`);
        expect(drafts.status).toBe(403);
        expect((await withToken(secret, 'GET', `/universes/${own.id}/history`)).status).toBe(403);
      } finally {
        await app.close();
      }
    }));

  it('a token for one universe reaches no other', () =>
    withTestDb(async (db, url) => {
      const { app, accounts, sessions, as, withToken, makeToken, universe } = await setUp(db, url);
      try {
        const one = await universe('owner', 'one');
        const other = await universe('owner', 'other');
        const alices = await universe('alice', 'alices');
        const { secret } = await makeToken('owner', {
          name: 'one only',
          scope: 'write',
          universeId: one.id,
        });
        const listed = await as('owner', 'GET', '/auth/tokens');
        expect(listed.body.data[0].universe).toEqual({ id: one.id, slug: 'one', name: 'one' });

        const list = await withToken(secret, 'GET', '/universes');
        expect(list.body.data.map((u: { slug: string }) => u.slug)).toEqual(['one']);
        const write = (id: string) =>
          withToken(secret, 'POST', `/universes/${id}/characters`, { name: rt.plain('X') });
        expect((await write(one.id)).status).toBe(201);
        // The account's other universe: 403, since the account itself may see it.
        const elsewhere = await write(other.id);
        expect(elsewhere.status).toBe(403);
        expect(elsewhere.body.detail).toMatch(/another universe/);
        expect((await withToken(secret, 'GET', `/universes/${other.id}`)).status).toBe(403);
        // Someone else's private universe: 404, as for anyone who can't see it.
        expect((await write(alices.id)).status).toBe(404);
        // A batch that strays outside it is refused whole.
        const batch = await withToken(secret, 'POST', '/batch', {
          description: 'stray',
          operations: [
            { op: 'create', kind: 'character', universeId: one.id, data: { name: rt.plain('A') } },
            {
              op: 'create',
              kind: 'character',
              universeId: other.id,
              data: { name: rt.plain('B') },
            },
          ],
        });
        expect(batch.status).toBe(404);
        // And it makes no new universes.
        const made = await withToken(secret, 'POST', '/universes', {
          slug: 'new',
          name: rt.plain('New'),
        });
        expect(made.status).toBe(403);
        // A token can't be made for a universe its account can't see: it's as if it weren't there.
        await db.update(schema.users).set({ totpLastStep: null });
        const hidden = await as(
          'owner',
          'POST',
          '/auth/tokens',
          { name: 'sneaky', scope: 'read', universeId: alices.id },
          { 'x-ge-totp': await codeFor(accounts.owner.secret, 30) },
        );
        expect(hidden.status).toBe(404);

        // Nor for one it reads only through a share link: a token's requests carry none.
        const linkOnly = await as('alice', 'PATCH', `/universes/${alices.id}`, {
          visibility: 'link',
          version: alices.version,
        });
        expect(linkOnly.status).toBe(200);
        const key = linkOnly.body.data.shareKey as string;
        const withLink = { cookie: `${sessions.owner.cookie ?? ''}; ge_share_${alices.id}=${key}` };
        expect(
          (await as('owner', 'GET', `/universes/${alices.id}`, undefined, withLink)).status,
        ).toBe(200);
        await db.update(schema.users).set({ totpLastStep: null });
        const linked = await as(
          'owner',
          'POST',
          '/auth/tokens',
          { name: 'linked', scope: 'read', universeId: alices.id },
          { ...withLink, 'x-ge-totp': await codeFor(accounts.owner.secret, 30) },
        );
        expect(linked.status).toBe(404);
      } finally {
        await app.close();
      }
    }));

  it('a token loses a universe when its account does, and stops when it’s disabled', () =>
    withTestDb(async (db, url) => {
      const { app, accounts, as, withToken, makeToken, universe } = await setUp(db, url);
      try {
        const owners = await universe('owner', 'shared');
        await as('owner', 'PUT', `/universes/${owners.id}/members/alice`, { role: 'editor' });
        const { secret } = await makeToken('alice', { name: 'alice agent', scope: 'write' });
        const write = () =>
          withToken(secret, 'POST', `/universes/${owners.id}/characters`, {
            name: rt.plain('Hers'),
          });
        expect((await write()).status).toBe(201);
        // An editor's token can't change who has access: that's the owner's, and a session's.
        const share = await withToken(secret, 'PUT', `/universes/${owners.id}/members/admin`, {
          role: 'viewer',
        });
        expect(share.status).toBe(403);

        // Made a viewer: the token reads, but writes no more.
        await as('owner', 'PUT', `/universes/${owners.id}/members/alice`, { role: 'viewer' });
        expect((await write()).status).toBe(403);
        expect((await withToken(secret, 'GET', `/universes/${owners.id}`)).status).toBe(200);
        // Removed: the universe is gone for the token too.
        await as('owner', 'DELETE', `/universes/${owners.id}/members/alice`);
        expect((await withToken(secret, 'GET', `/universes/${owners.id}`)).status).toBe(404);

        // Disabled: every token of the account stops at the next request.
        await db
          .update(schema.users)
          .set({ disabledAt: new Date() })
          .where(eq(schema.users.id, accounts.alice.id));
        expect((await withToken(secret, 'GET', '/universes')).status).toBe(401);
      } finally {
        await app.close();
      }
    }));

  it('are refused on the account, sharing and admin routes', () =>
    withTestDb(async (db, url) => {
      const { app, withToken, makeToken, universe } = await setUp(db, url);
      try {
        const own = await universe('owner', 'own');
        const owner = await makeToken('owner', { name: 'owner agent', scope: 'write' });
        const admin = await makeToken('admin', { name: 'admin agent', scope: 'write' });
        const refused = async (secret: string, method: string, path: string, body?: unknown) => {
          const response = await withToken(secret, method, path, body);
          return response.status;
        };
        // The account's own settings, including its tokens: a token can't make more tokens.
        for (const [method, path] of [
          ['GET', '/auth/me'],
          ['GET', '/auth/sessions'],
          ['DELETE', '/auth/sessions'],
          ['GET', '/auth/tokens'],
          ['POST', '/auth/tokens'],
          ['GET', '/auth/storage'],
          ['POST', '/auth/password'],
          ['POST', '/auth/logout'],
        ] as const) {
          expect(await refused(owner.secret, method, path, {}), `${method} ${path}`).toBe(403);
        }
        // Sharing, the visibility, and deleting the universe.
        const universePath = `/universes/${own.id}`;
        expect(await refused(owner.secret, 'GET', `${universePath}/members`)).toBe(403);
        expect(
          await refused(owner.secret, 'PUT', `${universePath}/members/alice`, { role: 'viewer' }),
        ).toBe(403);
        expect(await refused(owner.secret, 'POST', `${universePath}/share-key`)).toBe(403);
        expect(
          await refused(owner.secret, 'PATCH', universePath, { visibility: 'public', version: 1 }),
        ).toBe(403);
        expect(await refused(owner.secret, 'DELETE', universePath, { version: 1 })).toBe(403);
        // Its content, though, is the token's to change: the universe's name, say.
        const renamed = await withToken(owner.secret, 'PATCH', universePath, {
          name: rt.plain('Renamed'),
          version: own.version,
        });
        expect(renamed.status).toBe(200);
        // An admin's token is no admin: the admin routes aren't there for it.
        expect(await refused(admin.secret, 'GET', '/admin/users')).toBe(404);
        expect(await refused(admin.secret, 'POST', '/admin/invites', { role: 'member' })).toBe(404);
      } finally {
        await app.close();
      }
    }));
});
