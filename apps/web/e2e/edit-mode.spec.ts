import { expect, test, type Page } from '@playwright/test';
import { galaxyObjects } from './demo.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

const MAP = '/u/example-universe/main';

const editButton = (page: Page) => page.getByRole('button', { name: 'Edit', exact: true });

/** The camera's angle around its target, in radians. */
async function azimuth(page: Page): Promise<number> {
  const pose = await page.evaluate(() => window.__GE_TEST__?.cameraPose());
  if (!pose) throw new Error('No camera pose.');
  return Math.atan2(pose.position[0] - pose.target[0], pose.position[2] - pose.target[2]);
}

async function openDemo(page: Page) {
  const objects = await galaxyObjects(page.request, 'example-universe', 'main');
  await page.goto(MAP);
  await waitForFirstFrame(page);
  await expect
    .poll(
      () => page.evaluate((id) => window.__GE_TEST__?.screenPositionOf(id), objects[0]?.id ?? ''),
      {
        timeout: 15_000,
      },
    )
    .not.toBeNull();
  await waitForIdle(page);
  return objects;
}

test.describe('edit mode (ux.md §2)', () => {
  test('E and the toggle switch edit mode and its toolbar', async ({ page }) => {
    await openDemo(page);
    await expect(editButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toHaveCount(0);

    await page.keyboard.press('e');
    await expect(editButton(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toBeVisible();

    await editButton(page).click();
    await expect(editButton(page)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toHaveCount(0);
  });

  test('a left-drag on empty space draws a selection box instead of rotating', async ({ page }) => {
    const objects = await openDemo(page);
    await page.keyboard.press('e');
    const box = await page.locator('canvas').boundingBox();
    if (!box) throw new Error('The canvas has no size.');
    // From the empty top-left corner to the middle: a box over the upper-left quarter.
    const from = { x: box.x + 20, y: box.y + 70 };
    const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const before = await azimuth(page);

    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await expect(page.getByTestId('selection-box')).toBeVisible();
    await page.mouse.up();
    await expect(page.getByTestId('selection-box')).toBeHidden();
    await waitForIdle(page);
    expect(Math.abs((await azimuth(page)) - before)).toBeLessThan(1e-6);

    // Exactly the objects whose centers lie in the box are selected.
    const expected = await page.evaluate(
      ({ ids, rect }) =>
        ids.filter((id) => {
          const at = window.__GE_TEST__?.screenPositionOf(id);
          return (
            at && at.x >= rect.left && at.x <= rect.right && at.y >= rect.top && at.y <= rect.bottom
          );
        }),
      {
        ids: objects.map((object) => object.id),
        rect: { left: from.x, top: from.y, right: to.x, bottom: to.y },
      },
    );
    const selected = await page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
    expect([...selected].sort()).toEqual([...expected].sort());
    expect(selected.length).toBeGreaterThan(0);

    // Out of edit mode, the same drag rotates the camera again.
    await page.keyboard.press('e');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(to.x, to.y, { steps: 12 });
    await page.mouse.up();
    await waitForIdle(page);
    expect(Math.abs((await azimuth(page)) - before)).toBeGreaterThan(0.05);
  });

  test('drafts appear only in edit mode', async ({ page }) => {
    await openDemo(page);
    // Halcyon is a draft system in the demo seed.
    const drafts = await page.request.get('/api/v1/universes');
    expect(drafts.ok()).toBe(true);
    const halcyon = await page.evaluate(async () => {
      const universes = (await (await fetch('/api/v1/universes')).json()) as {
        data: { id: string; slug: string }[];
      };
      const universe = universes.data.find((item) => item.slug === 'example-universe');
      const maps = (await (await fetch(`/api/v1/universes/${universe?.id ?? ''}/maps`)).json()) as {
        data: { id: string; slug: string }[];
      };
      const map = maps.data.find((item) => item.slug === 'main');
      const view = (await (
        await fetch(`/api/v1/maps/${map?.id ?? ''}/views/galaxy?includeDrafts=true`)
      ).json()) as {
        data: { objects: { id: string; namePlain: string; status: string }[] };
      };
      return view.data.objects.find((object) => object.namePlain === 'Halcyon');
    });
    if (!halcyon) throw new Error('The demo seed should have the draft Halcyon.');
    expect(halcyon.status).toBe('draft');

    const drawn = () => page.evaluate((id) => window.__GE_TEST__?.drawnObject(id), halcyon.id);
    expect(await drawn()).toBeNull();
    await page.keyboard.press('e');
    await expect.poll(drawn).toMatchObject({ state: 'draft' });
    await page.keyboard.press('e');
    await expect.poll(drawn).toBeNull();
  });

  test('edit mode shows every spoiler, marked', async ({ page }) => {
    const objects = await openDemo(page);
    const erebus = objects.find((object) => object.namePlain === 'Erebus');
    await page.goto(`${MAP}?select=${erebus?.id ?? ''}`);
    await waitForFirstFrame(page);
    const panel = page.getByRole('complementary', { name: 'Details' });
    await expect(panel).toContainText('This entry contains potential spoilers.');

    await page.keyboard.press('e');
    // In edit mode the name is an editable field (M3-T2).
    await expect(panel.getByLabel('Name', { exact: true })).toHaveValue('Erebus');
    await expect(panel.locator('[data-spoiler-marked]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Spoilers: Shown' })).toBeDisabled();
    expect(
      await page.evaluate((id) => window.__GE_TEST__?.drawnObject(id)?.state, erebus?.id ?? ''),
    ).toBe('normal');
  });

  test('is offered only on a map', async ({ page }) => {
    await page.goto('/');
    await waitForFirstFrame(page);
    await expect(editButton(page)).toHaveCount(0);
  });
});
