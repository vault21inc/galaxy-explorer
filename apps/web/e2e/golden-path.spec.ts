import { expect, test, type Page } from '@playwright/test';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * The proof of concept's golden path (M6-T8), in one test, through the UI only: a new
 * universe; settings; a system, entered; a star and a city planet, entered; an event on the
 * globe with a category, a date, a person and a spoiler in its description; view mode and
 * spoilers; back to the galaxy; a new sub-sector; then three undos and three redos.
 */

const box = async (page: Page) => {
  const canvas = await page.locator('canvas').boundingBox();
  if (!canvas) throw new Error('No canvas.');
  return canvas;
};

const hook = <T>(page: Page, fn: () => T) => page.evaluate(fn);

async function settled(page: Page, level: string) {
  await expect
    .poll(() => hook(page, () => window.__GE_TEST__?.level()?.level), { timeout: 20_000 })
    .toBe(level);
  await expect
    .poll(() => hook(page, () => window.__GE_TEST__?.transitioning() ?? true), { timeout: 20_000 })
    .toBe(false);
  await waitForIdle(page, 300);
}

async function primary(page: Page) {
  return (await hook(page, () => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
}

const panel = (page: Page) => page.getByRole('complementary', { name: 'Details' });

/** Add ▸ `item`, then a click at a fraction of the canvas; names what was added. */
async function add(page: Page, item: string, fx: number, fy: number, name: string) {
  await page
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name: /^Add/ })
    .click();
  await page.getByRole('menuitem', { name: item, exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toContainText('Esc cancels');
  const canvas = await box(page);
  await page.mouse.click(canvas.x + canvas.width * fx, canvas.y + canvas.height * fy);
  const field = panel(page).getByLabel('Name', { exact: true });
  await expect(field).toBeFocused();
  await field.fill(name);
  await field.press('Enter');
  await expect(panel(page).getByRole('form', { name: `Edit ${name}` })).toBeVisible();
}

/** The selected object's id, once exactly one is selected. */
async function selectedId(page: Page): Promise<string> {
  await expect.poll(() => hook(page, () => window.__GE_TEST__?.selectedIds().length)).toBe(1);
  return (await hook(page, () => window.__GE_TEST__?.selectedIds()[0])) ?? '';
}

/** Double-clicks an object on the canvas, which enters its view. */
async function enter(page: Page, id: string, level: string) {
  await expect
    .poll(() => page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id))
    .not.toBeNull();
  const at = await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id);
  if (!at) throw new Error('Off screen.');
  await page.mouse.dblclick(at.x, at.y);
  await settled(page, level);
}

