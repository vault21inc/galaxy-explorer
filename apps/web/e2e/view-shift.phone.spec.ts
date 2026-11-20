import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { layoutOf } from './layout.ts';
import { frameCount, framesDuring, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * The view shift on a phone (D-58, docs/plan/later/phone-usability.md, L3-T9; rendering.md
 * §12): with an object's details opened over the map, the picture's center moves to the middle
 * of what's left uncovered, and the camera itself doesn't move. Runs in the phone projects.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A universe of its own: the system Helios, with the planets Terra (explorable) and Ares. */
async function setUp(request: APIRequestContext) {
  const slug = `shift-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('Shifts') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Helios'),
    baseType: 'system',
    explorable: true,
  });
  // Along z, so both are on a phone's narrow screen (see details-sheet.phone.spec.ts), and
  // close in, so both are still clear of the bar and the sheet once the picture has moved up.
  const planet = (name: string, z: number) =>
    post(`/api/v1/maps/${map.id}/objects`, {
      name: plain(name),
      baseType: 'planet',
      parentId: system.id,
      z,
      explorable: true,
      summary: plain(`${name}, in brief.`),
      description: plain(`${name} at length. `.repeat(30)),
    });
  const terra = await planet('Terra', 1.5);
  const ares = await planet('Ares', -2);
  const base = `/u/${slug}/main/view`;
  return {
    system: `${base}/${system.id}`,
    orbit: `${base}/${terra.id}`,
    terra: terra.id,
    ares: ares.id,
  };
}

const stopOf = async (page: Page) => (await layoutOf(page))?.details ?? null;
const selected = (page: Page) => page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
const details = (page: Page) => page.getByRole('complementary', { name: 'Details' });
const card = (page: Page) => page.getByTestId('details-card');
const shift = (page: Page) => page.evaluate(() => window.__GE_TEST__?.viewShift() ?? null);
const pose = (page: Page) => page.evaluate(() => window.__GE_TEST__?.cameraPose() ?? null);
/** Where the view's own center (its subject, at the origin) is drawn, on the page. */
const origin = (page: Page) => page.evaluate(() => window.__GE_TEST__?.projectPoint([0, 0, 0]));

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page, 500);
}

async function positionOf(page: Page, id: string) {
  const point = await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id);
  if (!point) throw new Error(`${id} isn't on screen`);
  return point;
}

/** The part of the window the top bar and the details panel leave uncovered. */
async function band(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('header')?.getBoundingClientRect();
    const panel = document.querySelector('aside[aria-label="Details"]')?.getBoundingClientRect();
    if (!bar || !panel) throw new Error('No bar or no details panel');
    const sheet = panel.left < 1;
    return {
      top: sheet ? bar.bottom : 0,
      bottom: sheet ? panel.top : window.innerHeight,
      left: 0,
      right: sheet ? window.innerWidth : panel.left,
    };
  });
}

/** Opens the card to half, and waits for the picture to finish sliding. */
async function openHalf(page: Page) {
  await card(page).tap();
  await expect.poll(() => stopOf(page)).toBe('half');
  await expect.poll(async () => (await shift(page))?.yPx ?? 0).toBeGreaterThan(20);
  await waitForIdle(page, 500);
}

