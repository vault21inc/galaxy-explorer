import AxeBuilder from '@axe-core/playwright';
import { CONFIG_RESOURCES, configResources } from '@ge/domain';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getJson } from './api.ts';

/** The universe settings page (M4-T1): the details form and one table per config resource. */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function setUp(request: APIRequestContext) {
  const slug = `settings-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const response = await request.post('/api/v1/universes', {
    data: { slug, name: plain('Settings test') },
  });
  expect(response.ok(), await response.text()).toBe(true);
  const { id } = ((await response.json()) as { data: { id: string } }).data;
  return { url: `/u/${slug}/settings`, universeId: id };
}

interface GroupType {
  id: string;
  name: string;
  layer: string;
  parentGroupTypeId: string | null;
  sortKey: number;
}

const groupTypes = async (page: Page, universeId: string) =>
  (
    (await getJson(page.request, `/api/v1/universes/${universeId}/group-types`)) as {
      data: GroupType[];
    }
  ).data;

const table = (page: Page) => page.getByRole('table', { name: 'Group types' });
const names = (page: Page) =>
  table(page)
    .getByRole('row')
    .filter({ has: page.getByLabel('Name', { exact: true }) })
    .getByLabel('Name', { exact: true });

/** The group types' names, top to bottom, once they read `expected`. */
async function expectNames(page: Page, expected: string[]) {
  await expect
    .poll(() =>
      names(page).evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value)),
    )
    .toEqual(expected);
}

/** Adds a group type through the new row; `parent` picks its parent type by name. */
async function addGroupType(page: Page, name: string, parent?: string) {
  await page.getByRole('button', { name: 'Add group type' }).click();
  const row = table(page).getByRole('row', { name: 'New group type' });
  await row.getByLabel('Name', { exact: true }).fill(name);
  await row.getByLabel('Layer', { exact: true }).fill('Administrative');
  if (parent) await row.getByLabel('Parent type').selectOption({ label: parent });
  await row.getByRole('button', { name: 'Create' }).click();
  await expect(table(page).getByRole('row', { name, exact: true })).toBeVisible();
}

test.describe('universe settings (M4-T1)', () => {
  test('the three administrative group types and their parent chain persist', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    await addGroupType(page, 'Segmentum');
    await addGroupType(page, 'Sector', 'Segmentum');
    await addGroupType(page, 'Sub-sector', 'Sector');

    await page.reload();
    await expectNames(page, ['Segmentum', 'Sector', 'Sub-sector']);
    const subSector = table(page).getByRole('row', { name: 'Sub-sector', exact: true });
    await expect(subSector.getByLabel('Parent type')).toHaveText(/Sector/);
    const saved = await groupTypes(page, s.universeId);
    const byName = Object.fromEntries(saved.map((type) => [type.name, type]));
    expect(byName.Segmentum?.parentGroupTypeId).toBeNull();
    expect(byName.Sector?.parentGroupTypeId).toBe(byName.Segmentum?.id);
    expect(byName['Sub-sector']?.parentGroupTypeId).toBe(byName.Sector?.id);
    expect(saved.every((type) => type.layer === 'Administrative')).toBe(true);
  });

  test('rows reorder by drag and by keyboard, edit in place, and delete', async ({ page }) => {
    const s = await setUp(page.request);
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await page.request.post(`/api/v1/universes/${s.universeId}/group-types`, {
        data: { name, layer: 'Political', defaultColor: '#c8a24a' },
      });
    }
    await page.goto(s.url);
    await expectNames(page, ['Alpha', 'Beta', 'Gamma']);

    // Drag Gamma's handle above Alpha.
    const handle = page.getByRole('button', { name: 'Move Gamma' });
    // Mouse input only reaches what's in the viewport.
    await table(page).scrollIntoViewIfNeeded();
    const alpha = await table(page).getByRole('row', { name: 'Alpha' }).boundingBox();
    const from = await handle.boundingBox();
    if (!alpha || !from) throw new Error('Rows are not laid out.');
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, alpha.y + 4, { steps: 8 });
    await page.mouse.up();
    await expectNames(page, ['Gamma', 'Alpha', 'Beta']);

    // Arrow Down on Gamma's handle moves it back below Alpha; the arrow doesn't move the page's
    // camera either.
    await handle.focus();
    await page.keyboard.press('ArrowDown');
    await expectNames(page, ['Alpha', 'Gamma', 'Beta']);
    await expect(handle).toBeFocused();

    // An in-place edit saves on blur.
    const beta = table(page).getByRole('row', { name: 'Beta' });
    await beta.getByLabel('Layer', { exact: true }).fill('Administrative');
    await beta.getByLabel('Layer', { exact: true }).press('Enter');

    // Delete, after the confirmation.
    await page.getByRole('button', { name: 'Delete Alpha' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expectNames(page, ['Gamma', 'Beta']);

    await page.reload();
    await expectNames(page, ['Gamma', 'Beta']);
    const saved = await groupTypes(page, s.universeId);
    expect(saved.find((type) => type.name === 'Beta')?.layer).toBe('Administrative');
  });

  test('a new row says what it still needs', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    await page.getByRole('button', { name: 'Add group type' }).click();
    const row = table(page).getByRole('row', { name: 'New group type' });
    await expect(row.getByLabel('Name', { exact: true })).toBeFocused();
    await row.getByRole('button', { name: 'Create' }).click();
    await expect(row.getByRole('alert')).toHaveText('Name is required.');
    await row.getByRole('button', { name: 'Cancel' }).click();
    await expect(row).toHaveCount(0);
  });

  test('there is a table for every config resource, and the details save', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    for (const resource of CONFIG_RESOURCES) {
      await expect(
        page.getByRole('table', { name: configResources[resource].label.many }),
      ).toBeVisible();
    }

    const details = page.getByRole('form', { name: 'Universe details' });
    await details.getByLabel('Galaxy unit').fill('ly');
    await details.getByLabel('Galaxy unit').press('Enter');
    await expect
      .poll(async () => {
        const universe = (await getJson(page.request, `/api/v1/universes/${s.universeId}`)) as {
          data: { settings: { distanceUnitLabels?: { galaxy?: string } } };
        };
        return universe.data.settings.distanceUnitLabels?.galaxy;
      })
      .toBe('ly');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });

  test('the universe switcher links to the settings', async ({ page }) => {
    await page.goto('/u/example-universe/main');
    await page.getByRole('button', { name: /^Universe:/ }).click();
    await page.getByRole('menuitem', { name: 'Universe settings' }).click();
    await expect(page).toHaveURL(/\/u\/example-universe\/settings$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/settings$/);
  });

  test('deleting the universe asks for its name, then it’s gone (M8-T12)', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    const sharing = page.getByRole('region', { name: 'Sharing' });
    // No accounts here: nothing to share, so only Delete, and no two-factor code.
    await expect(sharing.getByRole('button', { name: 'Transfer…' })).toHaveCount(0);
    await sharing.getByRole('button', { name: 'Delete universe…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete Settings test' });
    const confirm = dialog.getByRole('button', { name: 'Delete it' });
    await expect(confirm).toBeDisabled();
    await expect(dialog.getByLabel('Code from your authenticator app')).toHaveCount(0);
    await dialog.getByLabel('Type the universe’s name to confirm').fill('Settings test');
    await confirm.click();
    await expect(page).toHaveURL(/\/$/);
    const gone = await page.request.get(`/api/v1/universes/${s.universeId}`);
    expect(gone.status()).toBe(404);
  });
});
