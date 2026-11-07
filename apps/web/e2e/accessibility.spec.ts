import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { waitForFirstFrame } from './test-hooks.ts';

test.describe('accessibility', () => {
  for (const path of ['/', '/u/warhammer-40k/m41']) {
    test(`${path} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      await waitForFirstFrame(page);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
