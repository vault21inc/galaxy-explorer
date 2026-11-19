import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * Touch on the canvas, and labels without a keyboard (docs/plan/later/phone-usability.md,
 * L3-T3), in the phone projects: taps select, two quick taps enter (WebKit sends no `dblclick`
 * for them), a finger reaches further than a pointer, and the Labels control in Layers.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A universe of its own: two systems far apart, Helios (explorable) and Vesta. */
async function setUp(request: APIRequestContext) {
  const slug = `touch-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('Touch') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const helios = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Helios'),
    baseType: 'system',
    explorable: true,
    x: -3_000,
  });
  const vesta = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Vesta'),
    baseType: 'system',
    x: 3_000,
  });
  return { url: `/u/${slug}/main`, helios: helios.id, vesta: vesta.id };
}

const level = (page: Page) => page.evaluate(() => window.__GE_TEST__?.level()?.level ?? null);
const selected = (page: Page) => page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);

async function centerOf(page: Page, id: string) {
  await waitForIdle(page, 500);
  const point = await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id);
  if (!point) throw new Error(`${id} isn't on screen`);
  return point;
}

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page, 500);
}

test.describe('touch on the canvas (L3-T3)', () => {
  test('a tap selects, two taps enter, and the location sheet leads back out', async ({
    page,
    request,
  }) => {
    const s = await setUp(request);
    await open(page, s.url);
    const helios = await centerOf(page, s.helios);
    await page.touchscreen.tap(helios.x, helios.y);
    await expect.poll(() => selected(page)).toEqual([s.helios]);
    expect(await level(page)).toBe('galaxy');

    await page.touchscreen.tap(helios.x, helios.y);
    await page.waitForTimeout(80);
    await page.touchscreen.tap(helios.x, helios.y);
    await expect.poll(() => level(page), { timeout: 15_000 }).toBe('system');

    await page.getByRole('button', { name: /^Where you are:/ }).click();
    await page
      .getByRole('dialog', { name: 'Where you are' })
      .getByRole('link', { name: 'Galaxy' })
      .click();
    await expect.poll(() => level(page), { timeout: 15_000 }).toBe('galaxy');
  });

  test('a finger reaches further than a pointer', async ({ page, request }) => {
    const s = await setUp(request);
    await open(page, s.url);
    const vesta = await centerOf(page, s.vesta);
    const radius = await page.evaluate((id) => window.__GE_TEST__?.screenRadiusOf(id), s.vesta);
    // A small body: 18 px from its center is outside what's drawn.
    expect(radius ?? Infinity).toBeLessThan(14);
    const near = { x: vesta.x, y: vesta.y - 18 };

    await page.mouse.click(near.x, near.y);
    await expect.poll(() => selected(page)).toEqual([]);

    await page.touchscreen.tap(near.x, near.y);
    await expect.poll(() => selected(page)).toEqual([s.vesta]);
  });

  test('the canvas keeps its gestures from the page', async ({ page, request }) => {
    const s = await setUp(request);
    await open(page, s.url);
    const touchAction = await page.locator('canvas').evaluate((canvas) => {
      return getComputedStyle(canvas).touchAction;
    });
    expect(touchAction).toBe('none');
    const overscroll = await page.evaluate(
      () => getComputedStyle(document.body).overscrollBehaviorY,
    );
    expect(overscroll).toBe('none');
  });

  test('the Labels control changes the labels shown, and is remembered', async ({
    page,
    request,
  }) => {
    const s = await setUp(request);
    await open(page, s.url);
    const labelCount = () => page.evaluate(() => window.__GE_TEST__?.visibleLabels().length ?? -1);

    await page.getByRole('button', { name: 'More', exact: true }).click();
    await page
      .getByRole('dialog', { name: 'More' })
      .getByRole('button', { name: /Layers/ })
      .click();
    const panel = page.getByRole('dialog', { name: 'Layers and labels' });
    const labels = panel.getByRole('group', { name: 'Labels' });
    // Nothing hovers on a phone, so the first mode is worded for what it does there.
    await labels.getByText('Selected only').click();
    await expect.poll(labelCount).toBe(0);
    await labels.getByText('All', { exact: true }).click();
    await expect.poll(labelCount).toBe(2);

    await page.reload();
    await waitForFirstFrame(page);
    await expect.poll(labelCount).toBe(2);
  });
});
