import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { withTestDb } from '@ge/db/testing';
import { MAX_UPLOAD_BYTES, rt } from '@ge/domain';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { apiOn, newWorld, type Api } from './contract/harness.ts';
import { multipart } from './helpers.ts';

/** Image uploads and the media route (M3-T7, architecture.md §8). */

let mediaDir: string;
beforeEach(async () => {
  mediaDir = await mkdtemp(join(tmpdir(), 'ge-media-'));
});
afterEach(async () => {
  await rm(mediaDir, { recursive: true, force: true });
});

const run = (fn: (api: Api, world: { universeId: string; mapId: string }) => Promise<void>) =>
  withTestDb(async (_db, url) => {
    const api = await apiOn(url, { mediaDir });
    try {
      await fn(api, await newWorld(api));
    } finally {
      await api.close();
    }
  });

async function upload(
  api: Api,
  universeId: string,
  data: Buffer,
  filename = 'image.png',
  contentType = 'image/png',
) {
  const response = await api.app.inject({
    method: 'POST',
    url: `/api/v1/universes/${universeId}/assets`,
    ...multipart(data, filename, contentType),
  });
  return { status: response.statusCode, body: response.json<Record<string, any>>() };
}

/** A noisy image, so the encoder can't make it tiny and sizes stay realistic. */
function png(width: number, height: number) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 2_654_435_761) >>> 24;
  return sharp(pixels, { raw: { width, height, channels: 3 } })
    .png()
    .toBuffer();
}

const stored = (key: string) => readFile(join(mediaDir, key));

