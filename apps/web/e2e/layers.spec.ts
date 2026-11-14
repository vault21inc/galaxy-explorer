import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** The Layers popover (M4-T5): hiding layers and group types, and the legend. */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function setUp(request: APIRequestContext) {
  const slug = `layers-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Layers test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const subType = await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Sub-sector',
    layer: 'Administrative',
    defaultColor: '#c8a24a',
  });
  const realmType = await post(`/api/v1/universes/${universeId}/group-types`, {
    name: 'Realm',
    layer: 'Political',
    defaultColor: '#d9534f',
  });
  const ids: Record<string, string> = {};
  const places: [string, number, number][] = [
    ['Alpha', -14_000, -3_000],
    ['Beta', -9_000, 2_000],
    ['Gamma', 9_000, -2_000],
    ['Delta', 14_000, 3_000],
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
  const group = async (name: string, groupTypeId: string, color: string, members: string[]) => {
    const id = await post(`/api/v1/maps/${mapId}/groups`, {
      name: plain(name),
      groupTypeId,
      outlineColor: color,
    });
    await post(`/api/v1/groups/${id}/members`, {
      members: members.map((member) => ({ objectId: ids[member] ?? '' })),
    });
    return id;
  };
  ids.Helican = await group('Helican', subType, '#c8a24a', ['Alpha', 'Beta']);
  ids.Tau = await group('Tau Empire', realmType, '#d9534f', ['Gamma', 'Delta']);
  return { url: `/u/${slug}/main`, ids };
}

const outline = (page: Page, id: string) =>
  page.evaluate((target) => window.__GE_TEST__?.groupOutline(target) ?? null, id);
const labels = (page: Page) =>
  page.evaluate(() => (window.__GE_TEST__?.visibleLabels() ?? []).map((label) => label.text));

async function open(page: Page, url: string) {
  await page.goto(url);
  await waitForFirstFrame(page);
  await waitForIdle(page);
}

const popover = (page: Page) => page.getByRole('dialog');

test.describe('layers (M4-T5)', () => {
  test('hiding the Political layer hides its outlines and labels, and a reload keeps it', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    await page.keyboard.press('l'); // the groups label mode
    await expect
      .poll(() => labels(page))
      .toEqual(expect.arrayContaining(['Helican', 'Tau Empire']));

    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    const legend = popover(page).getByRole('list', { name: 'Legend' });
    await expect(legend.getByRole('listitem')).toHaveText(['Helican', 'Tau Empire']);
    await popover(page).getByRole('checkbox', { name: 'Political' }).uncheck();

    await expect.poll(() => outline(page, s.ids.Tau ?? '')).toBeNull();
    expect(await outline(page, s.ids.Helican ?? '')).not.toBeNull();
    await expect.poll(() => labels(page)).not.toContain('Tau Empire');
    expect(await labels(page)).toContain('Helican');
    await expect(legend.getByRole('listitem')).toHaveText(['Helican']);
    // A hidden layer's types can't be toggled on their own.
    await expect(popover(page).getByRole('checkbox', { name: 'Realm' })).toBeDisabled();

    await open(page, s.url);
    await expect.poll(() => outline(page, s.ids.Helican ?? '')).not.toBeNull();
    expect(await outline(page, s.ids.Tau ?? '')).toBeNull();
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await expect(popover(page).getByRole('checkbox', { name: 'Political' })).not.toBeChecked();
  });

  test('a group type hides on its own, and edit mode picks the grouping layer', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await open(page, s.url);
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await popover(page).getByRole('checkbox', { name: 'Sub-sector' }).uncheck();
    await expect.poll(() => outline(page, s.ids.Helican ?? '')).toBeNull();
    expect(await outline(page, s.ids.Tau ?? '')).not.toBeNull();
    await popover(page).getByRole('checkbox', { name: 'Sub-sector' }).check();
    await expect.poll(() => outline(page, s.ids.Helican ?? '')).not.toBeNull();
    await page.keyboard.press('Escape');
    // Keys pressed inside the popover are its own; wait until it has closed.
    await expect(popover(page)).toHaveCount(0);

    // In edit mode the popover chooses the layer "Remove from group" works in.
    await page.keyboard.press('e');
    await page.getByRole('button', { name: 'Layers', exact: true }).click();
    await popover(page)
      .getByRole('radio', { name: 'Grouping' })
      .nth(1) // the second layer, Political
      .check();
    await page.keyboard.press('Escape');
    await expect(popover(page)).toHaveCount(0);
    const at = await page.evaluate(
      (id) => window.__GE_TEST__?.screenPositionOf(id),
      s.ids.Gamma ?? '',
    );
    if (!at) throw new Error('Gamma is off screen.');
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await expect(page.getByRole('menuitem', { name: 'Remove from political group' })).toBeEnabled();
  });
});
