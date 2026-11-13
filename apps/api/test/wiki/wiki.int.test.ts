import { revertBatch } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NotFound } from '../../src/services/errors.ts';
import { MediaWikiSource, resetWikiQueues } from '../../src/wiki/media-wiki.ts';
import { apiOn, newWorld, type Api } from '../contract/harness.ts';
import { startWikiFixtureServer, type WikiFixtureServer } from '../fixtures/wiki/server.ts';

/** "Fill from wiki" (M7-T3) against a stand-in MediaWiki API (test/fixtures/wiki). */

const USER_AGENT = 'GalaxyExplorer/test (wiki suite)';
let wiki: WikiFixtureServer;

beforeAll(async () => {
  wiki = await startWikiFixtureServer();
});
afterAll(async () => {
  await wiki.close();
});
beforeEach(() => {
  wiki.requests.length = 0;
  resetWikiQueues();
});

describe('the MediaWiki client', () => {
  it('names itself, waits a second between requests to a host, and caches answers', async () => {
    const source = new MediaWikiSource(wiki.apiUrl, { userAgent: USER_AGENT });
    await source.page('Gudrun');
    await source.page('Hubris');
    await source.page('Gudrun'); // from the cache: no third request
    expect(wiki.requests).toHaveLength(2);
    expect(wiki.requests.map((request) => request.headers['user-agent'])).toEqual([
      USER_AGENT,
      USER_AGENT,
    ]);
    const [first, second] = wiki.requests;
    // At least a second apart, give or take the timer's granularity.
    expect((second?.at ?? 0) - (first?.at ?? 0)).toBeGreaterThanOrEqual(990);
    expect(first?.query).toMatchObject({ format: 'json', formatversion: '2', redirects: '1' });
  });

  it('follows redirects, and says when a page is missing', async () => {
    const source = new MediaWikiSource(wiki.apiUrl, { userAgent: USER_AGENT, minIntervalMs: 0 });
    const page = await source.page('Gudrun (planet)');
    expect(page).toMatchObject({ title: 'Gudrun', redirectedFrom: 'Gudrun (planet)' });
    expect(page.wikitext).toContain('{{Planet');
    await expect(source.page('Nowhere')).rejects.toBeInstanceOf(NotFound);
  });
});

const run = (
  fn: (api: Api, db: Parameters<Parameters<typeof withTestDb>[0]>[0]) => Promise<void>,
) =>
  withTestDb(async (db, url) => {
    const api = await apiOn(url, {
      wikiUserAgent: USER_AGENT,
      wikiSources: [{ id: 'w40k', label: 'Warhammer 40k Wiki', apiUrl: wiki.apiUrl }],
    });
    try {
      await fn(api, db);
    } finally {
      await api.close();
    }
  });

describe('the wiki routes', () => {
  it('list the configured wikis, search one, and preview a page', () =>
    run(async (api) => {
      const sources = (await api.expect(200, 'GET', '/wiki/sources')).body.data;
      expect(sources).toEqual([
        { id: 'w40k', label: 'Warhammer 40k Wiki', siteUrl: new URL(wiki.apiUrl).origin },
      ]);
      const hits = (await api.expect(200, 'GET', '/wiki/search?source=w40k&q=gud')).body.data;
      expect(hits).toEqual([{ title: 'Gudrun', snippet: 'Gudrun is a world' }]);

      const preview = (
        await api.expect(
          200,
          'GET',
          `/wiki/preview?source=w40k&title=${encodeURIComponent('Gudrun (planet)')}`,
        )
      ).body.data;
      expect(preview).toMatchObject({
        source: 'w40k',
        title: 'Gudrun',
        redirectedFrom: 'Gudrun (planet)',
        url: 'https://warhammer40k.fandom.com/wiki/Gudrun',
        license: 'CC-BY-SA',
        licenseUrl: 'https://www.fandom.com/licensing',
      });
      expect(preview.templates[0]).toMatchObject({ name: 'Planet' });
      expect(preview.lead).toMatch(/^\*\*Gudrun\*\* is the former capital world/);
    }));

  it('refuse a wiki that isn’t configured, and a missing page, with 404', () =>
    run(async (api) => {
      await api.expect(404, 'GET', '/wiki/search?source=elsewhere&q=x');
      await api.expect(404, 'GET', '/wiki/preview?source=w40k&title=Nowhere');
      // Nothing reached the wiki for the unknown source.
      expect(
        wiki.requests.every((request) => request.query.page === 'Nowhere' || request.query.meta),
      ).toBe(true);
    }));
});

