import { expect, test } from './test.ts';
import { layoutOf } from './layout.ts';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * A narrow window on a computer (D-57, docs/plan/later/phone-usability.md, L3-T4): the slim
 * bar, as on a phone, but with a mouse, so editing is still offered, from the More sheet.
 */
test('an editor in a narrow window still gets edit mode, from More', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto('/u/example-universe/main');
  await waitForFirstFrame(page);
  const layout = await layoutOf(page);
  expect(layout?.tier).toBe('slim');
  expect(layout?.finePointer).toBe(true);

  await page.getByRole('button', { name: 'More', exact: true }).click();
  const more = page.getByRole('dialog', { name: 'More' });
  await expect(more.getByText('Editing needs a mouse or trackpad.')).toHaveCount(0);
  await more.getByRole('switch', { name: 'Edit' }).click();
  await expect(page.getByRole('toolbar')).toBeVisible();
});
