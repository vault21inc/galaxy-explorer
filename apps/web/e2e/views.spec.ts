import { expect, test, type Page } from './test.ts';
import { galaxyObjects, systemChildren } from './demo.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Moving between the galaxy, system and orbit views (M5-T1, rendering.md §4, ux.md §9). */

const MAP = '/u/example-universe/main';

type Pose = { position: [number, number, number]; target: [number, number, number] } | null;

const level = (page: Page) => page.evaluate(() => window.__GE_TEST__?.level() ?? null);
const cameraPose = (page: Page): Promise<Pose> =>
  page.evaluate(() => window.__GE_TEST__?.cameraPose() ?? null);
const crumbs = (page: Page) =>
  page.getByRole('navigation', { name: 'Breadcrumbs' }).getByRole('listitem');

/** Waits until no change of view is under way and the camera has come to rest. */
async function settled(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.transitioning() ?? true))
    .toBe(false);
  await waitForIdle(page, 500);
}

async function idOf(page: Page, name: string): Promise<string> {
  const objects = await galaxyObjects(page.request, 'example-universe', 'main');
  const found = objects.find((object) => object.namePlain === name);
  if (!found) throw new Error(`No demo object ${name}`);
  return found.id;
}

/** Each coordinate within 1 % of the camera's distance to its target. */
function expectNear(actual: Pose, expected: Pose): void {
  if (!actual || !expected) throw new Error('No camera pose');
  const distance = Math.hypot(
    ...expected.position.map((value, axis) => value - (expected.target[axis] ?? 0)),
  );
  for (const [key, values] of [
    ['position', actual.position],
    ['target', actual.target],
  ] as const) {
    values.forEach((value, axis) => {
      expect(
        Math.abs(value - (expected[key][axis] ?? 0)),
        `${key}[${axis.toString()}]`,
      ).toBeLessThan(distance * 0.01);
    });
  }
}

