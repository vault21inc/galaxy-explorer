import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { getJson } from './api.ts';

/**
 * Import and export on the settings page (M7-T4): a universe exported as a zip and imported
 * into another, checked first; and a CSV of objects placed on a map.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function post(request: APIRequestContext, url: string, data: object) {
  const response = await request.post(url, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { data: { id: string } }).data;
}

async function newUniverse(request: APIRequestContext, prefix: string) {
  const slug = `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const universe = await post(request, '/api/v1/universes', { slug, name: plain(prefix) });
  return { slug, id: universe.id };
}

const objectsOn = async (page: Page, mapId: string) =>
  (
    (await getJson(page.request, `/api/v1/maps/${mapId}/objects?limit=100`)) as {
      data: {
        id: string;
        externalKey: string | null;
        namePlain: string;
        parentId: string | null;
      }[];
    }
  ).data;

test('a universe exported from its settings imports into another, checked first', async ({
  page,
}) => {
  const source = await newUniverse(page.request, 'export');
  await post(page.request, `/api/v1/universes/${source.id}/group-types`, {
    name: 'Sector',
    layer: 'Administrative',
    defaultColor: '#4fd1ff',
  });
  const map = await post(page.request, `/api/v1/universes/${source.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = await post(page.request, `/api/v1/maps/${map.id}/objects`, {
    name: plain('Gudrun System'),
    baseType: 'system',
    externalKey: 'gudrun-system',
    x: 100,
  });
  await post(page.request, `/api/v1/maps/${map.id}/objects`, {
    name: plain('Gudrun'),
    baseType: 'planet',
    parentId: system.id,
  });

  await page.goto(`/u/${source.slug}/settings`);
  const downloading = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Export the universe' }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(
    new RegExp(`^${source.slug}-\\d{4}-\\d{2}-\\d{2}\\.zip$`),
  );
  const zip = await download.path();

  // The target as the home page makes a universe: with an empty "main" map, the same slug as
  // the export's map, which the import fills rather than calling a conflict (the M7 demo).
  const target = await newUniverse(page.request, 'import');
  const firstMap = await post(page.request, `/api/v1/universes/${target.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  await page.goto(`/u/${target.slug}/settings`);
  // The saved download keeps no name; the API knows a zip by its first bytes.
  await page.getByLabel('File to import').setInputFiles(zip);
  const importButton = page.getByRole('button', { name: 'Import', exact: true });
  await expect(importButton).toBeDisabled();
  await page.getByRole('button', { name: 'Check' }).click();
  const report = page.getByRole('region', { name: 'Import report' });
  await expect(report).toContainText('Ready to import');
  const counts = report.getByRole('table', { name: 'What the import does' });
  await expect(counts.getByRole('row', { name: /Objects/ })).toContainText('2');
  await expect(counts.getByRole('row', { name: /Group types/ })).toContainText('1');
  // Checking wrote nothing.
  expect(await objectsOn(page, firstMap.id)).toEqual([]);

  await importButton.click();
  await expect(report).toContainText('Imported, as one change');
  const maps = (
    (await getJson(page.request, `/api/v1/universes/${target.id}/maps`)) as {
      data: { id: string; slug: string }[];
    }
  ).data;
  expect(maps.map((item) => item.id)).toEqual([firstMap.id]);
  const objects = await objectsOn(page, firstMap.id);
  expect(objects.map((object) => object.namePlain).sort()).toEqual(['Gudrun', 'Gudrun System']);
  const copied = objects.find((object) => object.externalKey === 'gudrun-system');
  expect(objects.find((object) => object.namePlain === 'Gudrun')?.parentId).toBe(copied?.id);
});

test('a CSV places objects on the chosen map, and says what is wrong with a bad one', async ({
  page,
}) => {
  const universe = await newUniverse(page.request, 'csv');
  const map = await post(page.request, `/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  await page.goto(`/u/${universe.slug}/settings`);
  // Files in e2e/fixtures: one with a mistake on line 2, one that places a system and planet.
  const file = page.getByLabel('File to import');
  await file.setInputFiles('e2e/fixtures/objects-mistake.csv');
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('alert')).toContainText('line 2');

  await file.setInputFiles('e2e/fixtures/objects.csv');
  await expect(page.getByLabel('Map for the CSV’s objects')).toHaveValue(map.id);
  await page.getByRole('radio', { name: /Update by key/ }).check();
  await page.getByRole('button', { name: 'Check' }).click();
  await expect(page.getByRole('region', { name: 'Import report' })).toContainText(
    'Ready to import',
  );
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Import report' })).toContainText('Imported');
  await expect
    .poll(async () => (await objectsOn(page, map.id)).map((object) => object.externalKey).sort())
    .toEqual(['hubris', 'hubris-system']);
});
