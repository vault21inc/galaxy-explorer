import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { galaxyObjects } from './demo.ts';
import { waitForFirstFrame } from './test-hooks.ts';

test.describe('accessibility', () => {
  for (const path of ['/', '/u/example-universe/main']) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      await waitForFirstFrame(page);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('the info panel, with hidden spoilers, has no axe violations', async ({ page }) => {
    const objects = await galaxyObjects(page.request, 'example-universe', 'main');
    const maw = objects.find((object) => object.namePlain === 'The Maw');
    await page.goto(`/u/example-universe/main?select=${maw?.id ?? ''}`);
    await waitForFirstFrame(page);
    await expect(page.getByRole('complementary', { name: 'Details' })).toContainText('A storm');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
