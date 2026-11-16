import { schema, withBatch, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { authConfig } from './auth/auth-world.ts';
import { apiOn, newWorld, type Api } from './contract/harness.ts';

/**
 * The public site's own pages (M8-T9): link previews, read as an anonymous visitor whoever
 * asks, and the attributions page's list.
 */

type Json = Record<string, any>;
interface World {
  url: string;
  universeId: string;
  mapId: string;
  gudrun: { id: string };
}

const SITE = 'https://galaxy.example.test';
const READ_AT = '2026-11-14T00:00:57.652Z';

function run(fn: (api: Api, db: Database, world: World) => Promise<void>) {
  return withTestDb(async (db, url) => {
    const api = await apiOn(url, { publicUrl: SITE });
    try {
      const { universeId, mapId } = await newWorld(api);
      const gudrun = (await object(api, mapId, {
        name: rt.plain('Gudrun'),
        baseType: 'system',
        description: rt.md('A cold hive world. ||Heretics hide in its hives.|| Rain falls.'),
      })) as { id: string };
      await withBatch(
        db,
        { type: 'local', label: 'test' },
        'an image',
        (tx) =>
          tx.insert(schema.assets).values({
            id: '00000000-0000-7000-8000-0000000000a1',
            universeId,
            sha256: 'gudrun',
            mimeType: 'image/webp',
            width: 1600,
            height: 900,
            byteSize: 1_000,
            variants: {
              thumb: { key: 'u/gudrun/thumb.webp', width: 320, height: 180 },
              display: { key: 'u/gudrun/display.webp', width: 1600, height: 900 },
            },
            altText: 'Gudrun’s <hives> at dusk',
            credit: 'Art by Ana',
            license: 'CC BY 4.0',
            sourceUrl: 'https://art.example.test/gudrun',
          }),
        { universeId },
      );
      await api.expect(201, 'POST', `/entities/${gudrun.id}/images`, {
        assetId: '00000000-0000-7000-8000-0000000000a1',
        role: 'cover',
      });
      await fn(api, db, { url, universeId, mapId, gudrun });
    } finally {
      await api.app.close();
    }
  });
}

async function object(api: Api, mapId: string, body: Json) {
  return (await api.expect(201, 'POST', `/maps/${mapId}/objects`, body)).body.data as Json;
}

async function preview(api: Api, path: string, select?: string) {
  const query = new URLSearchParams({ path, ...(select ? { select } : {}) });
  const response = await api.app.inject({
    method: 'GET',
    url: `/api/v1/link-preview?${query.toString()}`,
  });
  expect(response.statusCode).toBe(200);
  expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
  return { html: response.body, robots: response.headers['x-robots-tag'] };
}

/** A `<meta>` tag's content, by its name or property. */
function tag(html: string, key: string): string | undefined {
  const match = new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)">`).exec(html);
  return match?.[1];
}

async function setVisibility(api: Api, universeId: string, visibility: string) {
  const current = await api.expect(200, 'GET', `/universes/${universeId}`);
  await api.expect(200, 'PATCH', `/universes/${universeId}`, {
    visibility,
    version: current.body.data.version,
  });
}

describe('link previews', () => {
  it('give an object its name, its text without spoilers and its cover image', () =>
    run(async (api, _db, { gudrun }) => {
      const { html, robots } = await preview(api, `/u/contract/main/view/${gudrun.id}`);
      expect(tag(html, 'og:title')).toBe('Gudrun');
      expect(html).toContain('<title>Gudrun · Main · Contract · Galaxy Explorer</title>');
      // The spoiler is left out, with no bar to hint at its length.
      expect(tag(html, 'og:description')).toBe('A cold hive world. … Rain falls.');
      expect(html).not.toContain('Heretics');
      expect(html).not.toContain('▇');
      expect(tag(html, 'og:image')).toBe(`${SITE}/media/u/gudrun/display.webp`);
      expect(tag(html, 'og:image:width')).toBe('1600');
      expect(tag(html, 'og:image:alt')).toBe('Gudrun’s &lt;hives&gt; at dusk');
      expect(tag(html, 'twitter:card')).toBe('summary_large_image');
      expect(tag(html, 'og:url')).toBe(`${SITE}/u/contract/main/view/${gudrun.id}`);
      expect(robots).toBeUndefined();
      expect(tag(html, 'robots')).toBeUndefined();

      // Selected in the galaxy view, it's the same card, linking to the selection.
      const selected = await preview(api, '/u/contract/main', gudrun.id);
      expect(tag(selected.html, 'og:title')).toBe('Gudrun');
      expect(tag(selected.html, 'og:url')).toBe(`${SITE}/u/contract/main?select=${gudrun.id}`);
    }));

  it('give a map and a universe their own cards', () =>
    run(async (api) => {
      const map = await preview(api, '/u/contract/main/');
      expect(tag(map.html, 'og:title')).toBe('Main');
      expect(map.html).toContain('<title>Main · Contract · Galaxy Explorer</title>');
      expect(tag(map.html, 'twitter:card')).toBe('summary');
      const universe = await preview(api, '/u/contract');
      expect(tag(universe.html, 'og:title')).toBe('Contract');
      expect(tag(universe.html, 'og:description')).toBe('A universe on Galaxy Explorer.');
    }));

  it('say nothing of a draft, a spoiler or a bad id: the map’s card', () =>
    run(async (api, _db, { mapId }) => {
      const draft = await object(api, mapId, {
        name: rt.plain('Halcyon'),
        baseType: 'system',
        status: 'draft',
      });
      const secret = await object(api, mapId, {
        name: rt.plain('Erebus'),
        baseType: 'system',
        isSpoiler: true,
      });
      const named = await object(api, mapId, {
        name: { ...rt.plain('The Traitor'), spoiler: true },
        baseType: 'system',
      });
      for (const id of [draft.id, secret.id, named.id]) {
        const { html } = await preview(api, `/u/contract/main/view/${String(id)}`);
        expect(tag(html, 'og:title')).toBe('Main');
        expect(html).not.toMatch(/Halcyon|Erebus|Traitor/);
      }
      // Looks like an id to the address pattern, but isn't one: Postgres would refuse it.
      const bad = await preview(api, '/u/contract/main/view/abc-123', 'nor-this');
      expect(tag(bad.html, 'og:title')).toBe('Main');
    }));

  it('give a universe that isn’t public, or nothing, the site’s card and noindex', () =>
    run(async (api, _db, { universeId, gudrun }) => {
      for (const visibility of ['private', 'link']) {
        await setVisibility(api, universeId, visibility);
        const { html, robots } = await preview(api, `/u/contract/main/view/${gudrun.id}`);
        expect(tag(html, 'og:title')).toBe('Galaxy Explorer');
        expect(html).not.toMatch(/Gudrun|Contract/);
        expect(robots).toBe('noindex');
        expect(tag(html, 'robots')).toBe('noindex');
      }
      for (const path of ['/u/nowhere', '/about', '/u/contract/main/view/x/y']) {
        const { html, robots } = await preview(api, path);
        expect(tag(html, 'og:title')).toBe('Galaxy Explorer');
        expect(robots).toBe('noindex');
      }
    }));
});

