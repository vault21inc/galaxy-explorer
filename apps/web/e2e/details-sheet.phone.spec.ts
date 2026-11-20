import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { galaxyObjects } from './demo.ts';
import { layoutOf } from './layout.ts';
import { framesDuring, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * The details sheet's three stops on a phone (D-58, docs/plan/later/phone-usability.md, L3-T8):
 * a tap on the map shows a card, which opens to half the screen and then all of it. Runs in
 * the phone projects.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });
const DEMO = '/u/example-universe/main';

/** A universe of its own: the system Helios, with the planets Terra and Ares. */
async function setUp(request: APIRequestContext) {
  const slug = `card-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('Cards') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Helios'),
    baseType: 'system',
    explorable: true,
  });
  // Along z, toward and away from the camera: on a phone held upright, a system's view is
  // narrower than its orbits are wide, and planets out along x are off the screen.
  const planet = (name: string, z: number, summary: string) =>
    post(`/api/v1/maps/${map.id}/objects`, {
      name: plain(name),
      baseType: 'planet',
      parentId: system.id,
      z,
      summary: plain(summary),
      description: plain(`${name} at length: its seas, its moons and its long history.`),
    });
  const terra = await planet('Terra', 4, 'The third world.');
  const ares = await planet('Ares', -7, 'The red one.');
  return { url: `/u/${slug}/main/view/${system.id}`, terra: terra.id, ares: ares.id };
}

const stopOf = async (page: Page) => (await layoutOf(page))?.details ?? null;
const selected = (page: Page) => page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
const details = (page: Page) => page.getByRole('complementary', { name: 'Details' });
const card = (page: Page) => page.getByTestId('details-card');
const strip = (page: Page) => page.getByTestId('details-strip');
const more = (page: Page) => page.getByRole('button', { name: 'More', exact: true });

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page, 500);
}

async function tapObject(page: Page, id: string) {
  await waitForIdle(page, 500);
  const point = await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id);
  if (!point) throw new Error(`${id} isn't on screen`);
  await page.touchscreen.tap(point.x, point.y);
  return point;
}

async function boxOf(page: Page) {
  const box = await details(page).boundingBox();
  if (!box) throw new Error('No details panel');
  return box;
}

/** Drags the strip by `risePx` (up is positive), with a real pointer, in steps. */
async function dragStrip(page: Page, risePx: number) {
  // Once the sheet has finished moving to its stop: until then the strip isn't where it'll be.
  await expect
    .poll(() => details(page).evaluate((element) => element.getAnimations().length))
    .toBe(0);
  const box = await strip(page).boundingBox();
  if (!box) throw new Error('No strip');
  const x = box.x + box.width / 2;
  const y = box.y + 8;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - risePx, { steps: 8 });
  await page.mouse.up();
}