test.describe('the view shift (L3-T9)', () => {
  test('opened details move the planet into the space above them, and not the camera', async ({
    page,
    request,
  }) => {
    const s = await setUp(request);
    await open(page, s.orbit);
    const center = { x: (page.viewportSize()?.width ?? 0) / 2, y: 0 };
    center.y = (page.viewportSize()?.height ?? 0) / 2;
    // A tap on the globe selects the planet: its card, and nothing moves.
    await page.touchscreen.tap(center.x, center.y);
    await expect.poll(() => selected(page)).toEqual([s.terra]);
    await expect.poll(() => stopOf(page)).toBe('card');
    await waitForIdle(page, 500);
    expect(await shift(page)).toEqual({ xPx: 0, yPx: 0 });
    const before = await pose(page);
    const resting = await origin(page);
    expect(Math.abs((resting?.y ?? 0) - center.y)).toBeLessThan(2);

    // Opened: the planet's center is the middle of the band between the bar and the sheet.
    const framesBefore = await frameCount(page);
    await openHalf(page);
    // The slide is 200 ms: a dozen frames at 60 a second, and none after.
    expect((await frameCount(page)) - framesBefore).toBeLessThanOrEqual(20);
    expect(await framesDuring(page, 500)).toBe(0);
    const room = await band(page);
    const moved = await origin(page);
    expect(Math.abs((moved?.y ?? 0) - (room.top + room.bottom) / 2)).toBeLessThan(2);
    expect(Math.abs((moved?.x ?? 0) - center.x)).toBeLessThan(2);
    expect(await pose(page)).toEqual(before);

    // The window turns out larger (another phone): the center follows the new band.
    await page.setViewportSize({ width: 430, height: 932 });
    await waitForIdle(page, 500);
    const larger = await band(page);
    await expect
      .poll(async () => Math.abs(((await origin(page))?.y ?? 0) - (larger.top + larger.bottom) / 2))
      .toBeLessThan(2);

    // Collapsed to the card again, the picture is back where it was.
    await details(page).getByRole('button', { name: 'Collapse details' }).tap();
    await expect.poll(() => stopOf(page)).toBe('card');
    await expect.poll(() => shift(page)).toEqual({ xPx: 0, yPx: 0 });
    await waitForIdle(page, 500);
    expect(Math.abs(((await origin(page))?.y ?? 0) - 932 / 2)).toBeLessThan(2);
    expect(await pose(page)).toEqual(before);
  });

  test('taps, labels and framing follow the shifted picture', async ({ page, request }) => {
    const s = await setUp(request);
    await open(page, s.system);
    const terra = await positionOf(page, s.terra);
    await page.touchscreen.tap(terra.x, terra.y);
    await expect.poll(() => stopOf(page)).toBe('card');
    await openHalf(page);
    const room = await band(page);

    // Ares is drawn somewhere else now: a tap there selects it, so picking moved with it.
    const ares = await positionOf(page, s.ares);
    expect(ares.y).toBeGreaterThan(room.top + 10);
    expect(ares.y).toBeLessThan(room.bottom - 10);
    await page.touchscreen.tap(ares.x, ares.y);
    await expect.poll(() => selected(page)).toEqual([s.ares]);
    await waitForIdle(page, 500);

    // Its label sits beside where it's drawn, inside the band.
    const label = await page.evaluate(
      (id) => window.__GE_TEST__?.visibleLabels().find((item) => item.id === id) ?? null,
      s.ares,
    );
    if (!label) throw new Error('Ares has no label');
    const canvas = await page.locator('canvas').boundingBox();
    const labelY = (canvas?.y ?? 0) + label.top + label.height / 2;
    expect(Math.abs(labelY - ares.y)).toBeLessThan(40);
    expect(labelY).toBeGreaterThan(room.top);
    expect(labelY).toBeLessThan(room.bottom);

    // Framing it (F, or a double-tap on a body that opens no view) puts all of it in the band.
    await page.evaluate((id) => window.__GE_TEST__?.flyTo(id), s.ares);
    await waitForIdle(page, 500);
    const framed = await positionOf(page, s.ares);
    const radius =
      (await page.evaluate((id) => window.__GE_TEST__?.screenRadiusOf(id), s.ares)) ?? 0;
    expect(Math.abs(framed.y - (room.top + room.bottom) / 2)).toBeLessThan(3);
    expect(framed.y - radius).toBeGreaterThanOrEqual(room.top);
    expect(framed.y + radius).toBeLessThanOrEqual(room.bottom);
    expect(framed.x - radius).toBeGreaterThanOrEqual(room.left);
    expect(framed.x + radius).toBeLessThanOrEqual(room.right);
  });

  test('on its side, the open side panel moves the picture left', async ({ page, request }) => {
    const s = await setUp(request);
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page, s.orbit);
    await page.touchscreen.tap(300, 195);
    await expect.poll(() => selected(page)).toEqual([s.terra]);
    await expect.poll(() => stopOf(page)).toBe('card');
    expect(await shift(page)).toEqual({ xPx: 0, yPx: 0 });

    await details(page).getByRole('button', { name: 'Expand details' }).tap();
    await expect.poll(() => stopOf(page)).toBe('half');
    await expect.poll(async () => (await shift(page))?.xPx ?? 0).toBeGreaterThan(20);
    await waitForIdle(page, 500);
    const room = await band(page);
    const moved = await origin(page);
    expect(Math.abs((moved?.x ?? 0) - (room.left + room.right) / 2)).toBeLessThan(2);
    expect(Math.abs((moved?.y ?? 0) - 390 / 2)).toBeLessThan(2);
    expect((await shift(page))?.yPx).toBe(0);
  });

  test('capture mode is never shifted, and leaving it brings the shift back', async ({
    page,
    request,
  }) => {
    const s = await setUp(request);
    await open(page, s.orbit);
    const size = page.viewportSize() ?? { width: 0, height: 0 };
    await page.touchscreen.tap(size.width / 2, size.height / 2);
    await expect.poll(() => stopOf(page)).toBe('card');
    await openHalf(page);

    // The bar's More: the description under the sheet has a More of its own.
    await page.getByRole('banner').getByRole('button', { name: 'More', exact: true }).tap();
    await page
      .getByRole('dialog', { name: 'More' })
      .getByRole('button', { name: 'Record a clip' })
      .tap();
    await page
      .getByRole('dialog', { name: 'Record a clip' })
      .getByRole('button', { name: /9:16/ })
      .tap();
    await expect(page).toHaveURL(/[?&]capture=9x16/);
    await expect.poll(() => shift(page)).toEqual({ xPx: 0, yPx: 0 });

    await page.getByTestId('capture-controls').getByRole('button', { name: 'Leave' }).tap();
    await expect(page).not.toHaveURL(/[?&]capture=/);
    await expect(details(page)).toBeVisible();
    await expect.poll(async () => (await shift(page))?.yPx ?? 0).toBeGreaterThan(20);
  });
});
