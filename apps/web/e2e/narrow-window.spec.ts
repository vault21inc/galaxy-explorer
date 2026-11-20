import { expect, test } from './test.ts';
import { galaxyObjects } from './demo.ts';
import { layoutOf } from './layout.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

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

/**
 * The view shift with a mouse (D-58, L3-T9; rendering.md §12): with the details opened, the
 * picture's center is above the canvas's. Zooming out with the pointer on that center must go
 * straight back, leaving the camera's target alone. camera-controls would take the pointer for
 * off center, and push the target away from it, if it weren't told the picture had moved
 * (`setViewport`). Zooming out, because zooming in with something selected is the app's own
 * move toward it (camera/zoom-gate.ts), which goes by direction and needs no telling.
 */
test('with the details open, zooming out at the picture’s center keeps the target', async ({
  page,
}) => {
  await page.setViewportSize({ width: 600, height: 800 });
  const objects = await galaxyObjects(page.request, 'example-universe', 'main');
  const aster = objects.find((item) => item.namePlain === 'Aster');
  if (!aster) throw new Error('No Aster in the demo.');
  await page.goto(`/u/example-universe/main?select=${aster.id}`);
  await waitForFirstFrame(page);
  await waitForIdle(page, 500);
  expect((await layoutOf(page))?.details).toBe('card');

  const shift = () => page.evaluate(() => window.__GE_TEST__?.viewShift() ?? null);
  const pose = () => page.evaluate(() => window.__GE_TEST__?.cameraPose() ?? null);
  await page
    .getByRole('complementary', { name: 'Details' })
    .getByRole('button', { name: 'Expand details' })
    .click();
  await expect.poll(async () => (await shift())?.yPx ?? 0).toBeGreaterThan(5);
  await waitForIdle(page, 500);

  // In a little first, so there's room to zoom out again.
  const moved = (await shift())?.yPx ?? 0;
  await page.mouse.move(300, 400 - moved);
  await page.mouse.wheel(0, -240);
  await waitForIdle(page, 500);
  const before = await pose();
  if (!before) throw new Error('No camera');
  // The picture's center: the canvas's, moved up by the shift.
  await page.mouse.wheel(0, 120);
  await waitForIdle(page, 500);
  const after = await pose();
  if (!after) throw new Error('No camera');

  const distance = (a: number[], b: number[]) =>
    Math.hypot(...a.map((value, axis) => value - (b[axis] ?? 0)));
  const range = distance(before.position, before.target);
  // It zoomed out, and the target stayed put: within a thousandth of the camera's distance.
  expect(distance(after.position, after.target)).toBeGreaterThan(range * 1.01);
  expect(distance(after.target, before.target)).toBeLessThan(range * 0.001);
});