/** A PNG that is only a header claiming `width` × `height`, and a scrap of data. */
function pngClaiming(width: number, height: number) {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // 8 bits per sample, greyscale
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.alloc(1_000))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('POST /universes/{id}/assets', () => {
  it('turns a PNG into WebP variants of the expected sizes', () =>
    run(async (api, { universeId }) => {
      const original = await png(3_000, 2_000);
      const { status, body } = await upload(api, universeId, original, 'nebula.png');
      expect(status, JSON.stringify(body)).toBe(201);
      const asset = body.data;
      const id = asset.id as string;
      expect(asset).toMatchObject({
        universeId,
        mimeType: 'image/webp',
        width: 3_000,
        height: 2_000,
        byteSize: original.length,
        originalFilename: 'nebula.png',
        credit: null,
        variants: {
          thumb: { key: `u/${universeId}/${id}/thumb.webp`, width: 256, height: 171 },
          display: { key: `u/${universeId}/${id}/display.webp`, width: 1_600, height: 1_067 },
        },
        urls: {
          thumb: `/media/u/${universeId}/${id}/thumb.webp`,
          display: `/media/u/${universeId}/${id}/display.webp`,
        },
      });
      for (const [name, size] of [
        ['thumb', [256, 171]],
        ['display', [1_600, 1_067]],
      ] as const) {
        const file = await stored(asset.variants[name].key);
        expect((await fileTypeFromBuffer(file))?.mime).toBe('image/webp');
        const meta = await sharp(file).metadata();
        expect([meta.width, meta.height]).toEqual(size);
      }
    }));

  it('makes an exactly 2:1, power-of-two `texture` variant for a map of a globe (M6-T2)', () =>
    run(async (api, { universeId, mapId }) => {
      const big = (await upload(api, universeId, await png(3_000, 1_500), 'big.png')).body.data;
      expect(big.variants.texture).toEqual({
        key: `u/${universeId}/${big.id as string}/texture.webp`,
        width: 2_048,
        height: 1_024,
      });
      const file = await stored(big.variants.texture.key as string);
      const meta = await sharp(file).metadata();
      expect([meta.width, meta.height]).toEqual([2_048, 1_024]);
      // Nearly 2:1 is stretched to exactly 2:1; a small map gets the power of two below it.
      const near = (await upload(api, universeId, await png(1_000, 510), 'near.png')).body.data;
      expect(near.variants.texture).toMatchObject({ width: 512, height: 256 });
      // Anything else isn't a globe map.
      const photo = (await upload(api, universeId, await png(900, 600), 'photo.png')).body.data;
      expect(photo.variants).not.toHaveProperty('texture');

      // A planet's surface map reaches the system view as the texture variant.
      const system = await api.expect(201, 'POST', `/maps/${mapId}/objects`, {
        name: rt.plain('Corvid'),
        baseType: 'system',
        explorable: true,
      });
      const systemId = system.body.data.id as string;
      const planet = await api.expect(201, 'POST', `/maps/${mapId}/objects`, {
        name: rt.plain('Corvid Prime'),
        baseType: 'planet',
        parentId: systemId,
        appearance: { planet: { texture: 'upload' } },
      });
      const planetId = planet.body.data.id as string;
      await api.expect(201, 'POST', `/entities/${planetId}/images`, {
        assetId: big.id,
        role: 'surface_texture',
      });
      const view = await api.expect(200, 'GET', `/objects/${systemId}/views/system`);
      const child = (view.body.data.children as { id: string; surfaceTexture: unknown }[]).find(
        (object) => object.id === planetId,
      );
      expect(child?.surfaceTexture).toEqual({
        assetId: big.id,
        url: `/media/u/${universeId}/${big.id as string}/texture.webp`,
        isSpoiler: false,
      });
    }));

  it('never enlarges a small image', () =>
    run(async (api, { universeId }) => {
      const { body } = await upload(api, universeId, await png(120, 80));
      expect(body.data.variants.thumb).toMatchObject({ width: 120, height: 80 });
      expect(body.data.variants.display).toMatchObject({ width: 120, height: 80 });
    }));

  it('leaves EXIF behind and stands photos upright', () =>
    run(async (api, { universeId }) => {
      // A 400 × 200 photo whose EXIF says "rotate 90°", with a camera owner and GPS-ish text.
      const photo = await sharp(await png(400, 200))
        .jpeg()
        .withMetadata({
          orientation: 6,
          exif: { IFD0: { Copyright: 'SECRET-OWNER', Artist: 'SECRET-ARTIST' } },
        })
        .toBuffer();
      expect(photo.includes('SECRET-OWNER')).toBe(true);
      const { status, body } = await upload(api, universeId, photo, 'photo.jpg', 'image/jpeg');
      expect(status).toBe(201);
      expect(body.data).toMatchObject({ width: 200, height: 400 });
      for (const name of ['thumb', 'display']) {
        const file = await stored(body.data.variants[name].key);
        expect(file.includes('SECRET-OWNER')).toBe(false);
        expect(file.includes('SECRET-ARTIST')).toBe(false);
        const meta = await sharp(file).metadata();
        expect(meta.exif).toBeUndefined();
        expect(meta.orientation).toBeUndefined();
      }
    }));

  it('rejects a renamed .exe, whatever its name and claimed type', () =>
    run(async (api, { universeId }) => {
      // "MZ" starts every Windows executable.
      const exe = Buffer.concat([
        Buffer.from('MZ\x90\x00\x03\x00\x00\x00'),
        Buffer.alloc(4_096, 7),
      ]);
      const { status, body } = await upload(api, universeId, exe, 'cute-cat.png', 'image/png');
      expect(status).toBe(415);
      expect(body.detail).toMatch(/PNG, JPEG, WebP, AVIF or GIF/);
      expect(await readdir(mediaDir)).toEqual([]);
    }));

  it('rejects a file over 25 MB', () =>
    run(async (api, { universeId }) => {
      const tooBig = Buffer.alloc(MAX_UPLOAD_BYTES + 1_024, 1);
      const { status } = await upload(api, universeId, tooBig);
      expect(status).toBe(413);
      expect(await readdir(mediaDir)).toEqual([]);
    }));

  it('refuses an image whose header claims more pixels than it may decode', () =>
    run(async (api, { universeId }) => {
      // 74 bytes that say 30,000 × 30,000: a "decompression bomb" (M8-T3).
      const { status, body } = await upload(api, universeId, pngClaiming(30_000, 30_000));
      expect(status).toBe(415);
      expect(body.detail).toMatch(/more than 134 million pixels/);
      expect(await readdir(mediaDir)).toEqual([]);
    }));

  it('reads the first file and nothing after it (M8-T3)', () =>
    run(async (api, { universeId }) => {
      const send = (payload: Buffer, boundary: string) =>
        api.app.inject({
          method: 'POST',
          url: `/api/v1/universes/${universeId}/assets`,
          payload,
          headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
        });
      const image = await png(32, 32);
      const part = (boundary: string, name: string, body: Buffer, file = false) =>
        Buffer.concat([
          Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${name}"${file ? '; filename="a.png"\r\nContent-Type: image/png' : ''}\r\n\r\n`,
          ),
          body,
          Buffer.from('\r\n'),
        ]);
      const close = (boundary: string) => Buffer.from(`--${boundary}--\r\n`);

      const twoFiles = Buffer.concat([
        part('b1', 'file', image, true),
        part('b1', 'other', image, true),
        close('b1'),
      ]);
      // The first file is the upload; the request isn't read past it.
      const first = await send(twoFiles, 'b1');
      expect(first.statusCode).toBe(201);
      const list = await api.expect(200, 'GET', `/universes/${universeId}/assets`);
      expect(list.body.data).toHaveLength(1);
    }));

  it('returns the same asset when the same file is uploaded twice', () =>
    run(async (api, { universeId }) => {
      const image = await png(300, 300);
      const first = await upload(api, universeId, image, 'one.png');
      const second = await upload(api, universeId, image, 'two.png');
      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      expect(second.body.data.id).toBe(first.body.data.id);
      const list = await api.expect(200, 'GET', `/universes/${universeId}/assets`);
      expect(list.body.data).toHaveLength(1);
      expect(await readdir(join(mediaDir, 'u', universeId))).toEqual([first.body.data.id]);
    }));

  it('is one change batch in the universe history', () =>
    run(async (api, { universeId }) => {
      await upload(api, universeId, await png(64, 64), 'tiny.png');
      const history = await api.expect(200, 'GET', `/universes/${universeId}/history`);
      expect(history.body.data[0]).toMatchObject({ description: 'Upload “tiny.png”' });
    }));
});

