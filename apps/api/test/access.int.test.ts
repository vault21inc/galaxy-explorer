import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schema, withBatch, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { eq } from 'drizzle-orm';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.ts';
import { authConfig, codeFor, makeAccount, ORIGIN, sessionOf, signIn } from './auth/auth-world.ts';
import { multipart } from './helpers.ts';

/**
 * Ownership, visibility and the access check (M8-T11, data-model §8), beyond the contract suite
 * (contract/access.contract.int.test.ts): drafts, lists, batches, media and the quota.
 */

let mediaDir: string;
beforeEach(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'ge-access-'));
});
afterEach(async () => {
  await rm(mediaDir, { recursive: true, force: true });
});

type Who = 'owner' | 'editor' | 'viewer' | 'stranger' | 'admin' | 'anonymous';

/** A server with accounts, five people signed in, and a way to call it as each. */
async function setUp(db: Database, url: string) {
  const app = await buildServer(authConfig(url, { mediaDir }));
  const accounts = {
    owner: await makeAccount(db, 'owner'),
    editor: await makeAccount(db, 'editor'),
    viewer: await makeAccount(db, 'viewer'),
    stranger: await makeAccount(db, 'stranger'),
    admin: await makeAccount(db, 'admin', { role: 'admin' }),
  };
  const headers: Record<Who, Record<string, string>> = { anonymous: {} } as never;
  for (const [who, account] of Object.entries(accounts)) {
    headers[who as Who] = sessionOf(await signIn(app, account, await codeFor(account.secret)));
  }
  const as = async (who: Who, method: string, path: string, payload?: unknown) => {
    const response = await app.inject({
      method: method as 'GET',
      url: `/api/v1${path}`,
      headers: { ...headers[who], ...ORIGIN },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    return {
      status: response.statusCode,
      body: response.body ? response.json<Record<string, any>>() : {},
    };
  };
  /** A universe made by the owner, with one map, and shared with the editor and the viewer. */
  const universe = async (slug: string) => {
    const made = await as('owner', 'POST', '/universes', { slug, name: rt.plain(slug) });
    const id = made.body.data.id as string;
    const map = await as('owner', 'POST', `/universes/${id}/maps`, {
      slug: 'main',
      name: rt.plain('Main'),
    });
    await db.insert(schema.universeMembers).values([
      { universeId: id, userId: accounts.editor.id, role: 'editor' },
      { universeId: id, userId: accounts.viewer.id, role: 'viewer' },
    ]);
    return { id, mapId: map.body.data.id as string, made: made.body.data };
  };
  const upload = async (who: Who, universeId: string, image: Buffer) => {
    const body = multipart(image, 'image.png', 'image/png');
    const sent = await app.inject({
      method: 'POST',
      url: `/api/v1/universes/${universeId}/assets`,
      payload: body.payload,
      headers: {
        ...body.headers,
        ...headers[who],
        ...ORIGIN,
      },
    });
    return { status: sent.statusCode, body: sent.json<Record<string, any>>() };
  };
  /** A media file's path, fetched as `who`. */
  const media = async (who: Who, path: string) =>
    app.inject({ method: 'GET', url: path, headers: headers[who] });
  return { app, accounts, as, universe, upload, media, headers };
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

async function setVisibility(
  world: Awaited<ReturnType<typeof setUp>>,
  id: string,
  visibility: string,
) {
  const current = await world.as('owner', 'GET', `/universes/${id}`);
  return world.as('owner', 'PATCH', `/universes/${id}`, {
    visibility,
    version: current.body.data.version,
  });
}

describe('a new universe', () => {
  it('belongs to the account that makes it, and starts private', () =>
    run(async (world) => {
      const { made, id } = await world.universe('mine');
      expect(made).toMatchObject({ owner: 'owner', visibility: 'private', access: 'own' });
      const editor = await world.as('editor', 'GET', `/universes/${id}`);
      expect(editor.body.data).toMatchObject({ access: 'edit' });
      const viewer = await world.as('viewer', 'GET', `/universes/${id}`);
      expect(viewer.body.data).toMatchObject({ access: 'read' });
      // An admin edits it, though it isn't shared with them (D-50), and isn't sent its key.
      const admin = await world.as('admin', 'GET', `/universes/${id}`);
      expect(admin.body.data).toMatchObject({ access: 'edit', role: null, shareKey: null });
      for (const who of ['stranger', 'anonymous'] as const) {
        const hidden = await world.as(who, 'GET', `/universes/${id}`);
        expect(hidden.status, who).toBe(404);
        expect(hidden.body.detail).toBe(`No universe with id ${id}.`);
      }
      // Only someone signed in may make one.
      const anonymous = await world.as('anonymous', 'POST', '/universes', {
        slug: 'nope',
        name: rt.plain('Nope'),
      });
      expect(anonymous.status).toBe(401);
    }));

  it('opens by its address for those who can read it, and is "not found" for others', () =>
    run(async (world) => {
      await world.universe('mine');
      expect((await world.as('viewer', 'GET', '/universes/by-slug/mine')).body.data.slug).toBe(
        'mine',
      );
      const hidden = await world.as('stranger', 'GET', '/universes/by-slug/mine');
      const free = await world.as('stranger', 'GET', '/universes/by-slug/free');
      expect(hidden.status).toBe(404);
      // Exactly as an address nobody has.
      expect({ ...hidden.body, detail: undefined }).toEqual({ ...free.body, detail: undefined });
      expect(hidden.body.detail).toBe('No universe at /u/mine.');
    }));
});

describe('visibility', () => {
  it('is the owner’s to change; public puts it on everyone’s list, link makes a key', () =>
    run(async (world, db) => {
      const { id } = await world.universe('mine');
      const current = await world.as('editor', 'GET', `/universes/${id}`);
      const byEditor = await world.as('editor', 'PATCH', `/universes/${id}`, {
        visibility: 'public',
        version: current.body.data.version,
      });
      expect(byEditor.status).toBe(403);
      // Editors still change its name.
      const renamed = await world.as('editor', 'PATCH', `/universes/${id}`, {
        name: rt.plain('Renamed'),
        version: current.body.data.version,
      });
      expect(renamed.status).toBe(200);

      expect((await setVisibility(world, id, 'link')).body.data.visibility).toBe('link');
      const [linked] = await db.select().from(schema.universes).where(eq(schema.universes.id, id));
      expect(linked?.shareKey).toMatch(/^[A-Za-z0-9_-]{22}$/);
      // Link-only isn't readable without its key (unlocking it is M8-T12's).
      expect((await world.as('stranger', 'GET', `/universes/${id}`)).status).toBe(404);

      expect((await setVisibility(world, id, 'public')).status).toBe(200);
      const [opened] = await db.select().from(schema.universes).where(eq(schema.universes.id, id));
      // Leaving link-only drops the key, so the old link stops working.
      expect(opened?.shareKey).toBeNull();
      const anonymous = await world.as('anonymous', 'GET', `/universes/${id}`);
      expect(anonymous.body.data).toMatchObject({
        owner: 'owner',
        visibility: 'public',
        access: 'read',
      });
      // Reading a public universe isn't changing it.
      const write = await world.as('anonymous', 'POST', `/universes/${id}/maps`, {
        slug: 'more',
        name: rt.plain('More'),
      });
      expect(write.status).toBe(401);
      const strangerWrite = await world.as('stranger', 'POST', `/universes/${id}/maps`, {
        slug: 'more',
        name: rt.plain('More'),
      });
      expect(strangerWrite.status).toBe(403);
    }));
});

describe('GET /universes', () => {
  it('lists exactly what each requester can read', () =>
    run(async (world, db) => {
      const privateOne = await world.universe('private-one');
      const publicOne = await world.universe('public-one');
      await setVisibility(world, publicOne.id, 'public');
      const linkOne = await world.universe('link-one');
      await setVisibility(world, linkOne.id, 'link');
      // The installation's own: no owner. Made private, only admins may read it (D-34).
      await withBatch(db, { type: 'local', label: 'test' }, 'installation', (tx) =>
        tx.insert(schema.universes).values({
          slug: 'installation',
          name: rt.plain('I'),
          namePlain: 'I',
          visibility: 'private',
        }),
      );
      const listed = async (who: Who) =>
        ((await world.as(who, 'GET', '/universes')).body.data as { slug: string }[])
          .map((universe) => universe.slug)
          .sort();
      expect(await listed('anonymous')).toEqual(['public-one']);
      expect(await listed('stranger')).toEqual(['public-one']);
      // Shared with them, the link-only one included: they're members.
      expect(await listed('viewer')).toEqual(['link-one', 'private-one', 'public-one']);
      expect(await listed('owner')).toEqual(['link-one', 'private-one', 'public-one']);
      // An admin lists every universe (D-50): editing other accounts', owning the installation's.
      expect(await listed('admin')).toEqual([
        'installation',
        'link-one',
        'private-one',
        'public-one',
      ]);
      const adminList = (await world.as('admin', 'GET', '/universes')).body.data as {
        slug: string;
        access: string;
        owner: string | null;
      }[];
      const accessOf = (slug: string) => adminList.find((universe) => universe.slug === slug);
      expect(accessOf('installation')).toMatchObject({ owner: null, access: 'own' });
      expect(accessOf('private-one')).toMatchObject({ owner: 'owner', access: 'edit' });
      expect(accessOf('link-one')).toMatchObject({ access: 'edit' });
      expect((await world.as('admin', 'GET', `/universes/${privateOne.id}`)).status).toBe(200);
    }));
});

describe('an admin (D-50)', () => {
  it('edits another account’s private universe as an editor would, and owns none of it', () =>
    run(async (world) => {
      const { id, mapId } = await world.universe('theirs');
      // Content, drafts included.
      const draft = await world.as('admin', 'POST', `/maps/${mapId}/objects`, {
        name: rt.plain('Admin’s base'),
        baseType: 'station',
        status: 'draft',
      });
      expect(draft.status).toBe(201);
      const drafts = await world.as('admin', 'GET', `/maps/${mapId}/objects?includeDrafts=true`);
      expect((drafts.body.data as { namePlain: string }[]).map((o) => o.namePlain)).toEqual([
        'Admin’s base',
      ]);
      // History, which an admin may read, says it was the admin, so the owner can see it too.
      const history = await world.as('owner', 'GET', `/universes/${id}/history`);
      expect((history.body.data as { actorLabel: string }[])[0]).toMatchObject({
        actorLabel: 'admin',
      });
      expect((await world.as('admin', 'GET', `/universes/${id}/history`)).status).toBe(200);
      // The members list is readable, as for an editor; who's in isn't the admin's to change.
      expect((await world.as('admin', 'GET', `/universes/${id}/members`)).status).toBe(200);
      const share = await world.as('admin', 'PUT', `/universes/${id}/members/stranger`, {
        role: 'viewer',
      });
      expect(share.status).toBe(403);
      const current = await world.as('admin', 'GET', `/universes/${id}`);
      for (const change of [{ visibility: 'public' }, { slug: 'taken-over' }]) {
        const refused = await world.as('admin', 'PATCH', `/universes/${id}`, {
          ...change,
          version: current.body.data.version,
        });
        expect(refused.status, JSON.stringify(change)).toBe(403);
      }
      expect(
        (
          await world.as('admin', 'DELETE', `/universes/${id}`, {
            version: current.body.data.version,
          })
        ).status,
      ).toBe(403);
      // Its owner still owns it, and the admin isn't made a member.
      expect((await world.as('owner', 'GET', `/universes/${id}`)).body.data).toMatchObject({
        access: 'own',
      });
      const members = (await world.as('owner', 'GET', `/universes/${id}/members`)).body.data as {
        username: string;
      }[];
      expect(members.map((member) => member.username).sort()).toEqual(['editor', 'viewer']);
    }));
});

describe('drafts', () => {
  it('are hidden from viewers and shown to editors', () =>
    run(async (world) => {
      const { mapId } = await world.universe('mine');
      const created = await world.as('owner', 'POST', `/maps/${mapId}/objects`, {
        name: rt.plain('Secret base'),
        baseType: 'station',
        status: 'draft',
      });
      expect(created.status).toBe(201);
      const names = async (who: Who, query = '') =>
        (
          (await world.as(who, 'GET', `/maps/${mapId}/objects${query}`)).body.data as
            { namePlain: string }[] | undefined
        )?.map((object) => object.namePlain);
      expect(await names('viewer')).toEqual([]);
      expect(
        (await world.as('viewer', 'GET', `/maps/${mapId}/objects?includeDrafts=true`)).status,
      ).toBe(403);
      expect(await names('editor')).toEqual([]);
      expect(await names('editor', '?includeDrafts=true')).toEqual(['Secret base']);
      const id = created.body.data.id as string;
      expect((await world.as('viewer', 'GET', `/objects/${id}`)).status).toBe(404);
      expect((await world.as('editor', 'GET', `/objects/${id}?includeDrafts=true`)).status).toBe(
        200,
      );
    }));
});

describe('the batch endpoint', () => {
  it('changes nothing when one operation’s universe isn’t the requester’s to change', () =>
    run(async (world) => {
      const ours = await world.universe('ours');
      // The stranger's own universe, which the editor can't touch.
      const theirs = await world.as('stranger', 'POST', '/universes', {
        slug: 'theirs',
        name: rt.plain('Theirs'),
      });
      const theirMap = await world.as(
        'stranger',
        'POST',
        `/universes/${String(theirs.body.data.id)}/maps`,
        {
          slug: 'main',
          name: rt.plain('Main'),
        },
      );
      const batch = (mapId: string) =>
        world.as('editor', 'POST', '/batch', {
          description: 'Two universes',
          operations: [
            {
              op: 'create',
              kind: 'celestial_object',
              mapId: ours.mapId,
              data: { name: rt.plain('Here'), baseType: 'system' },
            },
            {
              op: 'create',
              kind: 'celestial_object',
              mapId,
              data: { name: rt.plain('There'), baseType: 'system' },
            },
          ],
        });
      const refused = await batch(theirMap.body.data.id as string);
      expect(refused.status).toBe(404);
      expect(refused.body).toMatchObject({ operationIndex: 1 });
      const objects = await world.as('owner', 'GET', `/maps/${ours.mapId}/objects`);
      expect(objects.body.data).toEqual([]);

      // Readable but not editable: 403, and still nothing.
      await setVisibility(world, ours.id, 'public');
      const viewerBatch = await world.as('stranger', 'POST', '/batch', {
        description: 'Into a public universe',
        operations: [
          {
            op: 'create',
            kind: 'celestial_object',
            mapId: ours.mapId,
            data: { name: rt.plain('X'), baseType: 'system' },
          },
        ],
      });
      expect(viewerBatch.status).toBe(403);
      expect((await world.as('owner', 'GET', `/maps/${ours.mapId}/objects`)).body.data).toEqual([]);
    }));
});

describe('links and relations', () => {
  it('are reached only through their own entity', () =>
    run(async (world) => {
      const ours = await world.universe('ours');
      const theirs = await world.universe('theirs');
      const object = async (mapId: string) =>
        (
          await world.as('owner', 'POST', `/maps/${mapId}/objects`, {
            name: rt.plain('O'),
            baseType: 'system',
          })
        ).body.data.id as string;
      const mine = await object(ours.mapId);
      const other = await object(theirs.mapId);
      const link = await world.as('owner', 'POST', `/entities/${other}/links`, {
        url: 'https://example.com/',
      });
      // Through an entity the editor can edit, at a link of another entity: as good as missing.
      const crossed = await world.as(
        'owner',
        'DELETE',
        `/entities/${mine}/links/${String(link.body.data.id)}`,
      );
      expect(crossed.status).toBe(404);
      expect((await world.as('owner', 'GET', `/entities/${other}/links`)).body.data).toHaveLength(
        1,
      );
    }));
});

/** A noisy PNG, so the encoder can't make it tiny. */
function png(size: number) {
  const pixels = Buffer.alloc(size * size * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2_654_435_761) >>> 24;
  return sharp(pixels, { raw: { width: size, height: size, channels: 3 } })
    .png()
    .toBuffer();
}

describe('media', () => {
  it('of a private universe are not found for a stranger and served, privately, to a viewer', () =>
    run(async (world) => {
      const { id } = await world.universe('mine');
      expect((await world.upload('viewer', id, await png(64))).status).toBe(403);
      const uploaded = await world.upload('owner', id, await png(64));
      expect(uploaded.status).toBe(201);
      const path = uploaded.body.data.urls.display as string;
      expect(path).toMatch(/^\/media\/u\//);

      for (const who of ['stranger', 'anonymous'] as const) {
        expect((await world.media(who, path)).statusCode, who).toBe(404);
      }
      for (const who of ['viewer', 'admin'] as const) {
        const served = await world.media(who, path);
        expect(served.statusCode, who).toBe(200);
        expect(served.headers['cache-control']).toBe('private, max-age=31536000, immutable');
      }

      // The same question, as Caddy's forward_auth asks it in production (M8-T4).
      const ask = (who: Who) =>
        world.app.inject({
          method: 'GET',
          url: '/api/v1/media-access',
          headers: { ...world.headers[who], 'x-forwarded-uri': path },
        });
      expect((await ask('stranger')).statusCode).toBe(404);
      const allowed = await ask('viewer');
      expect(allowed.statusCode).toBe(204);
      expect(allowed.headers['cache-control']).toBe('private, max-age=31536000, immutable');

      // Public: anyone, and anyone may cache it.
      await setVisibility(world, id, 'public');
      const opened = await world.media('anonymous', path);
      expect(opened.statusCode).toBe(200);
      expect(opened.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    }));

  it('count against the owner’s quota, and an upload past it is refused', () =>
    run(async (world, db) => {
      const { id } = await world.universe('mine');
      const first = await world.upload('editor', id, await png(64));
      expect(first.status).toBe(201);
      const usedBytes = first.body.data.byteSize as number;
      // The editor uploaded it, but it's the owner's universe, so the owner's quota.
      const me = await world.as('owner', 'GET', '/auth/me');
      expect(me.body.data).toMatchObject({ mediaUsedBytes: usedBytes });
      expect((await world.as('editor', 'GET', '/auth/me')).body.data.mediaUsedBytes).toBe(0);

      await db
        .update(schema.users)
        .set({ mediaQuotaBytes: usedBytes + 10 })
        .where(eq(schema.users.id, world.accounts.owner.id));
      const refused = await world.upload('owner', id, await png(80));
      expect(refused.status).toBe(413);
      expect(refused.body.detail).toMatch(/past their media quota: .* MB of .* MB is used/);
    }));
});
