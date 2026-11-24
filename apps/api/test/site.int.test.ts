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

const GOOGLEBOT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) Chrome/120.0 Safari/537.36';

async function preview(
  api: Api,
  path: string,
  select?: string,
  options: { userAgent?: string; status?: number } = {},
) {
  const query = new URLSearchParams({ path, ...(select ? { select } : {}) });
  const response = await api.app.inject({
    method: 'GET',
    url: `/api/v1/link-preview?${query.toString()}`,
    headers: options.userAgent ? { 'user-agent': options.userAgent } : {},
  });
  expect(response.statusCode).toBe(options.status ?? 200);
  expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
  return { html: response.body, robots: response.headers['x-robots-tag'] };
}

/** A `<meta>` tag's content, by its name or property. */
function tag(html: string, key: string): string | undefined {
  const match = new RegExp(`<meta (?:name|property)="${key}" content="([^"]*)">`).exec(html);
  return match?.[1];
}

/** The page's links under its list's heading, as [text, address]. */
function links(html: string): string[][] {
  return [...html.matchAll(/<li><a href="([^"]*)">([^<]*)<\/a>/g)].map((match) => [
    match[2] ?? '',
    match[1] ?? '',
  ]);
}

async function get(api: Api, url: string) {
  const response = await api.app.inject({ method: 'GET', url });
  expect(response.statusCode).toBe(200);
  return response;
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

  it('give a map and a universe their own cards, with the site’s picture', () =>
    run(async (api) => {
      const map = await preview(api, '/u/contract/main/');
      expect(tag(map.html, 'og:title')).toBe('Main');
      expect(map.html).toContain('<title>Main · Contract · Galaxy Explorer</title>');
      expect(tag(map.html, 'og:image')).toBe(`${SITE}/social-card.jpg`);
      expect(tag(map.html, 'og:image:width')).toBe('1200');
      expect(tag(map.html, 'og:image:height')).toBe('630');
      expect(tag(map.html, 'twitter:card')).toBe('summary_large_image');
      const universe = await preview(api, '/u/contract');
      expect(tag(universe.html, 'og:title')).toBe('Contract');
      expect(tag(universe.html, 'og:description')).toBe('A universe on Galaxy Explorer.');
      expect(tag(universe.html, 'og:image')).toBe(`${SITE}/social-card.jpg`);
    }));

  it('give the home page the site’s card, indexed', () =>
    run(async (api) => {
      const { html, robots } = await preview(api, '/');
      expect(tag(html, 'og:title')).toBe('Galaxy Explorer');
      expect(tag(html, 'og:url')).toBe(`${SITE}/`);
      expect(tag(html, 'og:image')).toBe(`${SITE}/social-card.jpg`);
      expect(robots).toBeUndefined();
    }));

  it('give the home page the home universe’s card, while it’s public', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url, {
        publicUrl: SITE,
        home: { universe: 'contract', path: '/u/contract/main' },
      });
      try {
        const { universeId } = await newWorld(api);
        const home = await preview(api, '/');
        expect(tag(home.html, 'og:title')).toBe('Contract');
        expect(home.html).toContain('<title>Contract · Galaxy Explorer</title>');
        // It links to the home page, not to the universe's own address.
        expect(tag(home.html, 'og:url')).toBe(`${SITE}/`);
        expect(home.robots).toBeUndefined();

        await setVisibility(api, universeId, 'private');
        const hidden = await preview(api, '/');
        expect(tag(hidden.html, 'og:title')).toBe('Galaxy Explorer');
        expect(hidden.html).not.toContain('Contract');
        expect(hidden.robots).toBeUndefined();
      } finally {
        await api.app.close();
      }
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

describe('pages for search engines (D-62)', () => {
  it('give the whole text, a breadcrumb and links down to every view and world', () =>
    run(async (api, _db, { mapId, gudrun }) => {
      const system = await object(api, mapId, {
        name: rt.plain('Scarus'),
        baseType: 'system',
        explorable: true,
        summary: rt.plain('A sector capital.'),
        description: rt.md('First paragraph.\n\nSecond ||secret|| paragraph.'),
      });
      const planet = await object(api, mapId, {
        name: rt.plain('Scarus Prime'),
        baseType: 'planet',
        parentId: system.id,
      });
      await object(api, mapId, {
        name: rt.plain('Hidden'),
        baseType: 'planet',
        parentId: system.id,
        status: 'draft',
      });
      const root = `${SITE}/u/contract/main`;

      const home = await preview(api, '/');
      expect(links(home.html)).toEqual([['Contract', `${SITE}/u/contract`]]);
      expect(home.html).toContain('<h2>Universes</h2>');
      expect(home.html).not.toContain('<nav>');

      const universe = await preview(api, '/u/contract');
      expect(links(universe.html)).toEqual([['Main', root]]);
      expect(universe.html).toContain(`<nav><a href="${SITE}/">Galaxy Explorer</a></nav>`);

      // The galaxy view's objects: a system opens its view, anything else is selected.
      const map = await preview(api, '/u/contract/main');
      expect(links(map.html)).toEqual([
        ['Gudrun', `${root}?select=${gudrun.id}`],
        ['Scarus', `${root}/view/${String(system.id)}`],
      ]);

      const view = await preview(api, `/u/contract/main/view/${String(system.id)}`, undefined, {
        userAgent: GOOGLEBOT,
      });
      expect(view.html).toContain('<p>A sector capital.</p>');
      expect(view.html).toContain('<p>First paragraph.</p>');
      expect(view.html).toContain('<p>Second … paragraph.</p>');
      expect(view.html).not.toContain('secret');
      expect(view.html).toContain('<h2>In this view</h2>');
      // A world in a view is selected there; a draft isn't listed.
      expect(links(view.html)).toEqual([
        ['Scarus Prime', `${root}/view/${String(system.id)}?select=${String(planet.id)}`],
      ]);
      const ld = JSON.parse(
        /<script type="application\/ld\+json">(.*)<\/script>/.exec(view.html)?.[1] ?? '{}',
      ) as Json;
      expect(ld.breadcrumb.itemListElement.map((item: Json) => item.name)).toEqual([
        'Galaxy Explorer',
        'Contract',
        'Main',
        'Scarus',
      ]);
    }));

  it('get a 404 for an address with nothing a stranger may see; chat apps still get a card', () =>
    run(async (api, _db, { universeId, gudrun }) => {
      const missing = [
        '/u/nowhere',
        '/u/contract/nowhere',
        '/u/contract/main/view/00000000-0000-7000-8000-000000000999',
        '/u/contract/main/view/abc-123',
        '/about',
      ];
      for (const path of missing) {
        await preview(api, path, undefined, { userAgent: GOOGLEBOT, status: 404 });
        await preview(api, path, undefined, { userAgent: 'Slackbot-LinkExpanding 1.0' });
      }
      for (const path of [
        '/',
        '/u/contract',
        '/u/contract/main',
        `/u/contract/main/view/${gudrun.id}`,
      ]) {
        await preview(api, path, undefined, { userAgent: GOOGLEBOT });
      }
      // A hidden universe answers as a missing one does.
      await setVisibility(api, universeId, 'link');
      const hidden = await preview(api, `/u/contract/main/view/${gudrun.id}`, undefined, {
        userAgent: GOOGLEBOT,
        status: 404,
      });
      expect(hidden.robots).toBe('noindex');
      expect(hidden.html).not.toMatch(/Gudrun|Contract/);
      const home = await preview(api, '/', undefined, { userAgent: GOOGLEBOT });
      expect(links(home.html)).toEqual([]);
    }));

  it('have a robots.txt that names the sitemap', () =>
    run(async (api) => {
      const response = await get(api, '/api/v1/robots.txt');
      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.body).toContain('User-agent: *\n');
      expect(response.body).toContain('Disallow: /link/\n');
      expect(response.body).toContain('Disallow: /u/*/settings\n');
      expect(response.body).not.toContain('Disallow: /api');
      expect(response.body).toContain(`Sitemap: ${SITE}/sitemap.xml\n`);
    }));

  it('have a sitemap of every public universe, map and view, and nothing else', () =>
    run(async (api, _db, { universeId, mapId }) => {
      const system = await object(api, mapId, {
        name: rt.plain('Scarus'),
        baseType: 'system',
        explorable: true,
      });
      await object(api, mapId, {
        name: rt.plain('Draft'),
        baseType: 'system',
        explorable: true,
        status: 'draft',
      });
      await object(api, mapId, {
        name: rt.plain('Secret'),
        baseType: 'system',
        explorable: true,
        isSpoiler: true,
      });
      await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
        slug: 'hidden',
        name: rt.plain('Hidden'),
        isSpoiler: true,
      });
      const other = await api.expect(201, 'POST', '/universes', {
        slug: 'other',
        name: rt.plain('Other'),
      });
      await setVisibility(api, other.body.data.id as string, 'private');

      const response = await get(api, '/api/v1/sitemap.xml');
      expect(response.headers['content-type']).toBe('application/xml; charset=utf-8');
      const urls = [...response.body.matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]);
      expect(urls).toEqual([
        `${SITE}/`,
        `${SITE}/u/contract`,
        `${SITE}/u/contract/main`,
        `${SITE}/u/contract/main/view/${String(system.id)}`,
      ]);
      expect(response.body).toMatch(/^<\?xml version="1.0" encoding="UTF-8"\?>\n<urlset /);
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
