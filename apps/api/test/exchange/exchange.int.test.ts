import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readZip, writeZip } from '../../src/exchange/zip.ts';
import { seedDemo } from '../../src/seeds/demo.ts';
import { apiOn, type Api } from '../contract/harness.ts';
import { multipart } from '../helpers.ts';

/** Import and export (M7-T4). */

let mediaDir: string;
beforeEach(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'ge-exchange-'));
});
afterEach(async () => {
  await rm(mediaDir, { recursive: true, force: true });
});

type Files = Map<string, Uint8Array>;
type Json = Record<string, any>;

const decoder = new TextDecoder();
const json = (files: Files, path: string) => JSON.parse(decoder.decode(files.get(path))) as Json;
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

async function exported(api: Api, url: string): Promise<Files> {
  const response = await api.app.inject({ method: 'GET', url: `/api/v1${url}` });
  expect(response.statusCode, response.body).toBe(200);
  expect(response.headers['content-type']).toBe('application/zip');
  return readZip(response.rawPayload);
}

async function imported(
  api: Api,
  universeId: string,
  data: Uint8Array,
  query: string,
  filename = 'export.zip',
) {
  const body = multipart(Buffer.from(data), filename, 'application/octet-stream');
  const response = await api.app.inject({
    method: 'POST',
    url: `/api/v1/universes/${universeId}/import?${query}`,
    ...body,
  });
  return { status: response.statusCode, body: response.json<Json>() };
}

const zipOf = (files: Files) =>
  writeZip(
    [...files].map(([path, data]) => ({ path, data })),
    new Date(),
  );

async function newUniverse(api: Api, slug: string): Promise<string> {
  return (await api.expect(201, 'POST', '/universes', { slug, name: rt.plain(slug) })).body.data
    .id as string;
}

/** The export's JSON files, without the time it was made. */
function content(files: Files): Json {
  const result: Json = {};
  for (const path of [...files.keys()].sort()) {
    if (!path.endsWith('.json')) continue;
    const file = json(files, path);
    if (path === 'manifest.json') delete file.exportedAt;
    result[path] = file;
  }
  return result;
}

function withDemo(fn: (api: Api, universeId: string) => Promise<void>) {
  return withTestDb(async (db, url) => {
    const { universeId } = await seedDemo(db);
    const api = await apiOn(url, { mediaDir });
    try {
      await fn(api, universeId);
    } finally {
      await api.app.close();
    }
  });
}

