import { schema, withBatch, type Database } from '@ge/db';
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
 * Sharing a universe (M8-T12, ux.md §13): members, leaving, the share link and its cookie,
 * transfer, deletion with a fresh code, and the access log. The access contract suite checks
 * who may call each route; this checks what the routes do.
 *
 * Each account signs in with the code of the current 30-second step, so the fresh code a
 * transfer or deletion asks for is the next step's (`codeFor(secret, 30)`): each code works
 * once, and the API accepts one step either side of now.
 */

type Who = 'owner' | 'alice' | 'bob' | 'anonymous';

interface Call {
  status: number;
  body: Record<string, any>;
  headers: Record<string, unknown>;
  cookies: { name: string; value: string }[];
}

async function setUp(db: Database, url: string) {
  const app: ApiServer = await buildServer(authConfig(url));
  const accounts: Record<Exclude<Who, 'anonymous'>, TestAccount> = {
    owner: await makeAccount(db, 'owner'),
    alice: await makeAccount(db, 'alice'),
    bob: await makeAccount(db, 'bob'),
  };
  const headers = { anonymous: {} } as Record<Who, Record<string, string>>;
  for (const [who, account] of Object.entries(accounts)) {
    headers[who as Who] = sessionOf(await signIn(app, account, await codeFor(account.secret)));
  }
  const as = async (
    who: Who,
    method: string,
    path: string,
    payload?: unknown,
    extra: Record<string, string> = {},
  ): Promise<Call> => {
    const response = await app.inject({
      method: method as 'GET',
      url: `/api/v1${path}`,
      headers: { ...headers[who], ...ORIGIN, ...extra },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return {
      status: response.statusCode,
      body: response.body ? response.json<Record<string, any>>() : {},
      headers: response.headers,
      cookies: response.cookies,
    };
  };
  /** A fresh two-factor code for an account, for `X-GE-TOTP`. */
  const fresh = async (who: Exclude<Who, 'anonymous'>) => ({
    'x-ge-totp': await codeFor(accounts[who].secret, 30),
  });
  const made = await as('owner', 'POST', '/universes', {
    slug: 'shared',
    name: rt.plain('Shared'),
  });
  const universe = made.body.data as { id: string; version: number };
  const events = async () =>
    db
      .select()
      .from(schema.accessEvents)
      .where(eq(schema.accessEvents.universeId, universe.id))
      .orderBy(asc(schema.accessEvents.id));
  return { app, accounts, as, fresh, universe, events };
}

describe('members (M8-T12)', () => {
  it('are added, changed and removed by the owner, each change logged', () =>
    withTestDb(async (db, url) => {
      const { app, accounts, as, universe, events } = await setUp(db, url);
      try {
        const members = `/universes/${universe.id}/members`;
        // Shared with nobody yet: alice can't even tell it's there.
        expect((await as('alice', 'GET', `/universes/${universe.id}`)).status).toBe(404);

        const added = await as('owner', 'PUT', `${members}/alice`, { role: 'viewer' });
        expect(added.status).toBe(200);
        expect(added.body.data).toMatchObject({
          username: 'alice',
          role: 'viewer',
          addedBy: 'owner',
        });
        const read = await as('alice', 'GET', `/universes/${universe.id}`);
        expect(read.body.data).toMatchObject({ access: 'read', role: 'viewer', shareKey: null });

        // The same role again changes nothing and logs nothing.
        await as('owner', 'PUT', `${members}/alice`, { role: 'viewer' });
        const changed = await as('owner', 'PUT', `${members}/alice`, { role: 'editor' });
        expect(changed.body.data.role).toBe('editor');
        expect((await as('alice', 'GET', `/universes/${universe.id}`)).body.data.access).toBe(
          'edit',
        );

        // Editors see who else is in, read-only; viewers don't.
        await as('owner', 'PUT', `${members}/bob`, { role: 'viewer' });
        const listed = await as('alice', 'GET', members);
        expect(listed.body.data.map((m: { username: string }) => m.username)).toEqual([
          'alice',
          'bob',
        ]);
        expect((await as('bob', 'GET', members)).status).toBe(403);

        expect((await as('owner', 'DELETE', `${members}/bob`)).status).toBe(204);
        expect((await as('bob', 'GET', `/universes/${universe.id}`)).status).toBe(404);
        const again = await as('owner', 'DELETE', `${members}/bob`);
        expect(again.status).toBe(404);
        expect(again.body.detail).toBe('This universe isn’t shared with bob.');

        const log = await events();
        expect(log.map((event) => [event.action, event.actorLabel, event.userId])).toEqual([
          ['member.add', 'owner', accounts.alice.id],
          ['member.role', 'owner', accounts.alice.id],
          ['member.add', 'owner', accounts.bob.id],
          ['member.remove', 'owner', accounts.bob.id],
        ]);
        expect(log[1]?.detail).toEqual({ username: 'alice', from: 'viewer', to: 'editor' });
      } finally {
        await app.close();
      }
    }));

  it('are managed by the owner only, by exact username', () =>
    withTestDb(async (db, url) => {
      const { app, as, universe } = await setUp(db, url);
      try {
        const members = `/universes/${universe.id}/members`;
        await as('owner', 'PUT', `${members}/alice`, { role: 'editor' });
        // An editor changes content, not who has access.
        expect((await as('alice', 'PUT', `${members}/bob`, { role: 'viewer' })).status).toBe(403);
        expect((await as('alice', 'DELETE', `${members}/alice`)).status).toBe(403);

        const unknown = await as('owner', 'PUT', `${members}/nobody`, { role: 'viewer' });
        expect(unknown.status).toBe(404);
        expect(unknown.body.detail).toContain('No account is called “nobody”');
        const self = await as('owner', 'PUT', `${members}/owner`, { role: 'editor' });
        expect(self.status).toBe(422);
      } finally {
        await app.close();
      }
    }));

  it('may leave a universe; its owner may not', () =>
    withTestDb(async (db, url) => {
      const { app, accounts, as, universe, events } = await setUp(db, url);
      try {
        await as('owner', 'PUT', `/universes/${universe.id}/members/alice`, { role: 'viewer' });
        const left = await as('alice', 'DELETE', `/universes/${universe.id}/membership`);
        expect(left.status).toBe(204);
        expect((await as('alice', 'GET', `/universes/${universe.id}`)).status).toBe(404);
        const owner = await as('owner', 'DELETE', `/universes/${universe.id}/membership`);
        expect(owner.status).toBe(422);
        expect(owner.body.detail).toContain('You own this universe');
        expect((await events()).at(-1)).toMatchObject({
          action: 'member.leave',
          actorLabel: 'alice',
          userId: accounts.alice.id,
        });
      } finally {
        await app.close();
      }
    }));
});

describe('member suggestions (D-59)', () => {
  it('offer the people the owner already knows, and every active account to an admin', () =>
    withTestDb(async (db, url) => {
      const { app, as, universe } = await setUp(db, url);
      try {
        const suggested = async (headers: Record<string, string>, universeId: string) => {
          const response = await app.inject({
            method: 'GET',
            url: `/api/v1/universes/${universeId}/member-suggestions`,
            headers: { ...headers, ...ORIGIN },
          });
          return { status: response.statusCode, names: response.json<{ data?: string[] }>().data };
        };
        const signedIn = async (account: TestAccount) =>
          sessionOf(await signIn(app, account, await codeFor(account.secret)));
        await makeAccount(db, 'carol');
        const dave = await makeAccount(db, 'dave');
        const admin = await makeAccount(db, 'admin', { role: 'admin' });

        // The owner shares with alice and dave; bob shares his own universe with the owner.
        const members = `/universes/${universe.id}/members`;
        await as('owner', 'PUT', `${members}/alice`, { role: 'viewer' });
        await as('owner', 'PUT', `${members}/dave`, { role: 'viewer' });
        const bobs = (await as('bob', 'POST', '/universes', { slug: 'bobs', name: rt.plain('B') }))
          .body.data as { id: string };
        await as('bob', 'PUT', `/universes/${bobs.id}/members/owner`, { role: 'editor' });
        await db
          .update(schema.users)
          .set({ disabledAt: new Date() })
          .where(eq(schema.users.id, dave.id));

        // Known people only: alice (shared with), bob (shared by); not carol, a stranger, nor
        // dave, disabled, nor the owner. Current members are listed, for a transfer.
        const mine = await as('owner', 'GET', `/universes/${universe.id}/member-suggestions`);
        expect(mine.status).toBe(200);
        expect(mine.body.data).toEqual(['alice', 'bob']);
        // Alice knows the owner, who shared with her, but not bob, who's only a co-member.
        const alices = (
          await as('alice', 'POST', '/universes', { slug: 'al', name: rt.plain('A') })
        ).body.data as { id: string };
        expect(
          (await as('alice', 'GET', `/universes/${alices.id}/member-suggestions`)).body.data,
        ).toEqual(['owner']);
        // Only the owner asks: a viewer may read the universe, not see whom to add.
        expect(
          (await as('alice', 'GET', `/universes/${universe.id}/member-suggestions`)).status,
        ).toBe(403);

        // An admin already sees every account on the admin screens: all active ones but itself.
        const adminSession = await signedIn(admin);
        const own = await app.inject({
          method: 'POST',
          url: '/api/v1/universes',
          headers: { ...adminSession, ...ORIGIN },
          payload: { slug: 'admins', name: rt.plain('Admin’s') },
        });
        const adminsId = own.json<{ data: { id: string } }>().data.id;
        expect((await suggested(adminSession, adminsId)).names).toEqual([
          'alice',
          'bob',
          'carol',
          'owner',
        ]);
      } finally {
        await app.close();
      }
    }));
});

describe('the drafts count (M8-T12)', () => {
  it('counts the draft maps and entries that stay hidden from readers', () =>
    withTestDb(async (db, url) => {
      const { app, as, universe } = await setUp(db, url);
      try {
        const map = await as('owner', 'POST', `/universes/${universe.id}/maps`, {
          slug: 'later',
          name: rt.plain('Later'),
          status: 'draft',
        });
        await as('owner', 'POST', `/universes/${universe.id}/characters`, {
          name: rt.plain('Secret'),
          status: 'draft',
        });
        await as('owner', 'POST', `/maps/${map.body.data.id as string}/objects`, {
          name: rt.plain('Hidden'),
          baseType: 'system',
          status: 'draft',
        });
        await as('owner', 'POST', `/universes/${universe.id}/characters`, {
          name: rt.plain('Seen'),
        });
        const counted = await as('owner', 'GET', `/universes/${universe.id}/drafts`);
        expect(counted.body.data).toEqual({ maps: 1, entries: 2 });
      } finally {
        await app.close();
      }
    }));
});

describe('the share link (M8-T12)', () => {
  it('opens a link-only universe through its cookie, until the link is replaced', () =>
    withTestDb(async (db, url) => {
      const { app, as, universe, events } = await setUp(db, url);
      try {
        const patched = await as('owner', 'PATCH', `/universes/${universe.id}`, {
          visibility: 'link',
          version: universe.version,
        });
        expect(patched.status).toBe(200);
        const key = patched.body.data.shareKey as string;
        expect(key).toMatch(/^[A-Za-z0-9_-]{22}$/);
        // A visibility isn't content: no version, no batch (D-41).
        expect(patched.body.data.version).toBe(universe.version);
        expect(patched.headers['x-ge-batch-id']).toBeUndefined();

        // Signed out, the address is nothing, exactly like a missing one; the link opens it and
        // sets a cookie.
        const hidden = await as('anonymous', 'GET', `/universes/${universe.id}/maps`);
        expect(hidden.status).toBe(404);
        expect(hidden.headers['x-robots-tag']).toBeUndefined();
        expect((await as('anonymous', 'GET', '/universes/by-slug/shared')).status).toBe(404);
        const wrong = await as('anonymous', 'POST', '/universes/unlock', {
          slug: 'shared',
          key: 'x',
        });
        expect(wrong.status).toBe(404);
        const unlocked = await as('anonymous', 'POST', '/universes/unlock', {
          slug: 'shared',
          key,
        });
        expect(unlocked.status).toBe(200);
        expect(unlocked.body.data).toMatchObject({
          access: 'read',
          shareKey: null,
          owner: 'owner',
        });
        expect(unlocked.headers['x-robots-tag']).toBe('noindex');
        const cookie = unlocked.cookies.find((item) => item.name === `ge_share_${universe.id}`);
        expect(cookie?.value).toBe(key);
        const withLink = { cookie: `ge_share_${universe.id}=${key}` };

        const read = await as(
          'anonymous',
          'GET',
          `/universes/${universe.id}/maps`,
          undefined,
          withLink,
        );
        expect(read.status).toBe(200);
        expect(read.headers['x-robots-tag']).toBe('noindex');
        // Not listed for someone who only has the link.
        const listed = await as('anonymous', 'GET', '/universes', undefined, withLink);
        expect(listed.body.data).toEqual([]);

        // A new link: the old cookie and the old link stop working at once.
        const replaced = await as('owner', 'POST', `/universes/${universe.id}/share-key`);
        expect(replaced.status).toBe(200);
        expect(replaced.body.data.shareKey).not.toBe(key);
        expect(
          (await as('anonymous', 'GET', `/universes/${universe.id}/maps`, undefined, withLink))
            .status,
        ).toBe(404);
        expect(
          (await as('anonymous', 'POST', '/universes/unlock', { slug: 'shared', key })).status,
        ).toBe(404);

        // Back to private: no key at all, and a private universe has no link to replace.
        await as('owner', 'PATCH', `/universes/${universe.id}`, {
          visibility: 'private',
          version: universe.version,
        });
        const none = await as('owner', 'GET', `/universes/${universe.id}`);
        expect(none.body.data.shareKey).toBeNull();
        expect((await as('owner', 'POST', `/universes/${universe.id}/share-key`)).status).toBe(422);

        expect((await events()).map((event) => [event.action, event.detail])).toEqual([
          ['universe.visibility', { slug: 'shared', from: 'private', to: 'link' }],
          ['universe.link', { slug: 'shared' }],
          ['universe.visibility', { slug: 'shared', from: 'link', to: 'private' }],
        ]);
        // Public universes are for search engines.
        await as('owner', 'PATCH', `/universes/${universe.id}`, {
          visibility: 'public',
          version: universe.version,
        });
        const open = await as('anonymous', 'GET', '/universes/by-slug/shared');
        expect(open.status).toBe(200);
        expect(open.headers['x-robots-tag']).toBeUndefined();
      } finally {
        await app.close();
      }
    }));
});

describe('who can see a universe is not in History (M8-T12, D-41)', () => {
  it('so an editor can’t undo the owner’s choices, and edits still revert', () =>
    withTestDb(async (db, url) => {
      const { app, as, universe } = await setUp(db, url);
      try {
        await as('owner', 'PUT', `/universes/${universe.id}/members/alice`, { role: 'editor' });
        const history = await as('alice', 'GET', `/universes/${universe.id}/history`);
        const creation = (history.body.data as { id: string; description: string }[]).find(
          (batch) => batch.description === 'Create universe',
        );
        // Reverting the creation would delete the universe: not from History.
        const undone = await as('alice', 'POST', `/history/${creation?.id ?? ''}/revert`);
        expect(undone.status).toBe(422);
        expect((await as('owner', 'GET', `/universes/${universe.id}`)).status).toBe(200);

        // An edit, then the owner makes it public: undoing the edit leaves it public.
        const renamed = await as('alice', 'PATCH', `/universes/${universe.id}`, {
          name: rt.plain('Renamed'),
          version: universe.version,
        });
        const batchId = renamed.headers['x-ge-batch-id'] as string;
        await as('owner', 'PATCH', `/universes/${universe.id}`, {
          visibility: 'public',
          version: renamed.body.data.version,
        });
        expect((await as('alice', 'POST', `/history/${batchId}/revert`)).status).toBe(201);
        const after = await as('owner', 'GET', `/universes/${universe.id}`);
        expect(after.body.data).toMatchObject({ namePlain: 'Shared', visibility: 'public' });
        // And nothing in History mentions the visibility.
        const batches = await as('owner', 'GET', `/universes/${universe.id}/history`);
        expect(
          (batches.body.data as { description: string }[]).map((batch) => batch.description),
        ).toEqual(['Revert: Edit universe', 'Edit universe', 'Create universe']);
      } finally {
        await app.close();
      }
    }));
});

describe('transfer (M8-T12)', () => {
  it('hands the universe over with a fresh code; the previous owner stays as an editor', () =>
    withTestDb(async (db, url) => {
      const { app, accounts, as, fresh, universe, events } = await setUp(db, url);
      try {
        await as('owner', 'PUT', `/universes/${universe.id}/members/alice`, { role: 'viewer' });
        const transfer = `/universes/${universe.id}/transfer`;
        const noCode = await as('owner', 'POST', transfer, { username: 'alice' });
        expect(noCode.status).toBe(403);
        const done = await as(
          'owner',
          'POST',
          transfer,
          { username: 'alice' },
          await fresh('owner'),
        );
        expect(done.status).toBe(200);
        expect(done.body.data).toMatchObject({ owner: 'alice', access: 'edit', role: 'editor' });
        const asAlice = await as('alice', 'GET', `/universes/${universe.id}`);
        expect(asAlice.body.data).toMatchObject({ access: 'own', role: null });
        // The new owner isn't also a member; the old one is, as an editor.
        const members = await as('alice', 'GET', `/universes/${universe.id}/members`);
        expect(members.body.data).toMatchObject([{ username: 'owner', role: 'editor' }]);
        expect((await events()).at(-1)).toMatchObject({
          action: 'universe.transfer',
          actorLabel: 'owner',
          userId: accounts.alice.id,
        });
        // The previous owner can no longer change who has access.
        const back = await as('owner', 'PUT', `/universes/${universe.id}/members/bob`, {
          role: 'viewer',
        });
        expect(back.status).toBe(403);
      } finally {
        await app.close();
      }
    }));

  it('is refused when the new owner’s quota has no room for the universe’s images', () =>
    withTestDb(async (db, url) => {
      const { app, accounts, as, fresh, universe } = await setUp(db, url);
      try {
        await withBatch(
          db,
          { type: 'local', label: 'test' },
          'an image',
          (tx) =>
            tx.insert(schema.assets).values({
              universeId: universe.id,
              sha256: 'big',
              mimeType: 'image/webp',
              width: 1,
              height: 1,
              byteSize: 5 * 1024 ** 2,
              variants: {
                thumb: { key: 'big', width: 1, height: 1 },
                display: { key: 'big', width: 1, height: 1 },
              },
            }),
          { universeId: universe.id },
        );
        await db
          .update(schema.users)
          .set({ mediaQuotaBytes: 4 * 1024 ** 2 })
          .where(eq(schema.users.id, accounts.bob.id));
        const refused = await as(
          'owner',
          'POST',
          `/universes/${universe.id}/transfer`,
          { username: 'bob' },
          await fresh('owner'),
        );
        expect(refused.status).toBe(422);
        expect(refused.body.detail).toContain(
          'bob has no room for this universe’s images (5.0 MB)',
        );
        expect((await as('owner', 'GET', `/universes/${universe.id}`)).body.data.access).toBe(
          'own',
        );
      } finally {
        await app.close();
      }
    }));
});

describe('deleting a universe (M8-T12)', () => {
  it('needs a fresh code, and the log keeps its name', () =>
    withTestDb(async (db, url) => {
      const { app, as, fresh, universe } = await setUp(db, url);
      try {
        const path = `/universes/${universe.id}`;
        const body = { version: universe.version };
        expect((await as('owner', 'DELETE', path, body)).status).toBe(403);
        expect((await as('owner', 'DELETE', path, body, await fresh('owner'))).status).toBe(204);
        const [event] = await db
          .select()
          .from(schema.accessEvents)
          .where(eq(schema.accessEvents.action, 'universe.delete'));
        expect(event).toMatchObject({
          actorLabel: 'owner',
          universeId: null,
          detail: { slug: 'shared', name: 'Shared' },
        });
      } finally {
        await app.close();
      }
    }));
});
