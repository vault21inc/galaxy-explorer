import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { waitForFirstFrame, waitForIdle } from './test-hooks.ts';

/**
 * Undo, redo and the History panel (M3-T6), each test on a fresh universe so its history is
 * its own.
 */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

async function freshUniverse(request: APIRequestContext) {
  const slug = `history-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('History test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const system = (name: string, x: number) =>
    post(`/api/v1/maps/${mapId}/objects`, { name: plain(name), baseType: 'system', x, y: 0, z: 0 });
  return { url: `/u/${slug}/main`, universeId, mapId, system };
}

interface Drawn {
  id: string;
  namePlain: string;
  position: number[];
}

async function objectsOf(request: APIRequestContext, mapId: string): Promise<Drawn[]> {
  const view = (await (
    await request.get(`/api/v1/maps/${mapId}/views/galaxy?includeDrafts=true`)
  ).json()) as { data: { objects: Drawn[] } };
  return view.data.objects;
}

async function nameOf(request: APIRequestContext, id: string) {
  return (
    (await (await request.get(`/api/v1/objects/${id}`)).json()) as { data: { namePlain: string } }
  ).data.namePlain;
}

/** Renames through the API, as another session or an API token would. */
async function renameElsewhere(request: APIRequestContext, id: string, name: string) {
  const { data } = (await (await request.get(`/api/v1/objects/${id}`)).json()) as {
    data: { version: number; namePlain: string };
  };
  const response = await request.patch(`/api/v1/objects/${id}`, {
    data: { version: data.version, name: plain(name) },
    headers: { 'X-GE-Batch-Description': `Rename ${data.namePlain} to ${name}` },
  });
  expect(response.ok()).toBe(true);
}

/** Cmd or Ctrl, as the app decided: the Chromium project runs with a Windows user agent. */
async function primary(page: Page) {
  return (await page.evaluate(() => window.__GE_TEST__?.platform())) === 'mac' ? 'Meta' : 'Control';
}

async function canvasPoint(page: Page, fx: number, fy: number) {
  const box = await page.locator('canvas').boundingBox();
  if (!box) throw new Error('The canvas has no size.');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

async function openHistory(page: Page) {
  await page
    .getByRole('toolbar', { name: 'Edit tools' })
    .getByRole('button', { name: 'History' })
    .click();
  return page.getByRole('complementary', { name: 'History' });
}

test.describe('undo, redo and history (M3-T6)', () => {
  test('create, move and rename, undo all three, then redo all three', async ({ page }) => {
    const s = await freshUniverse(page.request);
    await page.goto(s.url);
    await waitForFirstFrame(page);
    await page.keyboard.press('e');

    // Create: a system where the plane is clicked. Its name field takes focus; Esc leaves it.
    await page.getByRole('button', { name: /^Add/ }).click();
    await page.getByRole('menuitem', { name: 'System', exact: true }).click();
    const at = await canvasPoint(page, 0.4, 0.55);
    await page.mouse.move(at.x, at.y, { steps: 5 });
    await page.mouse.click(at.x, at.y);
    const name = page.getByLabel('Name', { exact: true });
    await expect(name).toBeFocused();
    await name.press('Escape');
    await expect
      .poll(async () => (await objectsOf(page.request, s.mapId)).map((object) => object.namePlain))
      .toEqual(['New system']);
    const [created] = await objectsOf(page.request, s.mapId);
    const id = created?.id ?? '';
    await waitForIdle(page);

    // Move: drag it 80 px to the right.
    const from = await page.evaluate((target) => window.__GE_TEST__?.screenPositionOf(target), id);
    if (!from) throw new Error('The new system is off screen.');
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + 80, from.y, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => (await objectsOf(page.request, s.mapId))[0]?.position)
      .not.toEqual(created?.position);
    const moved = (await objectsOf(page.request, s.mapId))[0]?.position;

    // Rename.
    await name.fill('Nova');
    await name.press('Enter');
    await expect.poll(() => nameOf(page.request, id)).toBe('Nova');

    // Undo three times: rename, move, create. Nothing is left.
    const key = await primary(page);
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();
    for (let step = 0; step < 3; step++) await page.keyboard.press(`${key}+z`);
    await expect.poll(async () => (await objectsOf(page.request, s.mapId)).length).toBe(0);
    await expect
      .poll(() => page.evaluate((target) => window.__GE_TEST__?.drawnObject(target), id))
      .toBeNull();
    await expect(page.getByRole('button', { name: 'Undo' })).toBeDisabled();

    // Redo three times: the same object, moved and renamed again.
    for (let step = 0; step < 3; step++) await page.keyboard.press(`${key}+Shift+z`);
    await expect
      .poll(async () => {
        const [object] = await objectsOf(page.request, s.mapId);
        return object && { id: object.id, name: object.namePlain, position: object.position };
      })
      .toEqual({ id, name: 'Nova', position: moved });
    await expect(page.getByRole('button', { name: 'Redo' })).toBeDisabled();
    await expect
      .poll(() => page.evaluate((target) => window.__GE_TEST__?.drawnObject(target)?.label, id))
      .toBe('Nova');
  });

  test('reverting an older batch from the History panel works', async ({ page }) => {
    const s = await freshUniverse(page.request);
    const a = await s.system('Alpha', 0);
    const b = await s.system('Beta', 5_000);
    // Two changes from somewhere else: the panel lists every session's.
    await renameElsewhere(page.request, a, 'Alpha Prime');
    await renameElsewhere(page.request, b, 'Beta Prime');

    await page.goto(s.url);
    await waitForFirstFrame(page);
    await page.keyboard.press('e');
    const panel = await openHistory(page);
    const changes = panel.getByRole('list', { name: 'Changes' }).getByRole('listitem');
    await expect(changes.first()).toContainText('Rename Beta to Beta Prime');
    await expect(changes.nth(1)).toContainText('Rename Alpha to Alpha Prime');

    await panel.getByRole('button', { name: 'Revert “Rename Alpha to Alpha Prime”' }).click();
    await expect.poll(() => nameOf(page.request, a)).toBe('Alpha');
    expect(await nameOf(page.request, b)).toBe('Beta Prime');
    await expect(changes.first()).toContainText('Revert: Rename Alpha to Alpha Prime');
    await expect(
      panel.getByRole('button', { name: 'Revert “Rename Alpha to Alpha Prime”' }),
    ).toBeDisabled();
    await expect
      .poll(() => page.evaluate((target) => window.__GE_TEST__?.drawnObject(target)?.label, a))
      .toBe('Alpha');

    // The panel's revert is an edit of this session: ⌘/Ctrl + Z undoes it.
    await page.keyboard.press(`${await primary(page)}+z`);
    await expect.poll(() => nameOf(page.request, a)).toBe('Alpha Prime');
  });

  test('a conflicting revert shows the conflict and changes nothing', async ({ page }) => {
    const s = await freshUniverse(page.request);
    const a = await s.system('Alpha', 0);
    await renameElsewhere(page.request, a, 'Alpha Prime');
    await renameElsewhere(page.request, a, 'Alpha Secundus');

    await page.goto(s.url);
    await waitForFirstFrame(page);
    await page.keyboard.press('e');
    const panel = await openHistory(page);
    await panel.getByRole('button', { name: 'Revert “Rename Alpha to Alpha Prime”' }).click();
    // The toast names what changed since.
    await expect(page.getByRole('alert')).toContainText('Alpha Secundus');
    expect(await nameOf(page.request, a)).toBe('Alpha Secundus');
    await expect(
      panel.getByRole('list', { name: 'Changes' }).getByRole('listitem').first(),
    ).toContainText('Rename Alpha Prime to Alpha Secundus');
  });
});