describe('a fill, applied as one batch with citations', () => {
  it('sets the description and facts, cites each, and reverts as one', () =>
    run(async (api, db) => {
      const world = await newWorld(api);
      const planet = (
        await api.expect(201, 'POST', `/maps/${world.mapId}/objects`, {
          name: rt.plain('Gudrun'),
          baseType: 'planet',
        })
      ).body.data;
      const population = (
        await api.expect(201, 'POST', `/universes/${world.universeId}/field-definitions`, {
          key: 'population',
          label: 'Population',
          valueType: 'number',
          unit: 'billion',
          appliesToKind: 'celestial_object',
        })
      ).body.data;
      const cite = (target: string) => ({
        op: 'addCitation',
        id: planet.id,
        data: {
          target,
          sourceUrl: 'https://warhammer40k.fandom.com/wiki/Gudrun',
          sourceTitle: 'Gudrun',
          license: 'CC-BY-SA',
          retrievedAt: '2026-11-13T12:00:00.000Z',
        },
      });
      const fill = await api.expect(200, 'POST', '/batch', {
        description: 'Filled Gudrun from warhammer40k.fandom.com',
        operations: [
          {
            op: 'update',
            kind: 'celestial_object',
            id: planet.id,
            version: planet.version,
            data: { description: rt.md('**Gudrun** is the former capital world.') },
          },
          {
            op: 'setFacts',
            id: planet.id,
            data: [{ fieldDefinitionId: population.id, value: { type: 'number', number: 5 } }],
          },
          cite('description'),
          cite('field:population'),
        ],
      });
      const read = async () =>
        (await api.expect(200, 'GET', `/objects/${planet.id as string}?include=facts,citations`))
          .body.data;
      const filled = await read();
      expect(filled.description.source).toBe('**Gudrun** is the former capital world.');
      expect(filled.facts).toEqual([
        expect.objectContaining({ value: { type: 'number', number: 5 } }),
      ]);
      expect(filled.citations.map((citation: { target: string }) => citation.target)).toEqual([
        'description',
        'field:population',
      ]);
      expect(filled.citations[0]).toMatchObject({ license: 'CC-BY-SA', sourceTitle: 'Gudrun' });

      await revertBatch(db, fill.batchId ?? '', { type: 'local', label: 'test' });
      const reverted = await read();
      expect(reverted.description).toBeNull();
      expect(reverted.facts).toEqual([]);
      expect(reverted.citations).toEqual([]);

      // Citing the same page for the same target twice keeps one citation, with the later time.
      for (const retrievedAt of ['2026-11-13T12:00:00.000Z', '2026-11-14T12:00:00.000Z']) {
        await api.expect(201, 'POST', `/entities/${planet.id as string}/citations`, {
          ...cite('description').data,
          retrievedAt,
        });
      }
      const cited = (await read()).citations;
      expect(cited).toHaveLength(1);
      expect(new Date(cited[0].retrievedAt).toISOString()).toBe('2026-11-14T12:00:00.000Z');
    }));

  it('refuses a citation target that isn’t a text or a field', () =>
    run(async (api) => {
      const world = await newWorld(api);
      const planet = (
        await api.expect(201, 'POST', `/maps/${world.mapId}/objects`, {
          name: rt.plain('Gudrun'),
          baseType: 'planet',
        })
      ).body.data;
      await api.expect(400, 'POST', `/entities/${planet.id as string}/citations`, {
        target: 'everything',
        sourceUrl: 'https://warhammer40k.fandom.com/wiki/Gudrun',
        retrievedAt: '2026-11-13T12:00:00.000Z',
      });
    }));
});
