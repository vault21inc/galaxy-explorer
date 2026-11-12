import { expect, test } from '@playwright/test';
import { galaxyObjects, systemChildren } from './demo.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** The Events panel in the top bar (M6-T7), on the demo seed. */

const MAP = '/u/example-universe/main';

test.describe('the events list (M6-T7)', () => {
  test('lists the demo events in date order, filters by category, and goes to a pin', async ({
    page,
  }) => {
    // Galaxy → system → orbit, each waiting to settle: slow with CI's software rendering.
    test.slow();
    await page.goto(MAP);
    await waitForFirstFrame(page);
    await waitForIdle(page, 300);
    await page.getByRole('button', { name: 'Events', exact: true }).click();
    const list = page.getByRole('list', { name: 'Events in date order' });
    const rows = list.getByRole('button');
    // By date: Year 0, 298, 311 (a spoiler, blacked out while spoilers are hidden), 312.
    await expect(rows).toHaveCount(4);
    await expect(rows.nth(0)).toContainText('Founding of Hive Spire');
    await expect(rows.nth(0)).toContainText('Year 0');
    await expect(rows.nth(0)).toContainText('Aster › Primus › Hive Spire');
    await expect(rows.nth(1)).toContainText('Discovery of the Maw');
    await expect(rows.nth(2)).not.toContainText('Silent Fleet');
    await expect(rows.nth(3)).toContainText('Battle of Brennan');
    await expect(rows.nth(3)).toContainText('Year 312');

    // One category.
    await page.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Battle' });
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Battle of Brennan');
    await page
      .getByRole('combobox', { name: 'Category' })
      .selectOption({ label: 'All categories' });
    await expect(rows).toHaveCount(4);

    // The founding happened at Hive Spire on Primus: choosing it goes through the system to
    // Primus's orbit view, with the event's pin selected.
    const top = await galaxyObjects(page.request, 'example-universe', 'main');
    const aster = top.find((object) => object.namePlain === 'Aster')?.id ?? '';
    const primus = (await systemChildren(page.request, aster)).find(
      (child) => child.namePlain === 'Primus',
    );
    expect(primus).toBeDefined();
    await rows.nth(0).click();
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.level()), { timeout: 20_000 })
      .toEqual({ level: 'orbit', subjectId: primus?.id });
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.transitioning() ?? true), {
        timeout: 20_000,
      })
      .toBe(false);
    const selected = await page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
    expect(selected).toHaveLength(1);
    await expect
      .poll(() => page.evaluate((id) => window.__GE_TEST__?.pin(id), selected[0] ?? ''))
      .toMatchObject({ shape: 'event' });
    await expect(page.getByRole('complementary', { name: 'Details' })).toContainText(
      'Founding of Hive Spire',
    );
  });
});
