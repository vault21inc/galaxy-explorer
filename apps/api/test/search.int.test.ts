import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { apiOn, newWorld, type Api } from './contract/harness.ts';

/** Search (M7-T6): spoiler-aware indexes kept by every change batch. */

type Json = Record<string, any>;

function run(fn: (api: Api, world: { universeId: string; mapId: string }) => Promise<void>) {
  return withTestDb(async (_db, url) => {
    const api = await apiOn(url);
    try {
      await fn(api, await newWorld(api));
    } finally {
      await api.app.close();
    }
  });
}

async function search(api: Api, universeId: string, q: string, spoilers = 'include', extra = '') {
  const result = await api.expect(
    200,
    'GET',
    `/universes/${universeId}/search?q=${encodeURIComponent(q)}&spoilers=${spoilers}${extra}`,
  );
  return result.body.data as Json[];
}

const names = (results: Json[]) => results.map((result) => result.name);

async function object(api: Api, mapId: string, body: Json) {
  return (await api.expect(201, 'POST', `/maps/${mapId}/objects`, body)).body.data as Json;
}

describe('search', () => {
  it('finds a spoiler-only word with spoilers included, and not with them excluded', () =>
    run(async (api, { universeId, mapId }) => {
      await object(api, mapId, {
        name: rt.plain('Gudrun'),
        baseType: 'system',
        description: rt.md('A cold world. ||Heretics hide in its hives.||'),
      });
      await object(api, mapId, {
        name: rt.plain('Erebus'),
        baseType: 'system',
        isSpoiler: true,
        summary: rt.plain('Where the reach fell silent.'),
      });

      expect(names(await search(api, universeId, 'heretics'))).toEqual(['Gudrun']);
      expect(await search(api, universeId, 'heretics', 'exclude')).toEqual([]);
      // A whole hidden entry can't be found by anything, not even its name.
      expect(names(await search(api, universeId, 'erebus'))).toEqual(['Erebus']);
      expect(await search(api, universeId, 'erebus', 'exclude')).toEqual([]);
      expect(await search(api, universeId, 'silent', 'exclude')).toEqual([]);

      // Snippets come from the public text when spoilers are excluded.
      const [open] = await search(api, universeId, 'cold');
      const [hidden] = await search(api, universeId, 'cold', 'exclude');
      expect(open?.snippet).toContain('Heretics');
      expect(hidden?.snippet).toBe('A cold world.');
    }));

  it('matches word starts without case or accents, names first, with a path', () =>
    run(async (api, { universeId, mapId }) => {
      const system = await object(api, mapId, {
        name: rt.plain('Gudrun System'),
        baseType: 'system',
      });
      await object(api, mapId, {
        name: rt.plain('Gudrún'),
        baseType: 'planet',
        parentId: system.id,
      });
      await object(api, mapId, {
        name: rt.plain('Hubris'),
        baseType: 'system',
        summary: rt.plain('Far from Gudrun.'),
      });
      const results = await search(api, universeId, 'gud');
      expect(names(results)).toEqual(['Gudrún', 'Gudrun System', 'Hubris']);
      expect(results[0]).toMatchObject({ kind: 'celestial_object', parentId: system.id, mapId });
      expect(results[0]?.path).toEqual(['Main', 'Gudrun System']);
      expect(results[2]?.snippet).toBe('Far from Gudrun.');
      expect(names(await search(api, universeId, 'GUDRUN sys'))).toEqual(['Gudrun System']);
      expect(await search(api, universeId, '?!')).toEqual([]);
    }));

  it('indexes text facts and relation roles, and keeps up with reverts', () =>
    run(async (api, { universeId, mapId }) => {
      const planet = await object(api, mapId, { name: rt.plain('Gudrun'), baseType: 'system' });
      const climate = (
        await api.expect(201, 'POST', `/universes/${universeId}/field-definitions`, {
          key: 'climate',
          label: 'Climate',
          valueType: 'text',
          appliesToKind: 'celestial_object',
        })
      ).body.data as Json;
      const fact = await api.expect(
        200,
        'PUT',
        `/entities/${String(planet.id)}/facts/${String(climate.id)}`,
        { value: { type: 'text', text: rt.plain('Temperate hives') } },
      );
      expect(names(await search(api, universeId, 'temperate'))).toEqual(['Gudrun']);

      // Renaming afterwards refreshes the index, and the fact's batch still reverts: a refresh
      // is derived data, not an edit that could conflict.
      await api.expect(200, 'PATCH', `/objects/${String(planet.id)}`, {
        version: planet.version,
        name: rt.plain('Gudrun Prime'),
      });
      expect(names(await search(api, universeId, 'prime'))).toEqual(['Gudrun Prime']);
      await api.expect(201, 'POST', `/history/${String(fact.batchId)}/revert`);
      expect(await search(api, universeId, 'temperate')).toEqual([]);
      const history = (await api.expect(200, 'GET', `/history/${String(fact.batchId)}`)).body.data;
      expect(JSON.stringify(history)).not.toContain('search_');

      const character = (
        await api.expect(201, 'POST', `/universes/${universeId}/characters`, {
          name: rt.plain('Eisenhorn'),
        })
      ).body.data as Json;
      const event = (
        await api.expect(201, 'POST', `/maps/${mapId}/events`, { name: rt.plain('The purge') })
      ).body.data as Json;
      await api.expect(201, 'POST', `/entities/${String(character.id)}/relations`, {
        relationType: 'participant',
        toEntityId: event.id,
        role: rt.plain('Inquisitor leading the hunt'),
      });
      expect(names(await search(api, universeId, 'hunt'))).toEqual(['Eisenhorn', 'The purge']);
    }));

  it('hides drafts unless an editor asks for them', () =>
    run(async (api, { universeId, mapId }) => {
      await object(api, mapId, { name: rt.plain('Halcyon'), baseType: 'system', status: 'draft' });
      expect(await search(api, universeId, 'halcyon')).toEqual([]);
      expect(
        names(await search(api, universeId, 'halcyon', 'include', '&includeDrafts=true')),
      ).toEqual(['Halcyon']);
    }));
});
