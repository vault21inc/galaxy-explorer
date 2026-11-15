import { request } from '@playwright/test';
import { expect, test } from './test.ts';

/**
 * What only the production stack has (M8-T4): Caddy serves uploaded images from the media
 * volume, after asking the API whether this browser may see them (`forward_auth` to
 * /api/v1/media-access). Run by playwright.stack.config.js only.
 */

/** A 1 × 1 PNG: the smallest image the upload pipeline takes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

test('a private universe’s image reaches its owner, with its headers, and no one else', async ({
  page,
  baseURL,
}) => {
  const origin = baseURL ?? '';
  const slug = `media-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const created = await page.request.post('/api/v1/universes', {
    headers: { origin },
    data: { slug, name: { format: 'plain', source: 'Media check' } },
  });
  expect(created.ok(), await created.text()).toBe(true);
  const universeId = ((await created.json()) as { data: { id: string } }).data.id;
  const uploaded = await page.request.post(`/api/v1/universes/${universeId}/assets`, {
    headers: { origin },
    multipart: { file: { name: 'dot.png', mimeType: 'image/png', buffer: PNG } },
  });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  const { urls } = ((await uploaded.json()) as { data: { urls: { thumb: string } } }).data;

  // The owner: the file, from Caddy, kept out of shared caches and search engines.
  const mine = await page.request.get(urls.thumb);
  expect(mine.status()).toBe(200);
  expect(mine.headers()['content-type']).toBe('image/webp');
  expect(mine.headers()['content-disposition']).toBe('inline');
  expect(mine.headers()['cache-control']).toContain('private');
  expect(mine.headers()['x-robots-tag']).toBe('noindex');
  expect(mine.headers()['x-content-type-options']).toBe('nosniff');

  // Anyone else: not found, as for a file that doesn't exist. (A new request context takes the
  // config's signed-in session unless told otherwise.)
  const stranger = await request.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
    storageState: { cookies: [], origins: [] },
  });
  try {
    expect((await stranger.storageState()).cookies).toEqual([]);
    expect((await stranger.get(urls.thumb)).status()).toBe(404);
  } finally {
    await stranger.dispose();
  }
});
