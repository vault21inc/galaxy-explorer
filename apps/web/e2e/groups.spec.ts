import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Groups from a selection, and editing their members (M4-T2, ux.md §5). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

interface Setup {
  url: string;
  mapId: string;
  ids: Record<string, string>;
}

async function setUp(request: APIRequestContext): Promise<Setup> {
  const slug = `groups-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Groups test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Sub-sector',
    layer: 'Administrative',
    defaultColor: '#c8a24a',
  });
  const ids: Record<string, string> = {};
  for (const [index, name] of ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon'].entries()) {
    ids[name] = await post(`/api/v1/maps/${mapId}/objects`, {
      name: plain(name),
      baseType: 'system',
      x: (index - 2) * 6_000,
      y: 0,
      z: 0,
    });
  }
  return { url: `/u/${slug}/main`, mapId, ids };
}

interface Group {
  id: string;
  namePlain: string;
  members: { objectId: string; isSpoiler: boolean }[];
}

/** The map's groups with their members, from the galaxy view. */
async function groups(page: Page, s: Setup): Promise<Group[]> {
  const view = (await getJson(page.request, `/api/v1/maps/${s.mapId}/views/galaxy`)) as {
    data: { groups: Group[] };
  };
  return view.data.groups;
}

const membersOf = async (page: Page, s: Setup, name: string) =>
  (await groups(page, s))
    .find((group) => group.namePlain === name)
    ?.members.map((member) => member.objectId)
    .sort() ?? null;

const idsOf = (s: Setup, ...names: string[]) => names.map((name) => s.ids[name] ?? '').sort();

/** Cmd or Ctrl, as the app decided: the Chromium project runs with a Windows user agent. */
async function primary(page: Page) {
  return (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
}

/** Opens the map in edit mode with these objects selected (`?select=` restores a selection). */
async function openWith(page: Page, s: Setup, names: string[]) {
  await page.goto(`${s.url}?select=${names.map((name) => s.ids[name] ?? '').join(',')}`);
  await waitForFirstFrame(page);
  await waitForIdle(page);
  await page.keyboard.press('e');
}

async function clickObject(page: Page, id: string, button: 'left' | 'right' = 'left') {
  const at = await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id);
  if (!at) throw new Error(`${id} is off screen.`);
  await page.mouse.click(at.x, at.y, { button });
}

async function groupAs(page: Page, name: string) {
  await page.keyboard.press(`${await primary(page)}+g`);
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(name);
  await dialog.getByRole('button', { name: 'Group' }).click();
}

test.describe('groups from a selection (M4-T2)', () => {
  test('grouping four systems creates the group and its members, then selects it', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await openWith(page, s, ['Alpha', 'Beta', 'Gamma', 'Delta']);
    await groupAs(page, 'Helican');

    await expect
      .poll(() => membersOf(page, s, 'Helican'))
      .toEqual(idsOf(s, 'Alpha', 'Beta', 'Gamma', 'Delta'));
    const [helican] = await groups(page, s);
    expect(await page.evaluate(() => window.__GE_TEST__?.selectedIds())).toEqual([helican?.id]);
    const panel = page.getByRole('complementary', { name: 'Details' });
    await expect(panel.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveCount(4);
  });

  test('re-grouping one asks first and moves it, and undo puts it back', async ({ page }) => {
    const s = await setUp(page.request);
    await openWith(page, s, ['Alpha', 'Beta', 'Gamma', 'Delta']);
    await groupAs(page, 'Helican');
    await expect.poll(() => membersOf(page, s, 'Helican')).toHaveLength(4);

    // Select Delta alone, then group it as Ophidian.
    await clickObject(page, s.ids.Delta ?? '');
    expect(await page.evaluate(() => window.__GE_TEST__?.selectedIds())).toEqual([s.ids.Delta]);
    await groupAs(page, 'Ophidian');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('Move 1 object from Helican to Ophidian?');
    await dialog.getByRole('button', { name: 'Move' }).click();
    await expect.poll(() => membersOf(page, s, 'Ophidian')).toEqual(idsOf(s, 'Delta'));
    expect(await membersOf(page, s, 'Helican')).toEqual(idsOf(s, 'Alpha', 'Beta', 'Gamma'));

    // One undo step: Ophidian is gone and Delta is back in Helican.
    await page.keyboard.press(`${await primary(page)}+z`);
    await expect.poll(() => membersOf(page, s, 'Ophidian')).toBeNull();
    expect(await membersOf(page, s, 'Helican')).toEqual(
      idsOf(s, 'Alpha', 'Beta', 'Gamma', 'Delta'),
    );
  });

  test('the context menu adds to a group, and Shift + G removes from it', async ({ page }) => {
    const s = await setUp(page.request);
    await openWith(page, s, ['Alpha', 'Beta']);
    await groupAs(page, 'Helican');
    await expect.poll(() => membersOf(page, s, 'Helican')).toHaveLength(2);

    await clickObject(page, s.ids.Epsilon ?? '', 'right');
    await page.getByRole('menuitem', { name: 'Add to group' }).click();
    await page.getByRole('menuitem', { name: 'Helican' }).click();
    await expect
      .poll(() => membersOf(page, s, 'Helican'))
      .toEqual(idsOf(s, 'Alpha', 'Beta', 'Epsilon'));

    // Once the view has the new member, the menu offers to remove it; Epsilon is still
    // selected, so Shift + G takes it out again.
    await clickObject(page, s.ids.Epsilon ?? '', 'right');
    await expect(
      page.getByRole('menuitem', { name: 'Remove from administrative group' }),
    ).toBeEnabled();
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${await primary(page)}+Shift+g`);
    await expect.poll(() => membersOf(page, s, 'Helican')).toEqual(idsOf(s, 'Alpha', 'Beta'));
  });

  test('the panel flags a membership as a spoiler, and deleting the group releases its members', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await openWith(page, s, ['Alpha', 'Beta']);
    await groupAs(page, 'Helican');
    const members = page.getByRole('list', { name: 'Members' });
    await expect(members.getByRole('listitem')).toHaveCount(2);

    await members.getByRole('switch', { name: "Beta's membership is a spoiler" }).click();
    await expect
      .poll(async () =>
        (await groups(page, s))[0]?.members.find((member) => member.objectId === s.ids.Beta),
      )
      .toMatchObject({ isSpoiler: true });

    // The new group is still selected: Delete asks, counting what goes with it.
    await page.locator('canvas').focus();
    await page.keyboard.press('Delete');
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading')).toHaveText('Delete “Helican”?');
    await expect(dialog).toContainText('2 group memberships');
    await dialog.getByRole('button', { name: 'Delete' }).click();
    await expect.poll(() => groups(page, s)).toEqual([]);
    const view = (await getJson(page.request, `/api/v1/maps/${s.mapId}/views/galaxy`)) as {
      data: { objects: unknown[] };
    };
    expect(view.data.objects).toHaveLength(5);
  });
});