test.describe('moving between views', () => {
  test('a link opens the system view with its breadcrumbs, and Esc goes up', async ({ page }) => {
    const aster = await idOf(page, 'Aster');
    await page.goto(`${MAP}/view/${aster}`);
    await waitForFirstFrame(page);
    await expect.poll(() => level(page)).toEqual({ level: 'system', subjectId: aster });
    await expect(crumbs(page)).toHaveText(['Galaxy', 'Aster']);
    await expect(
      page.getByRole('navigation', { name: 'Breadcrumbs' }).getByRole('link', { name: 'Galaxy' }),
    ).toBeVisible();

    // The system's own children are drawn, in system units.
    const children = await systemChildren(page.request, aster);
    const primus = children.find((child) => child.namePlain === 'Primus');
    expect(primus).toBeDefined();
    await expect
      .poll(() =>
        page.evaluate((id) => window.__GE_TEST__?.drawnObject(id)?.center, primus?.id ?? ''),
      )
      .toEqual([4.5, 0, 1.5]);

    // Opened from a link, there's no history to go back through: the galaxy view opens as a new
    // address, with the system just left selected.
    await settled(page);
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(`${MAP}?select=${aster}`);
    await expect.poll(() => level(page)).toEqual({ level: 'galaxy', subjectId: null });
    await expect(crumbs(page)).toHaveText(['Galaxy']);
  });

  test('Back returns to the galaxy view at the saved pose, and Forward re-enters', async ({
    page,
  }) => {
    await page.goto(MAP);
    await waitForFirstFrame(page);
    const [aster, brennan] = [await idOf(page, 'Aster'), await idOf(page, 'Brennan')];
    // Somewhere other than the starting pose, so returning to it proves the pose was saved.
    await page.evaluate((id) => window.__GE_TEST__?.flyTo(id), brennan);
    await waitForIdle(page);
    const saved = await cameraPose(page);

    await page.evaluate((id) => window.__GE_TEST__?.enter(id), aster);
    await expect(page).toHaveURL(`${MAP}/view/${aster}`);
    expect(await level(page)).toEqual({ level: 'system', subjectId: aster });
    await settled(page);

    await page.goBack();
    await expect(page).toHaveURL(MAP);
    await expect.poll(() => level(page)).toEqual({ level: 'galaxy', subjectId: null });
    await settled(page);
    expectNear(await cameraPose(page), saved);

    await page.goForward();
    await expect.poll(() => level(page)).toEqual({ level: 'system', subjectId: aster });
    await expect(crumbs(page)).toHaveText(['Galaxy', 'Aster']);
  });

  test('Esc and the breadcrumb go back through history after entering', async ({ page }) => {
    await page.goto(MAP);
    await waitForFirstFrame(page);
    const fenwick = await idOf(page, 'Fenwick');
    await settled(page);
    const start = await cameraPose(page);

    await page.evaluate((id) => window.__GE_TEST__?.enter(id), fenwick);
    await settled(page);
    await page
      .getByRole('navigation', { name: 'Breadcrumbs' })
      .getByRole('link', { name: 'Galaxy', exact: true })
      .click();
    await expect(page).toHaveURL(MAP);
    await expect.poll(() => level(page)).toEqual({ level: 'galaxy', subjectId: null });
    await settled(page);
    expectNear(await cameraPose(page), start);

    // Esc first clears a selection, and only then goes up a view.
    await page.evaluate((id) => window.__GE_TEST__?.enter(id), fenwick);
    await settled(page);
    const watch = (await systemChildren(page.request, fenwick)).find(
      (child) => child.namePlain === 'Fenwick Watch',
    );
    await page.goto(`${MAP}/view/${fenwick}?select=${watch?.id ?? ''}`);
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds()))
      .toEqual([watch?.id]);
    await settled(page);
    await page.keyboard.press('Escape');
    await expect.poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds())).toEqual([]);
    expect(await level(page)).toEqual({ level: 'system', subjectId: fenwick });
    await page.keyboard.press('Escape');
    await expect.poll(() => level(page)).toEqual({ level: 'galaxy', subjectId: null });
  });

  test('an object that opens no view opens the view it sits in, selected', async ({ page }) => {
    const veil = await idOf(page, 'Veil Nebula');
    await page.goto(`${MAP}/view/${veil}`);
    await expect(page).toHaveURL(`${MAP}?select=${veil}`);
    await expect.poll(() => level(page)).toEqual({ level: 'galaxy', subjectId: null });

    const fenwick = await idOf(page, 'Fenwick');
    const watch = (await systemChildren(page.request, fenwick)).find(
      (child) => child.namePlain === 'Fenwick Watch',
    );
    await page.goto(`${MAP}/view/${watch?.id ?? ''}`);
    await expect(page).toHaveURL(`${MAP}/view/${fenwick}?select=${watch?.id ?? ''}`);
    await expect.poll(() => level(page)).toEqual({ level: 'system', subjectId: fenwick });
    await expect(crumbs(page)).toHaveText(['Galaxy', 'Fenwick']);
  });

  test('a rogue planet opens its orbit view straight from the galaxy (M6-T3)', async ({ page }) => {
    await page.goto(MAP);
    await waitForFirstFrame(page);
    const wanderer = await idOf(page, 'Wanderer');
    await page.evaluate((id) => window.__GE_TEST__?.enter(id), wanderer);
    await expect.poll(() => level(page)).toEqual({ level: 'orbit', subjectId: wanderer });
    await expect(crumbs(page)).toHaveText(['Galaxy', 'Wanderer']);
    // Its globe, lit by the default light: it has no system, so no star.
    const globe = await page.evaluate(() => window.__GE_TEST__?.globe());
    expect(globe?.subjectId).toBe(wanderer);
    expect(globe?.sunFromStar).toBe(false);
  });

  test('an unknown object says so', async ({ page }) => {
    await page.goto(`${MAP}/view/019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b`);
    await expect(page.getByText('No such object on this map')).toBeVisible();
    await page.getByRole('link', { name: 'Open the galaxy view' }).click();
    await expect.poll(() => level(page)).toEqual({ level: 'galaxy', subjectId: null });
  });
});
