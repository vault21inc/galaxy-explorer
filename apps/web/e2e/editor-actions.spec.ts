import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';
import { getJson } from './api.ts';

/**
 * Commands on the selection in edit mode (M3-T5): box select, select all, delete with its
 * impact, duplicate, and the context menu. Each test gets a fresh universe with five systems:
 * three close together on the left (West 1–3) and two on the right (East 1–2). West 1 has two
 * planets inside it.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

interface Setup {
  url: string;
  universeId: string;
  mapId: string;
  ids: Record<string, string>;
}

async function setUp(request: APIRequestContext): Promise<Setup> {
  const slug = `actions-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Actions test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const ids: Record<string, string> = {};
  const system = async (name: string, x: number, z: number) => {
    ids[name] = await post(`/api/v1/maps/${mapId}/objects`, {
      name: plain(name),
      baseType: 'system',
      explorable: true,
      x,
      y: 0,
      z,
    });
  };
  await system('West 1', -12_000, -2_000);
  await system('West 2', -11_000, 1_000);
  await system('West 3', -13_000, 2_500);
  await system('East 1', 11_000, 0);
  await system('East 2', 13_000, 2_000);
  for (const [name, x] of [
    ['West 1 a', 2],
    ['West 1 b', 5],
  ] as const) {
    ids[name] = await post(`/api/v1/maps/${mapId}/objects`, {
      name: plain(name),
      baseType: 'planet',
      parentId: ids['West 1'],
      x,
      y: 0,
      z: 0,
    });
  }
  return { url: `/u/${slug}/main`, universeId, mapId, ids };
}

const id = (s: Setup, name: string) => s.ids[name] ?? '';

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page);
  await page.keyboard.press('e');
}

async function screenOf(page: Page, objectId: string) {
  const at = await page.evaluate(
    (target) => window.__GE_TEST__?.screenPositionOf(target),
    objectId,
  );
  if (!at) throw new Error(`${objectId} isn't on screen.`);
  return at;
}

/** Cmd or Ctrl, as the app decided: the Chromium project runs with a Windows user agent. */
async function primary(page: Page) {
  return (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
}

const selectedIds = (page: Page) =>
  page.evaluate(() => [...(window.__GE_TEST__?.selectedIds() ?? [])].sort());

async function galaxyObjects(request: APIRequestContext, mapId: string) {
  const view = (await getJson(
    request,
    `/api/v1/maps/${mapId}/views/galaxy?includeDrafts=true`,
  )) as { data: { objects: { id: string; namePlain: string; position: number[] }[] } };
  return view.data.objects;
}

async function historyOf(request: APIRequestContext, universeId: string) {
  const history = (await getJson(request, `/api/v1/universes/${universeId}/history`)) as {
    data: { description: string }[];
  };
  return history.data.map((batch) => batch.description);
}

test.describe('selection commands (M3-T5)', () => {
  test('box-selecting 3 of 5 objects selects exactly those 3', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    const west = await Promise.all(
      ['West 1', 'West 2', 'West 3'].map((n) => screenOf(page, id(s, n))),
    );
    const east = await Promise.all(['East 1', 'East 2'].map((n) => screenOf(page, id(s, n))));
    // A box around the western three, with room to spare but short of the eastern two.
    const margin = 30;
    const left = Math.min(...west.map((at) => at.x)) - margin;
    const right = Math.max(...west.map((at) => at.x)) + margin;
    const top = Math.min(...west.map((at) => at.y)) - margin;
    const bottom = Math.max(...west.map((at) => at.y)) + margin;
    expect(Math.min(...east.map((at) => at.x))).toBeGreaterThan(right);

    await page.mouse.move(left, top);
    await page.mouse.down();
    await page.mouse.move(right, bottom, { steps: 12 });
    await page.mouse.up();
    expect(await selectedIds(page)).toEqual(
      ['West 1', 'West 2', 'West 3'].map((n) => id(s, n)).sort(),
    );
  });

  test('⌘/Ctrl + A selects everything in the view', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    await page.keyboard.press(`${await primary(page)}+a`);
    // The five top-level systems; the planets inside West 1 aren't in the galaxy view.
    expect(await selectedIds(page)).toEqual(
      ['West 1', 'West 2', 'West 3', 'East 1', 'East 2'].map((n) => id(s, n)).sort(),
    );
  });

  test('deleting one with children shows the impact counts and removes it', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    const at = await screenOf(page, id(s, 'West 1'));
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Delete');

    const dialog = page.getByRole('dialog', { name: 'Delete “West 1”?' });
    await expect(dialog).toContainText('2 child objects');
    // The dry run changed nothing.
    expect((await page.request.get(`/api/v1/objects/${id(s, 'West 1 a')}`)).ok()).toBe(true);

    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect(dialog).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate((target) => window.__GE_TEST__?.drawnObject(target), id(s, 'West 1')),
      )
      .toBeNull();
    expect(await selectedIds(page)).toEqual([]);
    for (const name of ['West 1', 'West 1 a', 'West 1 b']) {
      expect((await page.request.get(`/api/v1/objects/${id(s, name)}`)).status()).toBe(404);
    }
    expect((await historyOf(page.request, s.universeId))[0]).toBe('Delete “West 1”');
  });

  test('Cancel keeps everything', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    const at = await screenOf(page, id(s, 'East 1'));
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Backspace');
    const dialog = page.getByRole('dialog', { name: 'Delete “East 1”?' });
    await expect(dialog).toContainText('Nothing else is affected.');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect((await page.request.get(`/api/v1/objects/${id(s, 'East 1')}`)).ok()).toBe(true);
  });

  test('duplicating creates offset copies as one batch, and selects them', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    const a = await screenOf(page, id(s, 'East 1'));
    const b = await screenOf(page, id(s, 'East 2'));
    await page.mouse.click(a.x, a.y);
    await page.keyboard.down('Shift');
    await page.mouse.click(b.x, b.y);
    await page.keyboard.up('Shift');
    await page.keyboard.press(`${await primary(page)}+d`);

    await expect.poll(async () => (await galaxyObjects(page.request, s.mapId)).length).toBe(7);
    const objects = await galaxyObjects(page.request, s.mapId);
    const byName = (name: string) => objects.find((object) => object.namePlain === name);
    for (const name of ['East 1', 'East 2']) {
      const [x = 0, y = 0, z = 0] = byName(name)?.position ?? [];
      expect(byName(`${name} copy`)?.position).toEqual([x + 20, y, z]);
    }
    expect((await historyOf(page.request, s.universeId))[0]).toBe('Duplicate 2 objects');
    await expect
      .poll(() => selectedIds(page))
      .toEqual(['East 1 copy', 'East 2 copy'].map((name) => byName(name)?.id ?? '').sort());
  });

  test('a right-click opens the context menu, whose Rename focuses the name', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    const at = await screenOf(page, id(s, 'West 2'));
    await page.mouse.click(at.x, at.y, { button: 'right' });
    expect(await selectedIds(page)).toEqual([id(s, 'West 2')]);

    const menu = page.getByRole('menu', { name: 'Object actions' });
    // The group commands joined in M4-T2; this map has no group types, so no groups to add to.
    // Create route (M4-T7) needs two selected objects.
    await expect(menu.getByRole('menuitem')).toHaveText([
      /Rename/,
      /Group…/,
      /Add to group/,
      /Remove from group/,
      /Create route/,
      /Duplicate/,
      /Delete/,
    ]);
    await menu.getByRole('menuitem', { name: 'Rename' }).click();
    await expect(menu).toBeHidden();
    const name = page.getByLabel('Name', { exact: true });
    await expect(name).toBeFocused();
    await page.keyboard.type('Westmarch');
    await page.keyboard.press('Enter');
    await expect
      .poll(() =>
        page.evaluate((target) => window.__GE_TEST__?.drawnObject(target)?.label, id(s, 'West 2')),
      )
      .toBe('Westmarch');
  });

  test('outside edit mode, the keys and the right-click do nothing', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    await waitForFirstFrame(page);
    await waitForIdle(page);
    const at = await screenOf(page, id(s, 'East 1'));
    await page.mouse.click(at.x, at.y);
    await page.keyboard.press('Delete');
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });
});
