import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Characters and the people involved in events (M6-T6). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A universe with a system, an explorable planet in it, and an event on that planet. */
async function setUp(request: APIRequestContext) {
  const slug = `people-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('People') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Calyx'),
    baseType: 'system',
    explorable: true,
    x: 300,
  });
  const planet = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Calyx I'),
    baseType: 'planet',
    parentId: system.id,
    explorable: true,
    x: 5,
  });
  const event = await post(`/api/v1/maps/${map.id}/events`, {
    name: plain('Siege of Calyx'),
    dateText: '240.M41',
    dateSort: 240.41,
  });
  const located = await request.put(`/api/v1/entities/${event.id}/location`, {
    data: { mode: 'surface', objectId: planet.id, latDeg: 0, lonDeg: 0 },
  });
  expect(located.ok(), await located.text()).toBe(true);
  return {
    url: `/u/${slug}/main`,
    universeId: universe.id,
    planetId: planet.id,
    eventId: event.id,
  };
}

interface Relation {
  relationType: string;
  role: { source: string } | null;
  other: { id: string; namePlain: string; kind: string };
}

async function relationsOf(request: APIRequestContext, id: string): Promise<Relation[]> {
  return ((await getJson(request, `/api/v1/entities/${id}/relations`)) as { data: Relation[] })
    .data;
}

async function settle(page: Page, level: string) {
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.level()?.level), { timeout: 20_000 })
    .toBe(level);
  await expect
    .poll(() => page.evaluate(() => window.__GE_TEST__?.transitioning() ?? true), {
      timeout: 20_000,
    })
    .toBe(false);
  await waitForIdle(page, 300);
}

test.describe('people involved in events (M6-T6)', () => {
  test('adding two people with roles; a person lists the event, which leads to its pin', async ({
    page,
  }) => {
    // Three changes of view, each waiting to settle: slow with CI's software rendering.
    test.slow();
    const s = await setUp(page.request);
    await page.goto(`${s.url}/view/${s.planetId}?select=${s.eventId}`);
    await waitForFirstFrame(page);
    await settle(page, 'orbit');
    await page.keyboard.press('e');
    const panel = page.getByRole('complementary', { name: 'Details' });
    const people = panel.getByRole('region', { name: 'People involved' });
    await expect(people).toBeVisible();

    // Two people, both new: the picker offers to create each, then each gets a role.
    const picker = people.getByRole('combobox', { name: 'Add to People involved' });
    for (const [name, role] of [
      ['Gregor Eisenhorn', 'Inquisitor leading the hunt'],
      ['Gideon Ravenor', 'His interrogator'],
    ] as const) {
      await picker.fill(name);
      await page.getByRole('option', { name: `Create “${name}”` }).click();
      const roleField = people.getByRole('textbox', { name: `Role of ${name}` });
      await expect(roleField).toBeVisible();
      await roleField.fill(role);
      await roleField.press('Enter');
      await expect
        .poll(async () =>
          (await relationsOf(page.request, s.eventId)).map((r) => [
            r.other.namePlain,
            r.role?.source,
          ]),
        )
        .toContainEqual([name, role]);
    }
    const relations = await relationsOf(page.request, s.eventId);
    expect(relations.map((relation) => relation.relationType)).toEqual([
      'participant',
      'participant',
    ]);

    // Reading: each with their role. Opening one shows the event among theirs.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    await expect(people).toContainText('Inquisitor leading the hunt');
    await people.getByRole('button', { name: 'Gregor Eisenhorn' }).click();
    const involved = panel.getByRole('region', { name: 'Involved in' });
    await expect(involved).toContainText('Siege of Calyx');
    await expect(involved).toContainText('240.M41');
    const eisenhorn =
      relations.find((relation) => relation.other.namePlain === 'Gregor Eisenhorn')?.other.id ?? '';

    // From the galaxy view, with the person selected (the outliner's People), the event's
    // link goes through the views to its pin, and selects it.
    await page.goto(`${s.url}?select=${eisenhorn}`);
    await waitForFirstFrame(page);
    await settle(page, 'galaxy');
    await page.getByRole('button', { name: 'List' }).click();
    await expect(page.getByRole('treeitem', { name: /Gregor Eisenhorn/ })).toBeVisible();
    await involved.getByRole('button', { name: 'Siege of Calyx' }).click();
    await settle(page, 'orbit');
    expect(await page.evaluate(() => window.__GE_TEST__?.level()?.subjectId)).toBe(s.planetId);
    await expect
      .poll(() => page.evaluate(() => window.__GE_TEST__?.selectedIds()))
      .toEqual([s.eventId]);
    await expect
      .poll(() => page.evaluate((id) => window.__GE_TEST__?.pin(id), s.eventId))
      .not.toBeNull();
    await expect(panel.getByRole('heading', { name: 'Siege of Calyx' })).toBeVisible();
  });
});
