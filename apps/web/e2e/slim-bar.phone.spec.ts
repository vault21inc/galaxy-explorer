import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { accountFromInvite, AUTH_URL, signInThrough } from './accounts.ts';
import { expectBarFits, layoutOf } from './layout.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * The slim bar and its sheets, on a phone (docs/plan/later/phone-usability.md, L3-T2). Runs in
 * the phone projects only: a Pixel 7 in Chromium and an iPhone 14 in WebKit.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A universe of its own: the system Helios, with the planet Terra to open. */
async function setUp(request: APIRequestContext) {
  const slug = `phone-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('Phones') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Helios'),
    baseType: 'system',
    explorable: true,
  });
  const planet = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Terra'),
    baseType: 'planet',
    parentId: system.id,
    x: 4,
    explorable: true,
  });
  return { url: `/u/${slug}/main`, system: system.id, planet: planet.id };
}

const sheetOf = (page: Page) => page.evaluate(() => window.__GE_TEST__?.layout().sheet ?? null);
const level = (page: Page) => page.evaluate(() => window.__GE_TEST__?.level()?.level ?? null);
const chip = (page: Page) => page.getByRole('button', { name: /^Where you are:/ });
const more = (page: Page) => page.getByRole('button', { name: 'More', exact: true });
const sheet = (page: Page, name: string) => page.getByRole('dialog', { name });

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page, 500);
}

test.describe('the slim bar (L3-T2)', () => {
  test('fits the phone, and at 320 px', async ({ page, request }) => {
    const s = await setUp(request);
    await open(page, `${s.url}/view/${s.planet}`);
    expect((await layoutOf(page))?.tier).toBe('slim');
    await expectBarFits(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await expectBarFits(page);
    await expect(chip(page)).toBeVisible();
    await expect(more(page)).toBeVisible();
  });

  test('the chip names the view at each level, and its sheet goes back up', async ({
    page,
    request,
  }) => {
    const s = await setUp(request);
    await open(page, s.url);
    await expect(chip(page)).toHaveText(/Main/);

    await open(page, `${s.url}/view/${s.system}`);
    await expect(chip(page)).toHaveText(/Helios/);

    await open(page, `${s.url}/view/${s.planet}`);
    await expect(chip(page)).toHaveText(/Terra/);
    await expect.poll(() => level(page)).toBe('orbit');

    await chip(page).click();
    const location = sheet(page, 'Where you are');
    await expect(location).toBeVisible();
    await expect(location.getByRole('listitem')).toHaveText(['Galaxy', 'Helios', 'Terra']);
    await location.getByRole('link', { name: 'Helios' }).click();
    await expect.poll(() => level(page)).toBe('system');
    await expect.poll(() => sheetOf(page)).toBe(null);
    await expect(chip(page)).toHaveText(/Helios/);

    // The universe's switcher lists the universes and goes to another.
    await chip(page).click();
    await location.getByRole('button', { name: /^Universe:/ }).click();
    await location.getByRole('button', { name: 'Example Universe' }).click();
    await expect(page).toHaveURL(/\/u\/example-universe/);
  });

  test('More reaches every control of the full bar', async ({ page, request }) => {
    const s = await setUp(request);
    await open(page, s.url);

    // Search opens the command palette.
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByRole('dialog', { name: /search|command/i })).toBeVisible();
    await page.keyboard.press('Escape');

    await more(page).click();
    const moreSheet = sheet(page, 'More');
    await expect(moreSheet).toBeVisible();
    for (const name of ['List', 'Events', 'Layers', 'Display', 'Help and tours']) {
      await expect(moreSheet.getByRole('button', { name })).toBeVisible();
    }

    // Each row opens its panel in More's place, with a way back.
    await moreSheet.getByRole('button', { name: 'Events' }).click();
    await expect(sheet(page, 'Events')).toBeVisible();
    await expect(sheet(page, 'Events')).toContainText('No events on this map yet.');
    await sheet(page, 'Events').getByRole('button', { name: 'Back' }).click();
    await moreSheet.getByRole('button', { name: 'Layers' }).click();
    await expect(sheet(page, 'Layers')).toContainText('No layers yet');
    await sheet(page, 'Layers').getByRole('button', { name: 'Back' }).click();
    await moreSheet.getByRole('button', { name: 'Display' }).click();
    await sheet(page, 'Display').getByRole('radio', { name: /Low/ }).check();
    await sheet(page, 'Display').getByRole('button', { name: 'Back' }).click();

    // The spoiler switch.
    const spoilers = moreSheet.getByRole('switch', { name: /Spoilers/ });
    await expect(spoilers).not.toBeChecked();
    await spoilers.click();
    await expect(spoilers).toBeChecked();

    // Help opens the shortcuts.
    await moreSheet.getByRole('button', { name: 'Help and tours' }).click();
    await sheet(page, 'Help and tours').getByRole('button', { name: 'Keyboard shortcuts' }).click();
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible();
  });

  test('one sheet at a time, and the info panel steps aside for it', async ({ page, request }) => {
    const s = await setUp(request);
    await open(page, s.url);

    // Choosing in the List sheet closes it and selects, so the info panel shows the choice.
    await more(page).click();
    await sheet(page, 'More').getByRole('button', { name: 'List' }).click();
    await expect.poll(() => sheetOf(page)).toBe('list');
    await sheet(page, 'List')
      .getByRole('treeitem', { name: /Helios/ })
      .click();
    await expect.poll(() => sheetOf(page)).toBe(null);
    const details = page.getByRole('complementary', { name: 'Details' });
    await expect(details).toBeVisible();

    // A second sheet replaces the first; the info panel is hidden while one is open.
    await chip(page).click();
    await expect.poll(() => sheetOf(page)).toBe('location');
    await expect(details).toBeHidden();
    await more(page).click();
    await expect.poll(() => sheetOf(page)).toBe('more');
    await expect(sheet(page, 'Where you are')).toHaveCount(0);
    await sheet(page, 'More').getByRole('button', { name: 'Close' }).click();
    await expect.poll(() => sheetOf(page)).toBe(null);
    await expect(details).toBeVisible();
  });

  test('a phone on its side opens sheets and the info panel on the right', async ({
    page,
    request,
  }) => {
    const s = await setUp(request);
    await page.setViewportSize({ width: 844, height: 390 });
    await open(page, `${s.url}/view/${s.system}`);
    const layout = await layoutOf(page);
    expect(layout?.tier).toBe('slim');
    expect(layout?.short).toBe(true);
    await expectBarFits(page);

    await more(page).click();
    const box = await sheet(page, 'More').boundingBox();
    if (!box) throw new Error('No sheet');
    expect(box.x + box.width).toBeGreaterThan(843);
    expect(box.x).toBeGreaterThan(400);
    expect(box.y).toBeLessThan(1);
    await sheet(page, 'More').getByRole('button', { name: 'Close' }).click();

    await page.evaluate((id) => {
      window.__GE_TEST__?.select([id]);
    }, s.planet);
    const details = await page.getByRole('complementary', { name: 'Details' }).boundingBox();
    if (!details) throw new Error('No info panel');
    expect(details.x).toBeGreaterThan(400);
  });

  test('the reader tour runs to its end, each step on screen', async ({ page }) => {
    await open(page, '/u/example-universe/main');
    await more(page).click();
    await sheet(page, 'More').getByRole('button', { name: 'Help and tours' }).click();
    await sheet(page, 'Help and tours').getByRole('button', { name: 'Take the tour' }).click();

    const step = page.locator('[data-tour-step]');
    const viewport = page.viewportSize();
    if (!viewport) throw new Error('No viewport');
    const seen: string[] = [];
    for (let guard = 0; guard < 20; guard++) {
      if ((await step.count()) === 0) break;
      const id = (await step.getAttribute('data-tour-step')) ?? '';
      if (seen.at(-1) !== id) seen.push(id);
      const box = await step.boundingBox();
      if (!box) throw new Error(`Step ${id} has no box`);
      expect(box.x, id).toBeGreaterThanOrEqual(0);
      expect(box.y, id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, id).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box.y + box.height, id).toBeLessThanOrEqual(viewport.height + 0.5);
      await step.getByRole('button', { name: /^(Next|Finish)$/ }).click();
    }
    await expect(step).toHaveCount(0);
    expect(seen).toContain('list');
    expect(seen.at(-1)).toBe('shortcuts');
  });
});

test.describe('the slim bar with accounts', () => {
  test.use({ baseURL: AUTH_URL });

  test('signed out, More offers Sign in; signed in, the account', async ({ page, browser }) => {
    await open(page, '/');
    await more(page).click();
    await expect(sheet(page, 'More').getByRole('link', { name: 'Sign in' })).toBeVisible();

    const account = await accountFromInvite();
    const context = await browser.newContext({ baseURL: AUTH_URL });
    await signInThrough(context.request, account);
    const signedIn = await context.newPage();
    await signedIn.setViewportSize(page.viewportSize() ?? { width: 390, height: 664 });
    await signedIn.goto('/');
    await more(signedIn).click();
    await sheet(signedIn, 'More').getByRole('button', { name: account.username }).click();
    await expect(sheet(signedIn, 'Account').getByRole('link', { name: 'Account' })).toBeVisible();
    await context.close();
  });
});