describe('asset metadata and images', () => {
  it('PATCH sets credit and alt text; empty text clears them', () =>
    run(async (api, { universeId }) => {
      const { body } = await upload(api, universeId, await png(64, 64));
      const id = body.data.id as string;
      const updated = await api.expect(200, 'PATCH', `/assets/${id}`, {
        credit: 'Photo: Imperial Archive',
        altText: 'A red nebula',
        sourceUrl: 'https://example.com/nebula',
      });
      expect(updated.body.data).toMatchObject({
        credit: 'Photo: Imperial Archive',
        altText: 'A red nebula',
      });
      const cleared = await api.expect(200, 'PATCH', `/assets/${id}`, { credit: '' });
      expect(cleared.body.data.credit).toBeNull();
      await api.expect(400, 'PATCH', `/assets/${id}`, { sourceUrl: 'javascript:alert(1)' });
    }));

  it("an entity's images carry the asset's URLs and credit, hidden with a spoiler image", () =>
    run(async (api, { universeId, mapId }) => {
      const { body } = await upload(api, universeId, await png(64, 64));
      const assetId = body.data.id as string;
      await api.expect(200, 'PATCH', `/assets/${assetId}`, { credit: 'By Ana' });
      const object = await api.expect(201, 'POST', `/maps/${mapId}/objects`, {
        name: rt.plain('Corvid'),
        baseType: 'system',
      });
      const id = object.body.data.id as string;
      const attached = await api.expect(201, 'POST', `/entities/${id}/images`, {
        assetId,
        isSpoiler: true,
      });
      expect(attached.body.data.asset).toMatchObject({
        credit: 'By Ana',
        urls: { display: `/media/u/${universeId}/${assetId}/display.webp` },
      });
      const shown = await api.expect(200, 'GET', `/objects/${id}?include=images`);
      expect(shown.body.data.images[0].asset.credit).toBe('By Ana');
      const hidden = await api.expect(200, 'GET', `/objects/${id}?include=images&spoilers=exclude`);
      expect(hidden.body.data.images[0]).not.toHaveProperty('asset');
    }));
});

describe('/media/*', () => {
  it('serves stored variants, and nothing else', () =>
    run(async (api, { universeId }) => {
      const { body } = await upload(api, universeId, await png(64, 64));
      const served = await api.app.inject({ method: 'GET', url: body.data.urls.thumb });
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toBe('image/webp');
      expect(served.headers['cache-control']).toContain('immutable');
      // Shown in the page, never downloaded or taken for anything but its type (M8-T3).
      expect(served.headers['content-disposition']).toBe('inline');
      expect(served.headers['x-content-type-options']).toBe('nosniff');
      for (const url of [
        '/media/../package.json',
        '/media/u/%2e%2e/%2e%2e/package.json',
        `/media/u/${universeId}/${body.data.id as string}/original.png`,
      ]) {
        expect((await api.app.inject({ method: 'GET', url })).statusCode).toBe(404);
      }
    }));
});
