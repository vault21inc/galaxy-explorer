import { expect, test } from './test.ts';
import { galaxyObjects } from './demo.ts';
import { layoutOf } from './layout.ts';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * The details panel in a wide window (D-58, docs/plan/later/phone-usability.md, L3-T8): it
 * opens expanded, as it always did, and collapsed it now says what's selected.
 */
test('opens expanded in a wide window, and names the selection when collapsed', async ({
  page,
}) => {
  const objects = await galaxyObjects(page.request, 'example-universe', 'main');
  const aster = objects.find((item) => item.namePlain === 'Aster');
  if (!aster) throw new Error('No Aster in the demo.');
  await page.goto(`/u/example-universe/main?select=${aster.id}`);
  await waitForFirstFrame(page);
  const panel = page.getByRole('complementary', { name: 'Details' });
  await expect(panel.getByRole('heading', { name: 'Aster' })).toBeVisible();
  expect((await layoutOf(page))?.details).toBe('half');
  const open = await panel.boundingBox();

  await panel.getByRole('button', { name: 'Collapse details' }).click();
  expect((await layoutOf(page))?.details).toBe('card');
  await expect(page.getByTestId('details-card')).toContainText('Aster');
  const collapsed = await panel.boundingBox();
  expect(collapsed?.height).toBeLessThan(100);
  expect(collapsed?.x).toBe(open?.x);

  // The strip itself opens it again, as its button does.
  await page.getByTestId('details-card').click();
  expect((await layoutOf(page))?.details).toBe('half');
  await panel.getByRole('button', { name: 'Collapse details' }).click();
  await panel.getByRole('button', { name: 'Expand details' }).click();
  expect((await layoutOf(page))?.details).toBe('half');
  await expect(panel.getByRole('button', { name: 'Collapse details' })).toBeVisible();
});
