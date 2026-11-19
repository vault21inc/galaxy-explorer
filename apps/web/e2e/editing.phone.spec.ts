import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { accountFromInvite, AUTH_URL, signInThrough, uniqueName } from './accounts.ts';
import { expectBarFits, layoutOf } from './layout.ts';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * Editing only where there's a mouse or trackpad, and pages that fit a phone (D-57,
 * docs/plan/later/phone-usability.md, L3-T4). In the phone projects, which have no fine
 * pointer. Controls are tapped, not clicked: Playwright's click sends mouse pointer events even
 * on an emulated phone, and the app takes a mouse's events as a mouse plugged in.
 */

const NOTE = 'Editing needs a mouse or trackpad.';
const plain = (text: string) => ({ format: 'plain', source: text });
const more = (page: Page) => page.getByRole('button', { name: 'More', exact: true });
const moreSheet = (page: Page) => page.getByRole('dialog', { name: 'More' });

/** An owner's universe with a map, made public, on the API with accounts. */
async function publicUniverse(api: APIRequestContext) {
  const post = async (url: string, data: unknown) => {
    const response = await api.post(url, { headers: { origin: AUTH_URL }, data });
    if (!response.ok()) throw new Error(`${url}: ${await response.text()}`);
    return ((await response.json()) as { data: { id: string; version: number } }).data;
  };
  const slug = uniqueName('phone-edit');
  const universe = await post('/api/v1/universes', { slug, name: plain('Phone editing') });
  await post(`/api/v1/universes/${universe.id}/maps`, { slug: 'main', name: plain('Main') });
  const patched = await api.patch(`/api/v1/universes/${universe.id}`, {
    headers: { origin: AUTH_URL },
    data: { visibility: 'public', version: universe.version },
  });
  if (!patched.ok()) throw new Error(await patched.text());
  return slug;
}

/** No page scrolls sideways, and the bar fits. */
async function expectFits(page: Page) {
  await expectBarFits(page);
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(sideways, page.url()).toBeLessThanOrEqual(0);
  // Every panel of the page lies inside the window.
  const outside = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('main, [role="status"], [role="alert"]')]
      .map((element) => element.getBoundingClientRect())
      .filter((box) => box.width > 0 && (box.left < -0.5 || box.right > window.innerWidth + 0.5))
      .map((box) => `${String(Math.round(box.left))}–${String(Math.round(box.right))}`),
  );
  expect(outside, page.url()).toEqual([]);
}

test.describe('editing on a phone (L3-T4)', () => {
  test.use({ baseURL: AUTH_URL });

  test('an editor is told editing needs a mouse; a viewer is told nothing', async ({
    page,
    browser,
  }) => {
    const owner = await accountFromInvite();
    await signInThrough(page.request, owner);
    const slug = await publicUniverse(page.request);
    await page.goto(`/u/${slug}/main`);
    await waitForFirstFrame(page);
    expect((await layoutOf(page))?.finePointer).toBe(false);

    await more(page).tap();
    await expect(moreSheet(page).getByText(NOTE)).toBeVisible();
    await expect(moreSheet(page).getByRole('switch', { name: 'Edit' })).toHaveCount(0);
    await moreSheet(page).getByRole('button', { name: 'Close' }).tap();
    await page.keyboard.press('e');
    await expect(page.getByRole('toolbar')).toHaveCount(0);

    // Someone signed out, reading the same universe, loses nothing, so sees no note.
    const context = await browser.newContext({
      baseURL: AUTH_URL,
      viewport: page.viewportSize(),
      hasTouch: true,
      isMobile: true,
    });
    const reader = await context.newPage();
    await reader.goto(`/u/${slug}/main`);
    await waitForFirstFrame(reader);
    await more(reader).tap();
    await expect(moreSheet(reader).getByRole('button', { name: 'Display' })).toBeVisible();
    await expect(moreSheet(reader).getByText(NOTE)).toHaveCount(0);
    await context.close();
  });
});

test('a mouse plugged into a phone brings editing back', async ({ page }) => {
  // The API without accounts: everyone may edit.
  await page.goto('/u/example-universe/main');
  await waitForFirstFrame(page);
  await more(page).tap();
  await expect(moreSheet(page).getByText(NOTE)).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse' }));
  });
  await expect.poll(async () => (await layoutOf(page))?.finePointer).toBe(true);
  await expect(moreSheet(page).getByRole('switch', { name: 'Edit' })).toBeVisible();
  await expect(moreSheet(page).getByText(NOTE)).toHaveCount(0);
});

test.describe('pages on a phone (L3-T4)', () => {
  test.use({ baseURL: AUTH_URL });

  test('home, sign-in, account, universe settings and admin fit', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Username')).toBeVisible();
    await expectFits(page);

    const admin = await accountFromInvite({ admin: true });
    await signInThrough(page.request, admin);
    const slug = await publicUniverse(page.request);
    for (const path of ['/', '/account', `/u/${slug}/settings`, '/admin']) {
      await page.goto(path);
      await expect(page.locator('main')).toBeVisible();
      await page.waitForLoadState('networkidle');
      await expectFits(page);
    }
  });
});