describe('attributions', () => {
  it('list each page once per universe, with the latest read, and the images’ credits', () =>
    run(async (api, _db, { mapId, gudrun }) => {
      const page = 'https://wiki.example.test/wiki/Gudrun';
      const cite = (entityId: string, target: string, retrievedAt: string) =>
        api.expect(201, 'POST', `/entities/${entityId}/citations`, {
          target,
          sourceUrl: page,
          sourceTitle: 'Gudrun',
          license: 'CC-BY-SA',
          retrievedAt,
        });
      await cite(gudrun.id, 'description', READ_AT);
      await cite(gudrun.id, 'name', '2026-11-15T10:00:00.000Z');
      // A draft's citation counts for nothing, and its page isn't listed for it.
      const draft = await object(api, mapId, {
        name: rt.plain('Halcyon'),
        baseType: 'system',
        status: 'draft',
      });
      await api.expect(201, 'POST', `/entities/${String(draft.id)}/citations`, {
        target: 'description',
        sourceUrl: 'https://wiki.example.test/wiki/Halcyon',
        retrievedAt: READ_AT,
      });
      // A page cited only by spoilers is marked, for the page to hide its title.
      const secret = await object(api, mapId, {
        name: rt.plain('Erebus'),
        baseType: 'system',
        isSpoiler: true,
      });
      await api.expect(201, 'POST', `/entities/${String(secret.id)}/citations`, {
        target: 'description',
        sourceUrl: 'https://wiki.example.test/wiki/Erebus',
        sourceTitle: 'Erebus',
        retrievedAt: READ_AT,
      });

      // The same image on a second entry is still one credit.
      await api.expect(201, 'POST', `/entities/${String(secret.id)}/images`, {
        assetId: '00000000-0000-7000-8000-0000000000a1',
      });

      const result = await api.expect(200, 'GET', '/attributions');
      expect(result.body.data).toEqual({
        universes: [
          {
            slug: 'contract',
            name: 'Contract',
            sources: [
              {
                url: 'https://wiki.example.test/wiki/Erebus',
                title: 'Erebus',
                license: null,
                retrievedAt: READ_AT,
                uses: 1,
                spoiler: true,
              },
              {
                url: page,
                title: 'Gudrun',
                license: 'CC-BY-SA',
                retrievedAt: '2026-11-15T10:00:00.000Z',
                uses: 1,
                spoiler: false,
              },
            ],
            images: [
              {
                credit: 'Art by Ana',
                sourceUrl: 'https://art.example.test/gudrun',
                license: 'CC BY 4.0',
              },
            ],
          },
        ],
      });
    }));

  it('leave out what the requester can’t read', () =>
    run(async (api, db, { url, universeId, gudrun }) => {
      await api.expect(201, 'POST', `/entities/${gudrun.id}/citations`, {
        target: 'description',
        sourceUrl: 'https://wiki.example.test/wiki/Gudrun',
        retrievedAt: READ_AT,
      });
      // Locally everything is readable. Anonymous visitors (with accounts) see public ones.
      expect((await api.expect(200, 'GET', '/attributions')).body.data.universes).toHaveLength(1);
      const accounts = await apiOn(url, authConfig(url));
      try {
        const anonymous = async () =>
          (await accounts.expect(200, 'GET', '/attributions')).body.data.universes as Json[];
        expect(await anonymous()).toHaveLength(1);
        await withBatch(
          db,
          { type: 'local', label: 'test' },
          'make it private',
          (tx) =>
            tx
              .update(schema.universes)
              .set({ visibility: 'private' })
              .where(eq(schema.universes.id, universeId)),
          { universeId },
        );
        expect(await anonymous()).toEqual([]);
      } finally {
        await accounts.app.close();
      }
    }));
});
