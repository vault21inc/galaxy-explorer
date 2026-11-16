import AxeBuilder from '@axe-core/playwright';
import { getJson } from './api.ts';
import { expect, test, type Page } from './test.ts';
import { framesDuring, waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * The guided tours (M8-T10, D-30, ux.md §12): each runs from start to end with every step
 * finding its target on screen; Esc ends one and the Help menu starts it again; the first-visit
 * offer shows once; and a step that waits keeps the canvas idle. The editor tour makes a
 * practice universe, changes only that, and deletes it at the end. (That nobody else sees it is
 * apps/api/test/practice.int.test.ts.)
 */

const MAP = '/u/example-universe/main';

async function openMap(page: Page, url = MAP) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page);
}

const step = (page: Page) => page.locator('[data-tour-step]');
const highlight = (page: Page) => page.locator('[data-tour-highlight]');

async function startTour(page: Page, name: 'Take the tour' | 'Editor tour') {
  await page.getByRole('button', { name: 'Help' }).click();
  await page.getByRole('menuitem', { name }).click();
}

/** The step showing is `id`, focused or not, and points where it should. */
async function expectStep(page: Page, id: string, target?: { control: string } | 'object') {
  await expect(step(page)).toHaveAttribute('data-tour-step', id, { timeout: 10_000 });
  if (!target) {
    await expect(highlight(page)).toHaveCount(0);
    return;
  }
  await expect(highlight(page)).toBeVisible();
  if (target === 'object') return;
  // The ring is around the control: their centers match within a few pixels.
  const control = page.locator(`[data-tour="${target.control}"]`).first();
  await expect
    .poll(async () => {
      const [ring, box] = [await highlight(page).boundingBox(), await control.boundingBox()];
      if (!ring || !box) return Infinity;
      return Math.hypot(
        ring.x + ring.width / 2 - (box.x + box.width / 2),
        ring.y + ring.height / 2 - (box.y + box.height / 2),
      );
    })
    .toBeLessThan(3);
}

/**
 * The middle of the ring around an object, where the object is drawn, once the view and the
 * ring have stopped moving. The canvas must have drawn nothing for a while: on a slow
 * software-rendered machine (CI) two quick reads can match while the camera is still flying in.
 * The ring then eases to its place over 150 ms.
 */
async function ringCenter(page: Page) {
  await waitForIdle(page, 500);
  let last = '';
  await expect
    .poll(async () => {
      const ring = await highlight(page).boundingBox();
      const now = ring ? `${String(ring.x)},${String(ring.y)}` : 'none';
      const stable = now === last && now !== 'none';
      last = now;
      return stable;
    })
    .toBe(true);
  const ring = await highlight(page).boundingBox();
  if (!ring) throw new Error('No highlight.');
  return { x: ring.x + ring.width / 2, y: ring.y + ring.height / 2 };
}

async function next(page: Page) {
  await step(page)
    .getByRole('button', { name: /^(Next|Finish)$/ })
    .click();
}

