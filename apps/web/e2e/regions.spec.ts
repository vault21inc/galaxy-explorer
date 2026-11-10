import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Region shapes and their editing (M4-T6, D-25). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });
const PNG = 'e2e/fixtures/nebula.png';

async function setUp(request: APIRequestContext) {
  const slug = `regions-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Regions test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const region = (name: string, baseType: string, x: number, z: number, region: object) =>
    post(`/api/v1/maps/${mapId}/objects`, {
      name: plain(name),
      baseType,
      x,
      y: 0,
      z,
      appearance: { region },
    });
  return { url: `/u/${slug}/main`, universeId, mapId, post, region };
}

interface Region {
  radius?: number;
  shape?: string;
  texture?: string;
  path?: [number, number][];
}
const regionOf = async (page: Page, id: string) =>
  (
    (await getJson(page.request, `/api/v1/objects/${id}`)) as {
      data: { appearance: { region?: Region } };
    }
  ).data.appearance.region ?? {};

const drawn = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.drawnObject(target) ?? null, id);

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page);
}

/** Drags a handle by an offset with real mouse input, in small steps. */
async function dragBy(page: Page, name: string, dx: number, dy: number) {
  const box = await page.getByRole('button', { name, exact: true }).boundingBox();
  if (!box) throw new Error(`${name} isn't on screen.`);
  const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
}

test.describe('regions (M4-T6)', () => {
  test('a new nebula’s radius handle saves the radius', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    await page.keyboard.press('e');
    await page.getByRole('button', { name: /^Add/ }).click();
    await page.getByRole('menuitem', { name: 'Nebula', exact: true }).click();
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('The canvas has no size.');
    await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.55, { steps: 4 });
    await page.mouse.click(box.x + box.width * 0.45, box.y + box.height * 0.55);
    await expect
      .poll(async () => {
        const ids = await page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
        return ids.length === 1 && !ids[0]?.startsWith('pending') ? ids[0] : null;
      })
      .not.toBeNull();
    const [id = ''] = await page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
    const handle = page.getByRole('button', { name: 'Radius of New nebula' });
    await expect(handle).toBeVisible();

    await dragBy(page, 'Radius of New nebula', 80, 0);
    await expect.poll(async () => (await regionOf(page, id)).radius ?? 0).toBeGreaterThan(1_500);
    expect((await drawn(page, id))?.radius).toBe((await regionOf(page, id)).radius);
  });

  test('a storm with a gap and a rift with four points save, draw and pick along the curve', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    const storm = await s.region('Eye of Terror', 'anomaly', -12_000, -4_000, {
      shape: 'storm',
      radius: 5_000,
      gaps: [{ angleDeg: 300, widthDeg: 25 }],
    });
    const path: [number, number][] = [
      [-20_000, -3_000],
      [-7_000, 2_000],
      [6_000, -1_000],
      [20_000, 4_000],
    ];
    const rift = await s.region('Great Rift', 'anomaly', 0, 8_000, {
      shape: 'rift',
      radius: 1_200,
      path,
    });
    await open(page, s.url);
    await expect.poll(async () => (await drawn(page, storm))?.shape).toBe('storm');
    expect((await drawn(page, rift))?.shape).toBe('rift');
    expect(await page.evaluate((id) => window.__GE_TEST__?.stormTexture(id), storm)).toBe(
      'generated',
    );
    expect((await regionOf(page, storm)).shape).toBe('storm');
    expect((await regionOf(page, rift)).path).toEqual(path);

    // The second point lies on the curve (Catmull-Rom passes through its points).
    const on = await page.evaluate(
      () => window.__GE_TEST__?.projectPoint([-7_000, 0, 10_000]) ?? null,
    );
    const beside = await page.evaluate(
      () => window.__GE_TEST__?.projectPoint([-7_000, 0, 22_000]) ?? null,
    );
    if (!on || !beside) throw new Error('The rift is off screen.');
    await page.mouse.move(on.x, on.y, { steps: 3 });
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.hoveredId())).toBe(rift);
    await page.mouse.move(beside.x, beside.y, { steps: 3 });
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.hoveredId())).not.toBe(rift);

    // Three draw calls at most for all regions: billboards, storm discs, rift bands. The
    // background is four.
    const calls = await page.evaluate(() => window.__GE_TEST__?.renderInfo()?.calls ?? 0);
    expect(calls).toBeLessThanOrEqual(4 + 3);
  });

  test('an uploaded region texture replaces the storm’s generated one', async ({ page }) => {
    const s = await setUp(page.request);
    const storm = await s.region('Maelstrom', 'anomaly', 0, 0, { shape: 'storm', radius: 6_000 });
    await open(page, `${s.url}?select=${storm}`);
    await expect
      .poll(() => page.evaluate((id) => window.__GE_TEST__?.stormTexture(id), storm))
      .toBe('generated');

    // In the storm's form: an uploaded picture instead of the generated one.
    await page.keyboard.press('e');
    const panel = page.getByRole('complementary', { name: 'Details' });
    await panel.getByLabel('Picture').selectOption({ label: 'An uploaded image' });
    await panel.getByRole('button', { name: 'Choose' }).click();
    await page.getByRole('dialog').getByLabel('Upload images').setInputFiles(PNG);

    await expect
      .poll(() => page.evaluate((id) => window.__GE_TEST__?.stormTexture(id), storm), {
        timeout: 15_000,
      })
      .toBe('upload');
    expect((await regionOf(page, storm)).texture).toBe('upload');
  });

  test('a rift’s points are added, dragged and deleted on the map', async ({ page }) => {
    const s = await setUp(page.request);
    const rift = await s.region('Great Rift', 'anomaly', 0, 0, {
      shape: 'rift',
      radius: 1_200,
      path: [
        [-10_000, 0],
        [10_000, 0],
      ],
    });
    await open(page, `${s.url}?select=${rift}`);
    await page.keyboard.press('e');
    const panel = page.getByRole('complementary', { name: 'Details' });
    await panel.getByRole('button', { name: 'Add points' }).click();

    // Past the rift's end: a new last point.
    const past = await page.evaluate(() => window.__GE_TEST__?.projectPoint([20_000, 0, 4_000]));
    if (!past) throw new Error('Off screen.');
    await page.mouse.click(past.x, past.y);
    await expect.poll(async () => (await regionOf(page, rift)).path?.length).toBe(3);
    const added = (await regionOf(page, rift)).path?.[2] ?? [0, 0];
    expect(added[0]).toBeGreaterThan(15_000);
    await panel.getByRole('button', { name: 'Done' }).click();

    // Drag the first point.
    await dragBy(page, 'Point 1 of Great Rift', 0, -40);
    await expect.poll(async () => (await regionOf(page, rift)).path?.[0]?.[1] ?? 0).not.toBe(0);

    // Select the new point and delete it: the rift keeps its other two.
    await page.getByRole('button', { name: 'Point 3 of Great Rift' }).click();
    await page.keyboard.press('Delete');
    await expect.poll(async () => (await regionOf(page, rift)).path?.length).toBe(2);
    expect((await drawn(page, rift))?.shape).toBe('rift');
  });
});