test.describe('the details sheet on a phone (L3-T8)', () => {
  test('a tap shows a card, which opens to half and to full', async ({ page, request }) => {
    const s = await setUp(request);
    await open(page, s.url);
    const terra = await tapObject(page, s.terra);
    await expect.poll(() => stopOf(page)).toBe('card');

    // The card: the name, what it is and its summary, in a strip that leaves the map in view.
    await expect(card(page)).toContainText('Terra');
    await expect(card(page)).toContainText('Planet');
    await expect(card(page)).toContainText('The third world.');
    await expect(details(page)).not.toContainText('Terra at length');
    const cardBox = await boxOf(page);
    expect(cardBox.height).toBeLessThan(140);
    expect(terra.y).toBeLessThan(cardBox.y);
    // Nothing draws while it rests.
    await waitForIdle(page);
    expect(await framesDuring(page, 500)).toBe(0);

    // A tap on the card opens the details.
    await card(page).tap();
    await expect.poll(() => stopOf(page)).toBe('half');
    await expect(details(page)).toContainText('Terra at length');

    // Up to the top bar, and back down a stop at a time.
    await details(page).getByRole('button', { name: 'Expand details' }).tap();
    await expect.poll(() => stopOf(page)).toBe('full');
    const barBottom = await page.evaluate(
      () => document.querySelector('header')?.getBoundingClientRect().bottom ?? 0,
    );
    await expect.poll(async () => Math.abs((await boxOf(page)).y - barBottom)).toBeLessThan(8);
    await details(page).getByRole('button', { name: 'Collapse details' }).tap();
    await expect.poll(() => stopOf(page)).toBe('half');
    await details(page).getByRole('button', { name: 'Collapse details' }).tap();
    await expect.poll(() => stopOf(page)).toBe('card');

    await details(page).getByRole('button', { name: 'Close details' }).tap();
    await expect.poll(() => selected(page)).toEqual([]);
    expect(await stopOf(page)).toBe(null);
  });

  test('the strip drags between the stops, and down off the screen', async ({ page, request }) => {
    const s = await setUp(request);
    await open(page, s.url);
    await tapObject(page, s.terra);
    await expect.poll(() => stopOf(page)).toBe('card');

    await dragStrip(page, 220);
    await expect.poll(() => stopOf(page)).toBe('half');
    await expect(details(page)).toContainText('Terra at length');
    await dragStrip(page, -260);
    await expect.poll(() => stopOf(page)).toBe('card');
    await dragStrip(page, -120);
    await expect.poll(() => selected(page)).toEqual([]);
  });

  test('keeps its height from one body to the next, and opens for a choice by name', async ({
    page,
    request,
  }) => {
    const s = await setUp(request);
    await open(page, s.url);
    await tapObject(page, s.terra);
    await card(page).tap();
    await expect.poll(() => stopOf(page)).toBe('half');

    // Another body, with the details open: they stay open.
    await tapObject(page, s.ares);
    await expect.poll(() => selected(page)).toEqual([s.ares]);
    expect(await stopOf(page)).toBe('half');
    await expect(details(page)).toContainText('Ares at length');

    // Closed, the next tap starts from the card again.
    await details(page).getByRole('button', { name: 'Close details' }).tap();
    await tapObject(page, s.terra);
    await expect.poll(() => stopOf(page)).toBe('card');

    // More steps in front of it, and it comes back as it was.
    await card(page).tap();
    await more(page).tap();
    await expect(details(page)).toBeHidden();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Close' }).tap();
    await expect(details(page)).toBeVisible();
    expect(await stopOf(page)).toBe('half');

    // A row in the List is a choice by name: the details open, not only the card.
    await details(page).getByRole('button', { name: 'Close details' }).tap();
    await more(page).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'List' }).tap();
    await page.getByRole('dialog', { name: 'List' }).getByRole('treeitem', { name: /Ares/ }).tap();
    await expect.poll(() => selected(page)).toEqual([s.ares]);
    await expect.poll(() => stopOf(page)).toBe('half');
  });

  test('a search result and an Events row open the details', async ({ page }) => {
    test.slow();
    await open(page, DEMO);
    await page.getByRole('button', { name: 'Search', exact: true }).tap();
    await page.getByRole('combobox', { name: 'Search or run a command' }).fill('Aster');
    await page.getByRole('option').filter({ hasText: 'Aster' }).first().tap();
    await expect.poll(() => stopOf(page), { timeout: 15_000 }).toBe('half');
    await expect(details(page)).toContainText('Aster');

    await details(page).getByRole('button', { name: 'Close details' }).tap();
    await expect.poll(() => stopOf(page)).toBe(null);
    await more(page).tap();
    await page.getByRole('dialog', { name: 'More' }).getByRole('button', { name: 'Events' }).tap();
    await page
      .getByRole('list', { name: 'Events in date order' })
      .getByRole('button')
      .filter({ hasText: 'Discovery of the Maw' })
      .tap();
    await expect.poll(() => stopOf(page), { timeout: 20_000 }).toBe('half');
    await expect(details(page)).toContainText('Discovery of the Maw');
  });

  test('a hidden entry’s card shows no name and no summary', async ({ page }) => {
    const objects = await galaxyObjects(page.request, 'example-universe', 'main');
    const erebus = objects.find((item) => item.namePlain === 'Erebus');
    if (!erebus) throw new Error('No Erebus in the demo.');
    await open(page, `${DEMO}?select=${erebus.id}`);
    await expect.poll(() => stopOf(page)).toBe('card');
    await expect(card(page).getByRole('heading', { name: 'Hidden title' })).toBeVisible();
    await expect(details(page)).not.toContainText('Erebus');
    await expect(details(page)).not.toContainText('Where the Outer Reach fell silent.');
  });

  test('on its side, a tap opens the side panel collapsed, with the name', async ({
    page,
    request,
  }) => {
    const s = await setUp(request);
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page, s.url);
    await tapObject(page, s.terra);
    await expect.poll(() => stopOf(page)).toBe('card');
    await expect(card(page)).toContainText('Terra');
    expect((await boxOf(page)).x).toBeGreaterThan(400);

    await details(page).getByRole('button', { name: 'Expand details' }).tap();
    await expect.poll(() => stopOf(page)).toBe('half');
    await expect(details(page)).toContainText('Terra at length');
    expect((await boxOf(page)).x).toBeGreaterThan(400);
  });
});