test.describe('guided tours (M8-T10)', () => {
  test('the reader tour runs from start to end, each step finding its target', async ({ page }) => {
    await openMap(page);
    await startTour(page, 'Take the tour');
    await expect(page.getByRole('region', { name: 'Tour, step 1 of 12' })).toBeFocused();

    await expectStep(page, 'move');
    const canvas = await page.locator('canvas').boundingBox();
    if (!canvas) throw new Error('No canvas.');
    await page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.3);
    await page.mouse.down();
    await page.mouse.move(canvas.x + canvas.width * 0.65, canvas.y + canvas.height * 0.33, {
      steps: 5,
    });
    await page.mouse.up();

    await expectStep(page, 'select', 'object');
    const system = await ringCenter(page);
    await page.mouse.click(system.x, system.y);

    await expectStep(page, 'labels');
    await page.keyboard.press('l');

    await expectStep(page, 'spoilers', { control: 'spoilers' });
    await next(page);
    await expectStep(page, 'list', { control: 'list' });
    await page.locator('[data-tour="list"]').click();
    await expectStep(page, 'layers', { control: 'layers' });
    await next(page);

    await expectStep(page, 'enter-system', 'object');
    const explorable = await ringCenter(page);
    await page.mouse.dblclick(explorable.x, explorable.y);
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
    // A planet to visit, if this system has one; then back out by the breadcrumbs.
    await expect(step(page)).toHaveAttribute('data-tour-step', /enter-planet|go-back/);
    if ((await step(page).getAttribute('data-tour-step')) === 'enter-planet') {
      await expectStep(page, 'enter-planet', 'object');
      await next(page);
    }
    await expectStep(page, 'go-back', { control: 'breadcrumbs' });
    await page.getByRole('navigation', { name: 'Breadcrumbs' }).getByRole('link').first().click();

    await expectStep(page, 'events', { control: 'events' });
    await next(page);
    await expectStep(page, 'search', { control: 'search' });
    await next(page);
    await expectStep(page, 'shortcuts', { control: 'help' });
    await next(page);
    await expect(step(page)).toHaveCount(0);
    await expect(highlight(page)).toHaveCount(0);
  });

  test('Esc ends a tour, and the Help menu starts it again', async ({ page }) => {
    await openMap(page);
    await startTour(page, 'Take the tour');
    await expectStep(page, 'move');
    // Esc ends it from the step, which has the focus.
    await expect(step(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(step(page)).toHaveCount(0);
    await startTour(page, 'Take the tour');
    await expectStep(page, 'move');
  });

  test('a waiting step draws nothing, and axe finds nothing wrong with it', async ({ page }) => {
    await openMap(page);
    await startTour(page, 'Take the tour');
    await expectStep(page, 'move');
    await next(page);
    await expectStep(page, 'select', 'object');
    await waitForIdle(page);
    expect(await framesDuring(page, 1_000)).toBe(0);
    const results = await new AxeBuilder({ page })
      .include('[data-tour-step]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('the editor tour practises in a universe of its own, and deletes it at the end', async ({
    page,
  }) => {
    const example = (await getJson(page.request, '/api/v1/universes/by-slug/example-universe')) as {
      data: { id: string };
    };
    const historyOf = async (universeId: string) =>
      (
        (await getJson(page.request, `/api/v1/universes/${universeId}/history?limit=100`)) as {
          data: unknown[];
        }
      ).data.length;
    const before = await historyOf(example.data.id);

    await openMap(page);
    await startTour(page, 'Editor tour');
    await expect(page).toHaveURL(/\/u\/practice-[0-9a-f]{8}\/main$/, { timeout: 15_000 });
    const slug = new URL(page.url()).pathname.split('/')[2] ?? '';
    await waitForFirstFrame(page);
    await expect(page.getByRole('button', { name: /Universe: Practice/ })).toBeVisible();

    await expectStep(page, 'edit-mode', { control: 'edit-toggle' });
    await page.keyboard.press('e');
    await expectStep(page, 'toolbar', { control: 'edit-toolbar' });
    await next(page);

    // Add a system: placed and named, it's a change, and it's selected.
    await expectStep(page, 'add-object', { control: 'add-menu' });
    await page.locator('[data-tour="add-menu"]').click();
    await page.getByRole('menuitem', { name: 'System', exact: true }).click();
    // Placing, once the menu has faded: a click on it while it fades would choose again.
    await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toContainText(
      'Click to place a system',
    );
    await expect(page.getByRole('menu')).toHaveCount(0);
    const canvas = await page.locator('canvas').boundingBox();
    if (!canvas) throw new Error('No canvas.');
    // High and right of the middle: clear of the step, which sits above the toolbar's Add
    // button and is taller where fonts are wider (CI).
    const spot = { x: canvas.x + canvas.width * 0.62, y: canvas.y + canvas.height * 0.35 };
    await page.mouse.move(spot.x, spot.y, { steps: 5 });
    // The ghost follows the pointer once the plane is under it (create-object.spec.ts).
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.placement()?.baseType))
      .toBe('system');
    await page.mouse.click(spot.x, spot.y);
    await expectStep(page, 'move-object', 'object');
    // Its name field kept the focus the placement gave it.
    await expect(page.locator('input:focus, textarea:focus, [contenteditable]:focus')).toHaveCount(
      1,
    );
    await next(page);
    await expectStep(page, 'object-form', { control: 'info-panel' });
    await next(page);
    await expectStep(page, 'group', { control: 'tool-group' });
    await next(page);
    await expectStep(page, 'undo', { control: 'tool-history' });
    await next(page);
    await expectStep(page, 'settings', { control: 'universe-switcher' });
    await next(page);
    await expectStep(page, 'map-settings', { control: 'tool-map' });
    await next(page);
    await expectStep(page, 'regions-routes', { control: 'tool-route' });
    await next(page);

    await expectStep(page, 'enter-system', 'object');
    const system = await ringCenter(page);
    await page.mouse.dblclick(system.x, system.y);
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
    await expectStep(page, 'add-planet', { control: 'add-menu' });
    await next(page);
    await expect(step(page)).toHaveAttribute('data-tour-step', /enter-globe|delete/);
    if ((await step(page).getAttribute('data-tour-step')) === 'enter-globe') {
      await expectStep(page, 'enter-globe', 'object');
      const planet = await ringCenter(page);
      await page.mouse.dblclick(planet.x, planet.y);
      await expectStep(page, 'place-event', { control: 'add-menu' });
      await next(page);
    }
    await expectStep(page, 'delete');
    await next(page);

    const finish = page.getByRole('dialog', { name: 'That’s the editor tour' });
    await expect(finish).toBeVisible();
    await expect(
      finish.getByRole('button', { name: 'Delete the practice universe' }),
    ).toBeFocused();
    await finish.getByRole('button', { name: 'Delete the practice universe' }).click();
    await expect(page).toHaveURL(/\/$/);
    expect((await page.request.get(`/api/v1/universes/by-slug/${slug}`)).status()).toBe(404);
    // The tour changed nothing anywhere else.
    expect(await historyOf(example.data.id)).toBe(before);
  });
});

test.describe('the first-visit offer (M8-T10)', () => {
  test.use({ tourOffers: true });

  test('shows once, and turning it down survives a reload', async ({ page }) => {
    await openMap(page);
    const offer = page.getByRole('complementary', { name: 'Guided tour' });
    await expect(offer).toContainText('New here?');
    await offer.getByRole('button', { name: 'No thanks' }).click();
    await expect(offer).toHaveCount(0);
    await page.reload();
    await waitForFirstFrame(page);
    await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
    await expect(offer).toHaveCount(0);
  });

  test('taking it starts the tour', async ({ page }) => {
    await openMap(page);
    await page
      .getByRole('complementary', { name: 'Guided tour' })
      .getByRole('button', { name: 'Take the tour' })
      .click();
    await expectStep(page, 'move');
  });
});