test('the golden path (M6-T8)', async ({ page }) => {
  // Three views, a dozen saves and six history steps: slow with CI's software rendering.
  test.setTimeout(240_000);
  await page.goto('/');

  // 1. A universe and its first map.
  const name = `Golden ${Date.now().toString(36)}`;
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create universe' }).click();
  await expect(page).toHaveURL(/\/u\/golden-[a-z0-9]+\/main$/);
  const slug = new URL(page.url()).pathname.split('/')[2] ?? '';

  // Its settings: a sub-sector group type and a Battle category.
  await page.goto(`/u/${slug}/settings`);
  await page.getByRole('button', { name: 'Add group type' }).click();
  const typeRow = page
    .getByRole('table', { name: 'Group types' })
    .getByRole('row', { name: 'New group type' });
  await typeRow.getByLabel('Name', { exact: true }).fill('Sub-sector');
  await typeRow.getByLabel('Layer', { exact: true }).fill('Administrative');
  await typeRow.getByRole('button', { name: 'Create' }).click();
  await page.getByRole('button', { name: 'Add event category' }).click();
  const categoryRow = page
    .getByRole('table', { name: 'Event categories' })
    .getByRole('row', { name: 'New event category' });
  await categoryRow.getByLabel('Name', { exact: true }).fill('Battle');
  await categoryRow.getByRole('button', { name: 'Create' }).click();
  await expect(
    page.getByRole('table', { name: 'Event categories' }).getByRole('row', { name: /Battle/ }),
  ).toBeVisible();

  // 2. A system, explorable; enter it.
  await page.goto(`/u/${slug}/main`);
  await waitForFirstFrame(page);
  await settled(page, 'galaxy');
  await page.keyboard.press('e');
  await add(page, 'System', 0.5, 0.5, 'Calyx');
  const system = await selectedId(page);
  await panel(page).getByLabel('Explorable').check();
  await expect
    .poll(
      async () =>
        (
          (await getJson(page.request, `/api/v1/objects/${system}`)) as {
            data: { explorable: boolean };
          }
        ).data.explorable,
    )
    .toBe(true);
  await enter(page, system, 'system');

  // 3. A star and a city planet, explorable; enter the planet.
  await add(page, 'Star', 0.5, 0.5, 'Calyx Prime');
  await add(page, 'Planet', 0.66, 0.5, 'Calyx I');
  const planet = await selectedId(page);
  await panel(page).getByLabel('Preset').selectOption({ label: 'City (hive)' });
  await panel(page).getByLabel('Explorable').check();
  await expect
    .poll(async () => {
      const { data } = (await getJson(page.request, `/api/v1/objects/${planet}`)) as {
        data: { explorable: boolean; appearance: { planet?: { preset?: string } } };
      };
      return [data.explorable, data.appearance.planet?.preset];
    })
    .toEqual([true, 'city']);
  await enter(page, planet, 'orbit');

  // 4. An event at a clicked spot, with a category, a date, a person and a spoiler.
  await page.evaluate(() => window.__GE_TEST__?.faceGlobePoint(20, 30));
  await waitForIdle(page, 300);
  const spot = await page.evaluate(() => {
    const point = window.__GE_TEST__?.globePoint(20, 30, 1);
    return point ? window.__GE_TEST__?.projectPoint(point) : null;
  });
  if (!spot) throw new Error('The spot is off screen.');
  await page
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name: /^Add/ })
    .click();
  await page.getByRole('menuitem', { name: 'Event', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await page.mouse.click(spot.x, spot.y);
  const eventName = panel(page).getByLabel('Name', { exact: true });
  await expect(eventName).toBeFocused();
  await eventName.fill('Siege of Calyx');
  await eventName.press('Enter');
  const event = await selectedId(page);
  const location = (await getJson(page.request, `/api/v1/entities/${event}/location`)) as {
    data: { latDeg: number; lonDeg: number };
  };
  expect(Math.abs(location.data.latDeg - 20)).toBeLessThan(0.5);
  expect(Math.abs(location.data.lonDeg - 30)).toBeLessThan(0.5);
  await panel(page).getByLabel('Category', { exact: true }).selectOption({ label: 'Battle' });
  const date = panel(page).getByLabel('Date', { exact: true });
  await date.fill('240.M41');
  await date.press('Enter');
  const people = panel(page).getByRole('region', { name: 'People involved' });
  await people.getByRole('combobox', { name: 'Add to People involved' }).fill('Gregor Eisenhorn');
  await page.getByRole('option', { name: 'Create “Gregor Eisenhorn”' }).click();
  await expect(people.getByRole('textbox', { name: 'Role of Gregor Eisenhorn' })).toBeVisible();
  const description = panel(page).getByRole('group', { name: 'Description field' });
  await description.getByRole('textbox', { name: 'Description' }).click();
  await page.keyboard.type('The gates were opened by ||the traitor Vos||.');
  // Leaving edit mode saves the description (a blur).

  // 5. View mode: the spoiler is blacked out; shown, it's there.
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect
    .poll(async () => {
      const { data } = (await getJson(page.request, `/api/v1/events/${event}`)) as {
        data: { description: { source: string } | null; dateText: string | null };
      };
      return [data.description?.source, data.dateText];
    })
    .toEqual(['The gates were opened by ||the traitor Vos||.', '240.M41']);
  await expect(panel(page)).toContainText('The gates were opened by');
  await expect(panel(page)).not.toContainText('the traitor Vos');
  await expect(panel(page)).toContainText('Gregor Eisenhorn');
  await page.getByRole('button', { name: 'Spoilers: Hidden' }).click();
  await expect(panel(page)).toContainText('the traitor Vos');

  // 6. Back out to the galaxy.
  await page
    .getByRole('navigation', { name: 'Breadcrumbs' })
    .getByRole('link', { name: 'Galaxy' })
    .click();
  await settled(page, 'galaxy');

  // 7. Group the system into a new sub-sector.
  await page.keyboard.press('e');
  await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toBeVisible();
  const at = await page.evaluate((id) => window.__GE_TEST__?.screenPositionOf(id), system);
  if (!at) throw new Error('The system is off screen.');
  await page.mouse.click(at.x, at.y);
  await expect.poll(() => hook(page, () => window.__GE_TEST__?.selectedIds())).toEqual([system]);
  await page.keyboard.press(`${await primary(page)}+g`);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('Helican');
  await dialog.getByRole('button', { name: 'Group' }).click();
  await expect(dialog).toHaveCount(0);
  const groupsOf = async () =>
    (
      (await getJson(page.request, `/api/v1/maps/${await mapIdOf(page, slug)}/views/galaxy`)) as {
        data: { groups: { namePlain: string; members: { objectId: string }[] }[] };
      }
    ).data.groups.map((group) => [group.namePlain, group.members.map((m) => m.objectId)]);
  await expect.poll(groupsOf).toEqual([['Helican', [system]]]);

  // 8. Undo the last three changes (the group, the description, the person), then redo them.
  const eventState = async () => {
    const { data } = (await getJson(page.request, `/api/v1/events/${event}?include=relations`)) as {
      data: { description: unknown; relations?: unknown[] };
    };
    return [data.description !== null, data.relations?.length ?? 0];
  };
  await page.locator('canvas').focus();
  const undoKey = `${await primary(page)}+z`;
  for (let step = 0; step < 3; step++) {
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    await page.keyboard.press(undoKey);
  }
  await expect.poll(groupsOf).toEqual([]);
  await expect.poll(eventState).toEqual([false, 0]);
  for (let step = 0; step < 3; step++) {
    await expect(page.getByRole('button', { name: 'Redo' })).toBeEnabled();
    await page.keyboard.press(`${await primary(page)}+Shift+z`);
  }
  await expect.poll(groupsOf).toEqual([['Helican', [system]]]);
  await expect.poll(eventState).toEqual([true, 1]);
});

async function mapIdOf(page: Page, slug: string): Promise<string> {
  const universes = (await getJson(page.request, '/api/v1/universes?limit=1000')) as {
    data: { id: string; slug: string }[];
  };
  const universe = universes.data.find((item) => item.slug === slug);
  const maps = (await getJson(page.request, `/api/v1/universes/${universe?.id ?? ''}/maps`)) as {
    data: { id: string; slug: string }[];
  };
  return maps.data.find((map) => map.slug === 'main')?.id ?? '';
}
