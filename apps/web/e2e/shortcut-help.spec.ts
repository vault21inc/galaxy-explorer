import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** The shortcut help (M4-T9): `?` or the Help button, generated from the binding tables. */

async function open(page: Page) {
  await page.goto('/u/example-universe/main');
  await waitForFirstFrame(page);
  await waitForIdle(page);
}

const help = (page: Page) => page.getByRole('dialog', { name: 'Keyboard shortcuts' });

/** The keys beside a description, in one section of the panel. */
const keysOf = (page: Page, section: string, description: string) =>
  help(page)
    .getByRole('region', { name: section })
    .locator('div', { has: page.getByRole('term').filter({ hasText: description }) })
    .getByRole('definition');

test.describe('shortcut help (M4-T9)', () => {
  test('? opens it in view mode; Esc closes it; axe finds nothing', async ({ page }) => {
    await open(page);
    await page.keyboard.press('?');
    await expect(help(page)).toBeVisible();
    const sections = help(page).getByRole('heading', { level: 3 });
    await expect(sections.first()).toHaveText('Everywhere');
    await expect(keysOf(page, 'Everywhere', 'Pan the view')).toHaveText('↑↓←→');
    await expect(keysOf(page, 'Everywhere', 'Show or hide potential spoilers')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    await page.keyboard.press('Escape');
    await expect(help(page)).toHaveCount(0);
  });

  test('in edit mode, edit shortcuts come first with this platform’s keys', async ({ page }) => {
    await open(page);
    await page.keyboard.press('e');
    await page.keyboard.press('?');
    await expect(help(page).getByRole('heading', { level: 3 }).first()).toHaveText('Edit mode');
    const mac = (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac';
    await expect(keysOf(page, 'Edit mode', 'Group the selection')).toHaveText(
      mac ? '⌘G' : 'Ctrl + G',
    );
  });

  test('the Help button opens it, and closing returns focus to the button', async ({ page }) => {
    await open(page);
    const button = page.getByRole('button', { name: 'Keyboard shortcuts' });
    await button.click();
    await expect(help(page)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(help(page)).toHaveCount(0);
    await expect(button).toBeFocused();
  });

  test('? typed in the outliner’s filter is text', async ({ page }) => {
    await open(page);
    await page.keyboard.press('e');
    const filter = page
      .getByRole('searchbox', { name: 'Filter' })
      .or(page.getByPlaceholder('Filter'));
    await filter.first().click();
    await page.keyboard.press('?');
    await expect(filter.first()).toHaveValue('?');
    await expect(help(page)).toHaveCount(0);
  });
});
