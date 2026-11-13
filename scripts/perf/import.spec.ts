import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import { CSV_IMPORT_RESULT, PERF_MODE, RESULTS_DIR, type CsvImportResult } from './shared.ts';

/**
 * The CSV import's budget (M7-T4): 5,000 objects in under 30 s, as new objects and again as an
 * update by key. It times the API alone, so it runs once, beside Chrome's path; report.ts
 * judges it with the rest.
 */

const OBJECTS = 5_000;

test('a 5,000-object CSV imports within its budget', async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== 'chrome', 'The API is the same for every browser.');
  test.skip(PERF_MODE === 'edit', 'Edit-mode runs measure the editor.');
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string; version: number } }).data;
  };
  const plain = (source: string) => ({ format: 'plain', source, spoiler: false });
  const universe = await post('/api/v1/universes', {
    slug: `perf-import-${Date.now().toString(36)}`,
    name: plain('Import timing'),
  });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const rows = ['name,base_type,x,y,z,parent_key,group_key,external_key'];
  for (let i = 0; i < OBJECTS; i++) {
    rows.push(
      `System ${String(i)},system,${String(i * 10)},0,${String(-i * 10)},,,system-${String(i)}`,
    );
  }
  const csv = Buffer.from(rows.join('\n'));
  const timed = async (mode: string) => {
    const started = performance.now();
    const response = await request.post(
      `/api/v1/universes/${universe.id}/import?mapId=${map.id}&mode=${mode}`,
      {
        multipart: { file: { name: 'objects.csv', mimeType: 'text/csv', buffer: csv } },
        timeout: 120_000,
      },
    );
    const elapsedMs = performance.now() - started;
    expect(response.ok(), await response.text()).toBe(true);
    return elapsedMs;
  };
  const result: CsvImportResult = {
    objects: OBJECTS,
    createMs: await timed('create'),
    mergeMs: await timed('merge'),
  };
  // Leave the perf database as the next phases expect it.
  const response = await request.delete(`/api/v1/universes/${universe.id}`, {
    data: { version: universe.version },
  });
  expect(response.ok(), await response.text()).toBe(true);
  mkdirSync(RESULTS_DIR, { recursive: true });
  writeFileSync(resolve(RESULTS_DIR, CSV_IMPORT_RESULT), JSON.stringify(result, null, 2));
});
