import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Selecting groups, their panel and the outliner tree (M4-T4). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function setUp(request: APIRequestContext) {
  const slug = `group-select-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Group selection') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const sectorType = await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Sector',
    layer: 'Administrative',
    defaultColor: '#4fd1ff',
  });
  const subType = await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Sub-sector',
    layer: 'Administrative',
    parentGroupTypeId: sectorType,
    defaultColor: '#c8a24a',
  });
  const ids: Record<string, string> = {};
  const places: [string, number, number][] = [
    ['Alpha', -14_000, -3_000],
    ['Beta', -9_000, 2_000],
    ['Gamma', 9_000, -2_000],
    ['Delta', 14_000, 3_000],
    ['Epsilon', 0, 14_000],
  ];
  for (const [name, x, z] of places) {
    ids[name] = await post(`/api/v1/maps/${mapId}/objects`, {
      name: plain(name),
      baseType: 'system',
      x,
      y: 0,
      z,
    });
  }
  const group = async (
    name: string,
    groupTypeId: string,
    parentGroupId: string | null,
    members: string[],
  ) => {
    const id = await post(`/api/v1/maps/${mapId}/groups`, {
      name: plain(name),
      groupTypeId,
      parentGroupId,
      outlineColor: '#c8a24a',
    });
    if (members.length > 0) {
      await post(`/api/v1/groups/${id}/members`, {
        members: members.map((member) => ({ objectId: ids[member] ?? '' })),
      });
    }
    return id;
  };
  ids.Scarus = await group('Scarus', sectorType, null, []);
  ids.Helican = await group('Helican', subType, ids.Scarus, ['Alpha', 'Beta']);
  ids.Ophidian = await group('Ophidian', subType, ids.Scarus, ['Gamma', 'Delta']);
  return { url: `/u/${slug}/main`, ids };
}

const selectedIds = (page: Page) => page.evaluate(() => window.__GE_TEST__?.selectedIds() ?? []);
const ringedIds = (page: Page) =>
  page.evaluate(() => [...(window.__GE_TEST__?.ringedIds() ?? [])].sort());

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page);
}

const treeRow = (page: Page, name: string) =>
  page
    .getByRole('tree', { name: 'Objects in this view' })
    .getByRole('treeitem', { name: new RegExp(`^${name}\\b`) });

test.describe('selecting groups (M4-T4)', () => {
  test('clicking a label selects the group, the panel lists its members, the outliner nests', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    await page.keyboard.press('l'); // the groups label mode
    const label = page
      .getByTestId('label-layer')
      .locator(`[data-label-id="${s.ids.Helican ?? ''}"]`);
    await label.click();
    await expect.poll(() => selectedIds(page)).toEqual([s.ids.Helican]);

    // The panel: the group's members, and the sector it's inside.
    const panel = page.getByRole('complementary', { name: 'Details' });
    await expect(panel.getByRole('list', { name: 'Members' }).getByRole('listitem')).toHaveText([
      'Alpha',
      'Beta',
    ]);
    await expect(panel.getByRole('button', { name: 'Scarus' })).toBeVisible();
    // The members get rings.
    await expect.poll(() => ringedIds(page)).toEqual([s.ids.Alpha, s.ids.Beta].sort());

    // The outliner opens to the selection: Administrative › Sector › Scarus › Helican.
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await expect(treeRow(page, 'Administrative')).toHaveAttribute('aria-level', '1');
    await expect(treeRow(page, 'Sector')).toHaveAttribute('aria-level', '2');
    await expect(treeRow(page, 'Scarus')).toHaveAttribute('aria-expanded', 'true');
    await expect(treeRow(page, 'Helican')).toHaveAttribute('aria-level', '4');
    await expect(treeRow(page, 'Helican')).toHaveAttribute('aria-selected', 'true');
    // Epsilon is in no group: after the layers, at the top level.
    await expect(treeRow(page, 'Epsilon')).toHaveAttribute('aria-level', '1');
  });

  test('the outliner and the panel walk the nesting', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    await page.getByRole('button', { name: 'List', exact: true }).click();
    await treeRow(page, 'Scarus').click();
    expect(await selectedIds(page)).toEqual([s.ids.Scarus]);
    // A sector rings every member of its sub-sectors.
    await expect.poll(async () => (await ringedIds(page)).length).toBe(4);

    const panel = page.getByRole('complementary', { name: 'Details' });
    const inside = panel.getByRole('list', { name: 'Groups inside' });
    await expect(inside.getByRole('listitem')).toHaveText(['Helican', 'Ophidian']);
    await inside.getByRole('button', { name: 'Ophidian' }).click();
    expect(await selectedIds(page)).toEqual([s.ids.Ophidian]);

    // Keys: Right opens a group and moves into it, Left goes back up.
    await treeRow(page, 'Scarus').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(treeRow(page, 'Scarus')).toHaveAttribute('aria-expanded', 'false');
    await page.keyboard.press('ArrowRight');
    await expect(treeRow(page, 'Scarus')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(treeRow(page, 'Helican')).toBeFocused();
  });

  test('in edit mode, the form moves a group to another parent', async ({ page }) => {
    const s = await setUp(page.request);
    await open(page, `${s.url}?select=${s.ids.Ophidian ?? ''}`);
    await page.keyboard.press('e');
    const panel = page.getByRole('complementary', { name: 'Details' });
    const parent = panel.getByLabel('Parent group');
    await expect(parent).toHaveValue(s.ids.Scarus ?? '');
    await parent.selectOption({ label: 'None' });
    await expect
      .poll(async () => {
        const group = (await getJson(page.request, `/api/v1/groups/${s.ids.Ophidian ?? ''}`)) as {
          data: { parentGroupId: string | null };
        };
        return group.data.parentGroupId;
      })
      .toBeNull();
  });
});