describe('export and import', () => {
  it('round-trips the demo universe into an empty install, file for file', () =>
    withDemo(async (source, demoId) => {
      const first = await exported(source, `/universes/${demoId}/export`);
      const manifest = json(first, 'manifest.json');
      expect(manifest).toMatchObject({
        format: 'galaxy-explorer',
        formatVersion: 1,
        scope: 'universe',
      });
      expect(manifest.maps).toEqual(['main', 'after-the-fall']);

      await withTestDb(async (_db, url) => {
        const empty = await apiOn(url, { mediaDir });
        try {
          const universeId = await newUniverse(empty, 'example-universe');
          const result = await imported(empty, universeId, zipOf(first), 'mode=create');
          expect(result.status, JSON.stringify(result.body)).toBe(200);
          const report = result.body.data as Json;
          expect(report).toMatchObject({ blocked: false, conflicts: [], unresolved: [] });
          expect(report.counts.objects.create).toBe(manifest.counts.objects);
          expect(report.batchId).toEqual(expect.any(String));
          // The demo's placeholder images have no files, here as there.
          expect(report.notes.length).toBeGreaterThan(0);

          const second = await exported(empty, `/universes/${universeId}/export`);
          expect(content(second)).toEqual(content(first));
        } finally {
          await empty.app.close();
        }
      });
    }));

  it('a merge updates entries by key without duplicating them', () =>
    withDemo(async (api, demoId) => {
      const files = await exported(api, `/universes/${demoId}/export`);
      const main = json(files, 'maps/main.json');
      const aster = (main.objects as Json[]).find((object) => object.externalKey === 'demo-aster');
      if (!aster) throw new Error('The demo has no Aster.');
      aster.x = 1_234;
      (main.objects as Json[]).push({
        externalKey: 'new-system',
        name: rt.plain('New System'),
        baseType: 'system',
      });
      files.set('maps/main.json', encode(main));
      const before = (await api.expect(200, 'GET', `/universes/${demoId}/maps`)).body
        .data as Json[];
      const mainId = before.find((map) => map.slug === 'main')?.id as string;
      const count = async () =>
        (
          (await api.expect(200, 'GET', `/maps/${mainId}/objects?limit=1000&includeDrafts=true`))
            .body.data as Json[]
        ).length;
      const objectsBefore = await count();

      const result = await imported(api, demoId, zipOf(files), 'mode=merge');
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.data.counts.objects).toMatchObject({ create: 1 });
      expect(result.body.data.counts.objects.update).toBeGreaterThan(0);
      expect(await count()).toBe(objectsBefore + 1);
      const objects = (await api.expect(200, 'GET', `/maps/${mainId}/objects?limit=1000`)).body
        .data as Json[];
      expect(objects.find((object) => object.externalKey === 'demo-aster')?.x).toBe(1_234);
      // The maps and settings rows matched by slug and name: none were added.
      const after = (await api.expect(200, 'GET', `/universes/${demoId}/maps`)).body.data as Json[];
      expect(after).toHaveLength(before.length);
      expect(result.body.data.counts.groupTypes.create).toBe(0);
    }));

  it('a dry run reports and changes nothing', () =>
    withDemo(async (api, demoId) => {
      const files = await exported(api, `/universes/${demoId}/export`);
      const universeId = await newUniverse(api, 'copy');
      const history = async () =>
        (await api.expect(200, 'GET', `/universes/${universeId}/history`)).body.data as Json[];
      const historyBefore = await history();
      const result = await imported(api, universeId, zipOf(files), 'mode=create&dryRun=true');
      expect(result.status).toBe(200);
      expect(result.body.data).toMatchObject({ dryRun: true, batchId: null, blocked: false });
      expect(result.body.data.counts.maps.create).toBe(2);
      expect((await api.expect(200, 'GET', `/universes/${universeId}/maps`)).body.data).toEqual([]);
      expect(await history()).toEqual(historyBefore);
    }));

  it('fills an empty map of the same slug, as a new universe’s first map is', () =>
    withDemo(async (api, demoId) => {
      const files = await exported(api, `/universes/${demoId}/export`);
      // As the home page makes a universe: with an empty "main" map (found in the M7 demo).
      const universeId = await newUniverse(api, 'fresh');
      const first = (
        await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
          slug: 'main',
          name: rt.plain('Main'),
        })
      ).body.data as Json;
      const result = await imported(api, universeId, zipOf(files), 'mode=create');
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body.data).toMatchObject({ blocked: false, conflicts: [] });
      expect(result.body.data.counts.maps).toMatchObject({ create: 1, update: 1 });
      const maps = (await api.expect(200, 'GET', `/universes/${universeId}/maps`)).body
        .data as Json[];
      const main = maps.find((map) => map.slug === 'main');
      // The same map, now the file's, with the file's entries.
      expect(main?.id).toBe(first.id);
      expect(main?.namePlain).toBe('The Present Era');
      const objects = (
        await api.expect(
          200,
          'GET',
          `/maps/${String(first.id)}/objects?limit=1000&includeDrafts=true`,
        )
      ).body.data as Json[];
      expect(objects.length).toBe((json(files, 'maps/main.json').objects as Json[]).length);
    }));

  it('refuses to add what is already there, writing nothing, and says why', () =>
    withDemo(async (api, demoId) => {
      const files = await exported(api, `/universes/${demoId}/export`);
      const result = await imported(api, demoId, zipOf(files), 'mode=create');
      expect(result.status).toBe(409);
      expect(result.body.report.blocked).toBe(true);
      expect(result.body.report.conflicts).toContainEqual({
        where: 'maps/main.json',
        message: expect.stringMatching(/slug “main” is already/),
      });
    }));

  it('exports one map with the settings it may use', () =>
    withDemo(async (api, demoId) => {
      const maps = (await api.expect(200, 'GET', `/universes/${demoId}/maps`)).body.data as Json[];
      const main = maps.find((map) => map.slug === 'main');
      const files = await exported(api, `/maps/${String(main?.id)}/export`);
      expect(json(files, 'manifest.json')).toMatchObject({ scope: 'map', maps: ['main'] });
      expect(files.has('maps/after-the-fall.json')).toBe(false);
      expect(json(files, 'universe.json').groupTypes.length).toBeGreaterThan(0);
    }));

  it('carries image files across, and checks them', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url, { mediaDir });
      try {
        const universeId = await newUniverse(api, 'images');
        const png = await sharp({
          create: { width: 64, height: 32, channels: 3, background: '#4fd1ff' },
        })
          .png()
          .toBuffer();
        const upload = await api.app.inject({
          method: 'POST',
          url: `/api/v1/universes/${universeId}/assets`,
          ...multipart(png, 'map.png', 'image/png'),
        });
        expect(upload.statusCode).toBe(201);
        const files = await exported(api, `/universes/${universeId}/export`);
        const [asset] = json(files, 'universe.json').assets as Json[];
        expect(files.has(`assets/${String(asset?.sha256)}/display.webp`)).toBe(true);

        const copy = await newUniverse(api, 'copy');
        const result = await imported(api, copy, zipOf(files), 'mode=create');
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        const [stored] = (await api.expect(200, 'GET', `/universes/${copy}/assets`)).body
          .data as Json[];
        const served = await api.app.inject({ method: 'GET', url: String(stored?.urls.display) });
        expect(served.statusCode).toBe(200);

        // An image that isn't what the file says is refused.
        files.set(`assets/${String(asset?.sha256)}/display.webp`, new Uint8Array([1, 2, 3]));
        const other = await newUniverse(api, 'other');
        const bad = await imported(api, other, zipOf(files), 'mode=create&dryRun=true');
        expect(bad.body.data.conflicts[0].message).toMatch(/can’t be read/);
      } finally {
        await api.app.close();
      }
    }));

  it('carries an animation across, frames and all (D-54)', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url, { mediaDir });
      try {
        const universeId = await newUniverse(api, 'moving');
        const width = 24;
        const height = 16;
        const frames = 3;
        const pixels = Buffer.alloc(width * height * frames * 3);
        for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2_654_435_761) >>> 24;
        const gif = await sharp(pixels, {
          raw: { width, height: height * frames, channels: 3, pageHeight: height },
        })
          .gif()
          .toBuffer();
        const upload = await api.app.inject({
          method: 'POST',
          url: `/api/v1/universes/${universeId}/assets`,
          ...multipart(gif, 'blink.gif', 'image/gif'),
        });
        expect(upload.statusCode, upload.body).toBe(201);
        const files = await exported(api, `/universes/${universeId}/export`);
        const [asset] = json(files, 'universe.json').assets as Json[];
        expect(asset?.variants.animated).toEqual({ width, height });

        const copy = await newUniverse(api, 'moving-copy');
        const result = await imported(api, copy, zipOf(files), 'mode=create');
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        expect(result.body.data.conflicts).toEqual([]);
        const [stored] = (await api.expect(200, 'GET', `/universes/${copy}/assets`)).body
          .data as Json[];
        const served = await api.app.inject({ method: 'GET', url: String(stored?.urls.animated) });
        expect(served.statusCode).toBe(200);
        expect((await sharp(served.rawPayload).metadata()).pages).toBe(frames);
      } finally {
        await api.app.close();
      }
    }));

  it('carries citations across with ISO dates, and reads older exports’ dates', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url, { mediaDir });
      try {
        const universeId = await newUniverse(api, 'cited');
        const map = (
          await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
            slug: 'main',
            name: rt.plain('Main'),
          })
        ).body.data as Json;
        const cadia = (
          await api.expect(201, 'POST', `/maps/${String(map.id)}/objects`, {
            name: rt.plain('Cadia'),
            baseType: 'planet',
          })
        ).body.data as Json;
        const added = await api.expect(201, 'POST', `/entities/${String(cadia.id)}/citations`, {
          target: 'description',
          sourceUrl: 'https://warhammer40k.fandom.com/wiki/Cadia',
          sourceTitle: 'Cadia',
          license: 'CC-BY-SA',
          retrievedAt: '2026-11-13T23:28:45.496+00:00',
        });
        // The API answers in ISO 8601, as it was sent (in UTC).
        expect(added.body.data.retrievedAt).toBe('2026-11-13T23:28:45.496Z');

        const files = await exported(api, `/universes/${universeId}/export`);
        const main = json(files, 'maps/main.json');
        expect(main.objects[0].citations).toEqual([
          {
            target: 'description',
            sourceUrl: 'https://warhammer40k.fandom.com/wiki/Cadia',
            sourceTitle: 'Cadia',
            license: 'CC-BY-SA',
            retrievedAt: '2026-11-13T23:28:45.496Z',
          },
        ]);

        const citedIn = async (copy: string) => {
          const maps = (await api.expect(200, 'GET', `/universes/${copy}/maps`)).body
            .data as Json[];
          const [object] = (
            await api.expect(200, 'GET', `/maps/${String(maps[0]?.id)}/objects?limit=10`)
          ).body.data as Json[];
          const citations = (
            await api.expect(200, 'GET', `/entities/${String(object?.id)}/citations`)
          ).body.data as Json[];
          return citations.map((citation) => citation.retrievedAt as string);
        };
        const copy = await newUniverse(api, 'copy');
        const result = await imported(api, copy, zipOf(files), 'mode=create');
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        expect(await citedIn(copy)).toEqual(['2026-11-13T23:28:45.496Z']);

        // Exports made before 2026-11-15 wrote the date as Postgres prints it.
        main.objects[0].citations[0].retrievedAt = '2026-11-13 23:28:45.496+00';
        files.set('maps/main.json', encode(main));
        const older = await newUniverse(api, 'older');
        const fromOlder = await imported(api, older, zipOf(files), 'mode=create');
        expect(fromOlder.status, JSON.stringify(fromOlder.body)).toBe(200);
        expect(await citedIn(older)).toEqual(['2026-11-13T23:28:45.496Z']);
      } finally {
        await api.app.close();
      }
    }));
});

