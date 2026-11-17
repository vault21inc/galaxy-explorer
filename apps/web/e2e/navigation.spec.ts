import { expect, test, type Page } from './test.ts';
import { frameCount, waitForFirstFrame } from './test-hooks.ts';

/** The demo universe (apps/api/src/seeds/demo.ts), seeded into the e2e database. */
const DEMO = '/u/example-universe';
const MAIN = { slug: 'main', name: 'The Present Era' };
const FALL = { slug: 'after-the-fall', name: 'After the Fall' };

const mapButton = (page: Page, name: string) => page.getByRole('button', { name: `Map: ${name}` });

async function switchMap(page: Page, from: string, to: string): Promise<void> {
  await mapButton(page, from).click();
  await page.getByRole('menuitemradio', { name: to }).click();
}

test.describe('routes and navigation', () => {
  // The second demo map is a whole-map spoiler; its name shows only with spoilers shown.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ge.spoilers', JSON.stringify({ state: { showAll: true }, version: 1 }));
    });
  });

  test('opens a map, switches maps, and Back and Forward follow', async ({ page }) => {
    await page.goto(`${DEMO}/${MAIN.slug}`);
    await expect(page.locator('canvas')).toBeVisible();
    await expect(mapButton(page, MAIN.name)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Universe: Example Universe' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Breadcrumbs' })).toHaveText('Galaxy');
    await waitForFirstFrame(page);
    const framesBefore = await frameCount(page);

    await switchMap(page, MAIN.name, FALL.name);
    await expect(page).toHaveURL(`${DEMO}/${FALL.slug}`);
    await expect(mapButton(page, FALL.name)).toBeVisible();

    await page.goBack();
    await expect(page).toHaveURL(`${DEMO}/${MAIN.slug}`);
    await expect(mapButton(page, MAIN.name)).toBeVisible();

    await page.goForward();
    await expect(page).toHaveURL(`${DEMO}/${FALL.slug}`);
    await expect(mapButton(page, FALL.name)).toBeVisible();

    // Client-side navigation: still the same canvas, whose frame counter never restarted.
    await expect(page.locator('canvas')).toHaveCount(1);
    expect(await frameCount(page)).toBeGreaterThanOrEqual(framesBefore);
  });

  test('a universe opens its first map, and Back skips the redirect', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Example Universe' }).click();
    await expect(page).toHaveURL(`${DEMO}/${MAIN.slug}`);
    await page.goBack();
    await expect(page).toHaveURL('/');
  });

  test('unknown universes, maps and pages say so', async ({ page }) => {
    await page.goto('/u/no-such-universe');
    await expect(page.getByText('No universe called “no-such-universe”')).toBeVisible();

    await page.goto(`${DEMO}/no-such-map`);
    await expect(page.getByText('No map called “no-such-map”')).toBeVisible();
    // The switchers stay, so the reader can pick a real map.
    await switchMap(page, 'Choose a map', MAIN.name);
    await expect(page).toHaveURL(`${DEMO}/${MAIN.slug}`);

    await page.goto('/no/such/page');
    await expect(page.getByText('Page not found')).toBeVisible();
  });

  test('a signed-out visitor at / opens the home universe; /universes lists them all', async ({
    page,
  }) => {
    // A site with accounts and a home universe (D-51, GE_HOME_UNIVERSE), seen signed out. The
    // e2e API has no accounts, so its health answer and `/auth/me` are stood in for here.
    await page.route('**/api/health', async (route) => {
      const response = await route.fetch();
      const body = (await response.json()) as { data: Record<string, unknown> };
      await route.fulfill({
        response,
        json: { data: { ...body.data, authMode: 'required', homeUniverse: 'example-universe' } },
      });
    });
    await page.route('**/api/v1/auth/me', (route) => route.fulfill({ json: { data: null } }));

    await page.goto('/');
    await expect(page).toHaveURL(`${DEMO}/${MAIN.slug}`);
    await expect(mapButton(page, MAIN.name)).toBeVisible();

    await page.getByRole('button', { name: /^Universe:/ }).click();
    await page.getByRole('menuitem', { name: 'All universes' }).click();
    await expect(page).toHaveURL('/universes');
    await expect(page.getByRole('link', { name: 'Example Universe' })).toBeVisible();
  });

  test('a failed request shows an error with a working Retry', async ({ page }) => {
    let fail = true;
    // The universe at the address, which the page looks up by its slug (M8-T11).
    await page.route('**/api/v1/universes/by-slug/*', async (route) => {
      if (fail) await route.fulfill({ status: 503, body: 'down' });
      else await route.fallback();
    });
    await page.goto(`${DEMO}/${MAIN.slug}`);
    // After the client's two retries, 1 s and 2 s apart (providers.tsx).
    await expect(page.getByRole('alert')).toContainText("Couldn't load this universe", {
      timeout: 10_000,
    });

    fail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(mapButton(page, MAIN.name)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('a new universe opens on its first map', async ({ page }) => {
    // Unique per run: the e2e database is reset only once per run, and retries reuse it.
    const name = `Test Universe ${Date.now().toString(36)}`;
    await page.goto('/');
    await page.getByLabel('Name').fill(name);
    await expect(page.getByLabel('Address')).toHaveValue(/^test-universe-[a-z0-9]+$/);
    await page.getByRole('button', { name: 'Create universe' }).click();

    await expect(page).toHaveURL(/\/u\/test-universe-[a-z0-9]+\/main$/);
    await expect(page.getByRole('button', { name: `Universe: ${name}` })).toBeVisible();
    await expect(mapButton(page, 'Main')).toBeVisible();
    await expect(page.getByText('This map is empty')).toBeVisible();
  });

  test('the new-universe form rejects an invalid address', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Name').fill('Anything');
    await page.getByLabel('Address').fill('Not A Slug');
    await expect(page.getByText('Use lower-case letters and digits')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create universe' })).toBeDisabled();
  });
});
