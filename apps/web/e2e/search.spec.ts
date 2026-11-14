import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * Search and the command palette (M7-T6): ⌘/Ctrl + K anywhere, words that start names, and
 * choosing a result goes to it through the views.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function post(request: APIRequestContext, url: string, data: object) {
  const response = await request.post(url, { data });
  expect(response.ok(), await response.text()).toBe(true);
  return ((await response.json()) as { data: { id: string } }).data;
}

async function setUp(request: APIRequestContext) {
  const slug = `search-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const universe = await post(request, '/api/v1/universes', { slug, name: plain('Search') });
  const map = await post(request, `/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = await post(request, `/api/v1/maps/${map.id}/objects`, {
    name: plain('Gudrun System'),
    baseType: 'system',
    explorable: true,
    x: 4_000,
  });
  const gudrun = await post(request, `/api/v1/maps/${map.id}/objects`, {
    name: plain('Gudrun'),
    baseType: 'planet',
    parentId: system.id,
    x: 3,
  });
  await post(request, `/api/v1/maps/${map.id}/objects`, {
    name: plain('Hubris'),
    baseType: 'system',
    summary: plain('Far from Gudrun.'),
    x: -4_000,
  });
  return { slug, systemId: system.id, gudrunId: gudrun.id };
}

async function openPalette(page: Page) {
  const primary =
    (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
  await page.keyboard.press(`${primary}+k`);
  return page.getByRole('combobox', { name: 'Search or run a command' });
}

test('⌘K, type "gud", Enter lands on Gudrun', async ({ page }) => {
  const s = await setUp(page.request);
  await page.goto(`/u/${s.slug}/main`);
  await waitForFirstFrame(page);
  await waitForIdle(page, 300);

  const input = await openPalette(page);
  await input.fill('gud');
  const options = page.getByRole('listbox', { name: 'Results and commands' }).getByRole('option');
  // Names that start with the words come first, the shortest first; then other matches.
  await expect(options.nth(0)).toContainText('Gudrun');
  await expect(options.nth(0)).toContainText('Main › Gudrun System');
  await expect(options.nth(1)).toContainText('Gudrun System');
  await expect(options.nth(2)).toContainText('Far from Gudrun.');
  await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Enter');

  // Gudrun is a planet: the views change to its system's, with it selected.
  await expect(page).toHaveURL(
    new RegExp(`/u/${s.slug}/main/view/${s.systemId}\\?select=${s.gudrunId}`),
  );
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []))
    .toEqual([s.gudrunId]);
  await expect(page.getByRole('complementary', { name: 'Details' })).toContainText('Gudrun');
});

test('the palette runs commands, and the arrow keys move through results', async ({ page }) => {
  const s = await setUp(page.request);
  await page.goto(`/u/${s.slug}/main`);
  await waitForFirstFrame(page);

  const input = await openPalette(page);
  await input.fill('spoil');
  await expect(page.getByRole('option', { name: 'Show spoilers' })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(input).toBeHidden();
  await expect(page.getByRole('button', { name: /Spoilers: Shown/ })).toBeVisible();

  // The top bar's Search button opens it too; ↓ then Enter takes the second result.
  await page.getByRole('button', { name: /^Search/ }).click();
  await input.fill('gudrun');
  await expect(page.getByRole('option').nth(1)).toContainText('Gudrun System');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/u/${s.slug}/main\\?select=${s.systemId}`));
});