describe('entries without keys', () => {
  it('round-trip by refs made from their names, nested, grouped, routed and located', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url, { mediaDir });
      try {
        const universeId = await newUniverse(api, 'keyless');
        const map = (
          await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
            slug: 'main',
            name: rt.plain('Main'),
          })
        ).body.data as Json;
        const type = (
          await api.expect(201, 'POST', `/universes/${universeId}/group-types`, {
            name: 'Sector',
            layer: 'Administrative',
            defaultColor: '#4fd1ff',
          })
        ).body.data as Json;
        const field = (
          await api.expect(201, 'POST', `/universes/${universeId}/field-definitions`, {
            key: 'population',
            label: 'Population',
            valueType: 'number',
            appliesToKind: 'celestial_object',
          })
        ).body.data as Json;
        const object = async (body: Json) =>
          (await api.expect(201, 'POST', `/maps/${String(map.id)}/objects`, body)).body
            .data as Json;
        // Two systems called Gudrun: their refs are "gudrun" and "gudrun-2".
        const first = await object({ name: rt.plain('Gudrun'), baseType: 'system', x: 10 });
        const second = await object({ name: rt.plain('Gudrun'), baseType: 'system', x: 20 });
        const planet = await object({
          name: rt.plain('Gudrun Prime'),
          baseType: 'planet',
          parentId: second.id,
        });
        await api.expect(200, 'PUT', `/entities/${String(planet.id)}/facts/${String(field.id)}`, {
          value: { type: 'number', number: 5 },
        });
        const place = (
          await api.expect(201, 'POST', `/maps/${String(map.id)}/places`, {
            name: rt.plain('Hive Primus'),
          })
        ).body.data as Json;
        await api.expect(200, 'PUT', `/entities/${String(place.id)}/location`, {
          mode: 'surface',
          objectId: planet.id,
          latDeg: 10,
          lonDeg: 20,
        });
        const group = (
          await api.expect(201, 'POST', `/maps/${String(map.id)}/groups`, {
            name: rt.plain('Helican'),
            groupTypeId: type.id,
          })
        ).body.data as Json;
        await api.expect(200, 'PUT', `/groups/${String(group.id)}/members`, {
          members: [{ objectId: first.id }, { objectId: second.id }],
        });
        const route = (
          await api.expect(201, 'POST', `/maps/${String(map.id)}/routes`, {
            name: rt.plain('The run'),
          })
        ).body.data as Json;
        await api.expect(200, 'PUT', `/routes/${String(route.id)}/waypoints`, {
          objectIds: [first.id, second.id, first.id],
        });

        const files = await exported(api, `/universes/${universeId}/export`);
        const main = json(files, 'maps/main.json');
        expect((main.objects as Json[]).map((record) => record.ref)).toEqual([
          'gudrun',
          'gudrun-2',
          'gudrun-prime',
        ]);
        expect((main.objects as Json[])[2]).toMatchObject({
          parent: 'gudrun-2',
          facts: [{ field: 'population', value: { type: 'number', number: 5 } }],
        });
        expect((main.places as Json[])[0]?.location).toEqual({
          mode: 'surface',
          object: 'gudrun-prime',
          latDeg: 10,
          lonDeg: 20,
          isSpoiler: false,
        });
        expect((main.routes as Json[])[0]?.waypoints).toEqual(['gudrun', 'gudrun-2', 'gudrun']);
        expect((main.groups as Json[])[0]).toMatchObject({
          groupType: 'Sector',
          members: [{ object: 'gudrun' }, { object: 'gudrun-2' }],
        });

        const copy = await newUniverse(api, 'copy');
        const result = await imported(api, copy, zipOf(files), 'mode=create');
        expect(result.status, JSON.stringify(result.body)).toBe(200);
        const again = await exported(api, `/universes/${copy}/export`);
        expect(content(again)).toEqual(content(files));
      } finally {
        await api.app.close();
      }
    }));
});

