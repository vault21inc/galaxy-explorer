import AxeBuilder from '@axe-core/playwright';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** The outliner (M3-T9): an ARIA tree that mirrors the canvas's selection both ways. */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function setUp(request: APIRequestContext) {
  const slug = `outliner-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Outliner test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = (name: string, x: number, z: number) =>
    post(`/api/v1/maps/${mapId}/objects`, { name: plain(name), baseType: 'system', x, y: 0, z });
  const ids = {
    alpha: await system('Alpha', -10_000, 0),
    beta: await system('Beta', 0, 5_000),
    gamma: await system('Gamma', 10_000, 0),
  };
  return { url: `/u/${slug}/main`, ids };
}

const selectedIds = (page: Page) =>
  page.evaluate(() => [...(window.__GE_TEST__?.selectedIds() ?? [])].sort());

const row = (page: Page, name: string) =>
  page
    .getByRole('tree', { name: 'Objects in this view' })
    .getByRole('treeitem', { name: new RegExp(`^${name} `) });

test.describe('the outliner (M3-T9)', () => {
  test('selecting in the outliner selects in 3D, and the reverse', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    await waitForFirstFrame(page);
    await waitForIdle(page);
    await page.keyboard.press('e');

    // Outliner → canvas.
    await row(page, 'Beta').click();
    expect(await selectedIds(page)).toEqual([s.ids.beta]);
    await expect(row(page, 'Beta')).toHaveAttribute('aria-selected', 'true');

    // Canvas → outliner.
    const at = await page.evaluate((id) => window.__GE_TEST__?.screenPositionOf(id), s.ids.gamma);
    if (!at) throw new Error('Gamma is off screen.');
    await page.mouse.click(at.x, at.y);
    await expect(row(page, 'Gamma')).toHaveAttribute('aria-selected', 'true');
    await expect(row(page, 'Beta')).toHaveAttribute('aria-selected', 'false');
  });

  test('the keyboard moves, selects and extends the selection', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    await waitForFirstFrame(page);
    await page.keyboard.press('e');

    await row(page, 'Alpha').click();
    await page.keyboard.press('ArrowDown');
    await expect(row(page, 'Beta')).toBeFocused();
    // Moving doesn't select; Space does.
    expect(await selectedIds(page)).toEqual([s.ids.alpha]);
    await page.keyboard.press(' ');
    expect(await selectedIds(page)).toEqual([s.ids.beta]);
    // Shift + arrow extends the selection to the next row.
    await page.keyboard.press('Shift+ArrowDown');
    await expect(row(page, 'Gamma')).toBeFocused();
    expect(await selectedIds(page)).toEqual([s.ids.beta, s.ids.gamma].sort());
    // Camera keys don't fire while the tree has focus.
    const before = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
    await page.keyboard.press('ArrowUp');
    expect(await page.evaluate(() => window.__GE_TEST__?.cameraPose())).toEqual(before);
    // Escape clears.
    await page.keyboard.press('Escape');
    expect(await selectedIds(page)).toEqual([]);
  });

  test('the filter narrows the list', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    await waitForFirstFrame(page);
    await page.keyboard.press('e');
    const outliner = page.getByRole('complementary', { name: 'Outliner' });
    await outliner.getByLabel('Filter objects').fill('gam');
    await expect(outliner.getByRole('treeitem')).toHaveCount(1);
    await expect(row(page, 'Gamma')).toBeVisible();
  });

  test('in view mode it opens from List, and the shell has no axe violations', async ({ page }) => {
    await page.goto('/u/example-universe/main');
    await waitForFirstFrame(page);
    await expect(page.getByRole('complementary', { name: 'Outliner' })).toHaveCount(0);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    const outliner = page.getByRole('complementary', { name: 'Outliner' });
    await expect(outliner.getByRole('treeitem').first()).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await outliner.getByRole('button', { name: 'Close the list' }).click();
    await expect(outliner).toHaveCount(0);
  });
});
