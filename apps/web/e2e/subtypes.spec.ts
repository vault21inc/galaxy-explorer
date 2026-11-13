import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Object subtypes (M7-T2): defined in settings with a default look, placed from Add. */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A universe of its own with one explorable, empty system. */
async function setUp(request: APIRequestContext) {
  const slug = `subtypes-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('Subtypes') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Calyx'),
    baseType: 'system',
    explorable: true,
  });
  return { slug, universeId: universe.id, systemId: system.id };
}

interface Subtype {
  id: string;
  name: string;
  icon: string | null;
  defaultAppearance?: { color?: string; planet?: { preset?: string } };
}

async function subtypesOf(request: APIRequestContext, universeId: string) {
  return (
    (await getJson(request, `/api/v1/universes/${universeId}/object-subtypes`)) as {
      data: Subtype[];
    }
  ).data;
}

async function childrenOf(request: APIRequestContext, systemId: string) {
  return (
    (await getJson(request, `/api/v1/objects/${systemId}/views/system`)) as {
      data: {
        children: {
          id: string;
          subtypeId: string | null;
          namePlain: string;
          appearance: { color?: string };
        }[];
      };
    }
  ).data.children;
}

/** In the settings, the Hive World row's look dialog. */
async function openLook(page: Page) {
  await page.getByRole('button', { name: 'Look of Hive World' }).click();
  const dialog = page.getByRole('dialog', { name: 'Hive World' });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function setColor(page: Page, color: string) {
  const dialog = await openLook(page);
  const field = dialog.getByLabel('Color', { exact: true });
  await field.fill(color);
  await field.press('Enter');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
}

/** Add ▸ Planet ▸ Hive World, then a click at a fraction of the canvas. */
async function addHiveWorld(page: Page, fx: number, fy: number) {
  await page
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name: /^Add/ })
    .click();
  await page.getByRole('menuitem', { name: 'Planet', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Hive World', exact: true }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(page.getByRole('toolbar', { name: 'Edit tools' })).toContainText(
    'Click to place a Hive World',
  );
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('No canvas.');
  await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
  expect(await page.evaluate(() => window.__GE_TEST__?.level()?.level)).toBe('system');
}

async function openSystem(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level), { timeout: 20_000 })
    .toBe('system');
  await waitForIdle(page, 300);
}

test('a Hive World starts as a city, and follows its subtype’s color until it has its own (M7-T2)', async ({
  page,
}) => {
  const s = await setUp(page.request);

  // The subtype, in the universe settings: a planet, with an icon, a city look and a color.
  await page.goto(`/u/${s.slug}/settings`);
  await page.getByRole('button', { name: 'Add object subtype' }).click();
  const row = page
    .getByRole('table', { name: 'Object subtypes' })
    .getByRole('row', { name: 'New object subtype' });
  await row.getByLabel('Name', { exact: true }).fill('Hive World');
  await row.getByRole('button', { name: 'Create' }).click();
  await expect(
    page.getByRole('table', { name: 'Object subtypes' }).getByRole('row', { name: /Hive World/ }),
  ).toBeVisible();
  const dialog = await openLook(page);
  // The base type's fields show: a planet's preset among them.
  await dialog.getByLabel('Preset', { exact: true }).selectOption({ label: 'City (hive)' });
  await expect
    .poll(async () => (await subtypesOf(page.request, s.universeId))[0]?.defaultAppearance)
    .toMatchObject({ planet: { preset: 'city' } });
  await page.keyboard.press('Escape');
  await setColor(page, '#aa8844');
  await expect
    .poll(async () => (await subtypesOf(page.request, s.universeId))[0]?.defaultAppearance)
    .toEqual({ planet: { preset: 'city' }, color: '#aa8844' });
  const subtype = (await subtypesOf(page.request, s.universeId))[0];
  if (!subtype) throw new Error('No subtype.');

  // Two Hive Worlds, from Add ▸ Planet ▸ Hive World; the second gets a color of its own.
  await openSystem(page, `/u/${s.slug}/main/view/${s.systemId}`);
  await page.keyboard.press('e');
  await addHiveWorld(page, 0.35, 0.5);
  await expect.poll(async () => (await childrenOf(page.request, s.systemId)).length).toBe(1);
  // Straight to the next one: an Esc here, before the new name field has focus, would leave
  // the system view.
  await addHiveWorld(page, 0.65, 0.5);
  await expect.poll(async () => (await childrenOf(page.request, s.systemId)).length).toBe(2);
  const [first, second] = await childrenOf(page.request, s.systemId);
  if (!first || !second) throw new Error('No planets.');
  expect([first.subtypeId, second.subtypeId]).toEqual([subtype.id, subtype.id]);
  expect(first.namePlain).toBe('New Hive World');
  // The city preset by default: the system view baked its surface as a city.
  await expect
    .poll(() => page.evaluate((id) => window.__GE_TEST__?.planetSurface(id)?.key ?? '', first.id))
    .toContain('"preset":"city"');
  const object = (await getJson(page.request, `/api/v1/objects/${second.id}`)) as {
    data: { version: number };
  };
  const own = await page.request.patch(`/api/v1/objects/${second.id}`, {
    data: { version: object.data.version, appearance: { color: '#22cc66' } },
  });
  expect(own.ok(), await own.text()).toBe(true);

  // A new default color recolors the Hive World that has none of its own, not the other.
  await page.goto(`/u/${s.slug}/settings`);
  await setColor(page, '#3366ff');
  await expect
    .poll(async () =>
      (await childrenOf(page.request, s.systemId)).map((child) => child.appearance.color),
    )
    .toEqual(['#3366ff', '#22cc66']);
  await openSystem(page, `/u/${s.slug}/main/view/${s.systemId}`);
  const color = (id: string) =>
    page.evaluate((target) => window.__GE_TEST__?.drawnObject(target)?.color, id);
  await expect.poll(() => color(first.id)).toBe('#3366ff');
  expect(await color(second.id)).toBe('#22cc66');
});