describe('CSV import', () => {
  const csv = (rows: string[]) =>
    new TextEncoder().encode(
      ['name,base_type,x,y,z,parent_key,group_key,external_key', ...rows].join('\n'),
    );

  it('places objects, nests them by key and puts them in groups; a merge updates by key', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url, { mediaDir });
      try {
        const universeId = await newUniverse(api, 'csv');
        const map = await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
          slug: 'main',
          name: rt.plain('Main'),
        });
        const mapId = map.body.data.id as string;
        const type = await api.expect(201, 'POST', `/universes/${universeId}/group-types`, {
          name: 'Sub-sector',
          layer: 'Administrative',
          defaultColor: '#c8a24a',
        });
        await api.expect(201, 'POST', `/maps/${mapId}/groups`, {
          name: rt.plain('Helican'),
          groupTypeId: type.body.data.id,
          externalKey: 'helican',
        });

        const first = csv([
          'Gudrun System,system,100,0,-50,,helican,gudrun-system',
          'Gudrun,planet,4,0,0,gudrun-system,,gudrun',
          'A marker,marker,7,0,7,,,',
        ]);
        const created = await imported(api, universeId, first, `mapId=${mapId}`, 'objects.csv');
        expect(created.status, JSON.stringify(created.body)).toBe(200);
        expect(created.body.data.counts).toMatchObject({
          objects: { create: 3 },
          members: { create: 1 },
        });
        const objects = async () =>
          (await api.expect(200, 'GET', `/maps/${mapId}/objects?limit=100`)).body.data as Json[];
        const system = (await objects()).find((object) => object.externalKey === 'gudrun-system');
        expect((await objects()).find((object) => object.externalKey === 'gudrun')?.parentId).toBe(
          system?.id,
        );

        const merged = await imported(
          api,
          universeId,
          csv(['Gudrun System,system,200,,,,,gudrun-system', 'Another marker,marker,1,1,1,,,']),
          `mapId=${mapId}&mode=merge`,
          'objects.csv',
        );
        expect(merged.status, JSON.stringify(merged.body)).toBe(200);
        expect(merged.body.data.counts.objects).toMatchObject({ update: 1, skip: 1 });
        const after = await objects();
        expect(after).toHaveLength(3);
        expect(after.find((object) => object.externalKey === 'gudrun-system')).toMatchObject({
          x: 200,
          z: -50,
        });
      } finally {
        await api.app.close();
      }
    }));

  it('reports references to nothing, and mistakes by line', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url, { mediaDir });
      try {
        const universeId = await newUniverse(api, 'csv');
        const map = await api.expect(201, 'POST', `/universes/${universeId}/maps`, {
          slug: 'main',
          name: rt.plain('Main'),
        });
        const mapId = map.body.data.id as string;
        const unresolved = await imported(
          api,
          universeId,
          csv(['Gudrun,planet,,,,nowhere,,gudrun']),
          `mapId=${mapId}&dryRun=true`,
          'objects.csv',
        );
        expect(unresolved.body.data.unresolved).toEqual([
          { where: 'line 2', message: 'Nothing in the file or the universe is called “nowhere”.' },
        ]);
        const refused = await imported(
          api,
          universeId,
          csv(['Gudrun,planet,,,,nowhere,,gudrun']),
          `mapId=${mapId}`,
          'objects.csv',
        );
        expect(refused.status).toBe(409);

        const wrong = await imported(
          api,
          universeId,
          csv(['Gudrun,comet,far,,,,,']),
          `mapId=${mapId}`,
          'objects.csv',
        );
        expect(wrong.status).toBe(400);
        expect(wrong.body.errors.map((error: Json) => error.path)).toEqual(['line 2', 'line 2']);

        const noMap = await imported(
          api,
          universeId,
          csv(['Gudrun,planet,,,,,,']),
          '',
          'objects.csv',
        );
        expect(noMap.status).toBe(400);
      } finally {
        await api.app.close();
      }
    }));
});

describe('the format', () => {
  it('is published as JSON Schema', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url);
      try {
        const schema = (
          await api.app.inject({ method: 'GET', url: '/api/v1/export-schema.json' })
        ).json<Json>();
        expect(schema.properties).toHaveProperty(['maps/<slug>.json']);
      } finally {
        await api.app.close();
      }
    }));

  it('is the editor’s alone on the private preview', () =>
    withTestDb(async (_db, url) => {
      const api = await apiOn(url, { previewRoles: true });
      try {
        const editor = { 'x-ge-role': 'editor' };
        const universe = await api.app.inject({
          method: 'POST',
          url: '/api/v1/universes',
          headers: editor,
          payload: { slug: 'u', name: rt.plain('U') },
        });
        const id = universe.json<Json>().data.id as string;
        const asReader = await api.app.inject({
          method: 'GET',
          url: `/api/v1/universes/${id}/export`,
        });
        expect(asReader.statusCode).toBe(403);
        const asEditor = await api.app.inject({
          method: 'GET',
          url: `/api/v1/universes/${id}/export`,
          headers: editor,
        });
        expect(asEditor.statusCode).toBe(200);
      } finally {
        await api.app.close();
      }
    }));
});
