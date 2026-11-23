import { expect, test, type APIRequestContext } from './test.ts';
import { getJson } from './api.ts';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/** Editing an entry's Links and "Related to" in the details panel (ux.md §5). */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/** A universe with a route on its map and a person, who aren't related yet. */
async function setUp(request: APIRequestContext) {
  const slug = `links-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('Links') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  // A route is drawn, and so selectable, once it passes through two objects.
  const systems = [];
  for (const [name, x] of [
    ['Flint', -5_000],
    ['Lenk', 5_000],
  ] as const) {
    systems.push(
      await post(`/api/v1/maps/${map.id}/objects`, { name: plain(name), baseType: 'system', x }),
    );
  }
  const route = await post(`/api/v1/maps/${map.id}/routes`, { name: plain('Flint Run') });
  const waypoints = await request.put(`/api/v1/routes/${route.id}/waypoints`, {
    data: { objectIds: systems.map((system) => system.id) },
  });
  expect(waypoints.ok(), await waypoints.text()).toBe(true);
  const person = await post(`/api/v1/universes/${universe.id}/characters`, {
    name: plain('Gregor Eisenhorn'),
  });
  return { url: `/u/${slug}/main`, routeId: route.id, personId: person.id };
}

interface Link {
  url: string;
  label: string | null;
  isSpoiler: boolean;
}

const linksOf = async (request: APIRequestContext, id: string) =>
  ((await getJson(request, `/api/v1/entities/${id}/links`)) as { data: Link[] }).data;

interface Relation {
  relationType: string;
  role: { source: string } | null;
  other: { id: string };
}

const relationsOf = async (request: APIRequestContext, id: string) =>
  ((await getJson(request, `/api/v1/entities/${id}/relations`)) as { data: Relation[] }).data;

test.describe('links and Related to in the details panel', () => {
  test('a route gets a link, edited and removed, and is related to a person', async ({ page }) => {
    const s = await setUp(page.request);
    await page.goto(`${s.url}?select=${s.routeId}`);
    await waitForFirstFrame(page);
    await waitForIdle(page);
    const panel = page.getByRole('complementary', { name: 'Details' });
    // Nothing yet: neither section shows while reading.
    await expect(panel.getByRole('region', { name: 'Links' })).toBeHidden();
    await page.keyboard.press('e');

    // Links: an address the API would refuse can't be added; a web address can.
    const links = panel.getByRole('region', { name: 'Links' });
    const address = links.getByRole('textbox', { name: 'New link address' });
    await address.fill('lexicanum');
    await expect(links.getByRole('button', { name: 'Add link' })).toBeDisabled();
    await address.fill('https://wh40k.lexicanum.com/wiki/Eisenhorn');
    await links.getByRole('textbox', { name: 'New link label' }).fill('Lexicanum');
    await links.getByRole('button', { name: 'Add link' }).click();
    await expect
      .poll(() => linksOf(page.request, s.routeId))
      .toEqual([
        expect.objectContaining({
          url: 'https://wh40k.lexicanum.com/wiki/Eisenhorn',
          label: 'Lexicanum',
          isSpoiler: false,
        }),
      ]);
    await expect(address).toHaveValue('');

    // Its label, then its spoiler switch.
    const label = links.getByRole('textbox', { name: 'Label of Lexicanum' });
    await label.fill('Lexicanum entry');
    await label.press('Enter');
    await expect
      .poll(async () => (await linksOf(page.request, s.routeId))[0]?.label)
      .toBe('Lexicanum entry');
    await links.getByRole('switch', { name: 'Lexicanum entry is a spoiler' }).click();
    await expect
      .poll(async () => (await linksOf(page.request, s.routeId))[0]?.isSpoiler)
      .toBe(true);

    // Related to: the picker searches every kind, so the person (universe-wide) is offered.
    const related = panel.getByRole('region', { name: 'Related to' });
    await related.getByRole('combobox', { name: 'Add to Related to' }).fill('Eisenhorn');
    await page.getByRole('option', { name: /Gregor Eisenhorn/ }).click();
    const role = related.getByRole('textbox', { name: 'Role of Gregor Eisenhorn' });
    await expect(role).toBeVisible();
    await role.fill('Travelled it');
    await role.press('Enter');
    await expect
      .poll(() => relationsOf(page.request, s.routeId))
      .toEqual([
        expect.objectContaining({
          relationType: 'related',
          role: expect.objectContaining({ source: 'Travelled it' }),
          other: expect.objectContaining({ id: s.personId }),
        }),
      ]);
    // Once related, the person isn't offered again.
    await related.getByRole('combobox', { name: 'Add to Related to' }).fill('Eisenhorn');
    await expect(page.getByRole('option', { name: /Gregor Eisenhorn/ })).toBeHidden();
    await related.getByRole('combobox', { name: 'Add to Related to' }).fill('');

    // The link goes; reading shows the person, both ways round.
    await links.getByRole('button', { name: 'Remove Lexicanum entry' }).click();
    await expect.poll(() => linksOf(page.request, s.routeId)).toEqual([]);
    await page.getByRole('button', { name: 'Edit', exact: true }).click();
    const relations = panel.getByRole('region', { name: 'Relations' });
    await expect(relations).toContainText('Gregor Eisenhorn');
    await expect
      .poll(async () => (await relationsOf(page.request, s.personId)).map((r) => r.other.id))
      .toEqual([s.routeId]);
  });
});
