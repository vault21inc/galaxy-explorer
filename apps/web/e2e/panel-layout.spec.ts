import { expect, test, type APIRequestContext } from '@playwright/test';
import { waitForFirstFrame } from './test-hooks.ts';

/**
 * The reading panel's layout (the owner's request after M7-T6): the name pinned at the top while
 * the rest scrolls, the picture under it, and a long description folded after about 265
 * characters with "More".
 */

const PNG = 'e2e/fixtures/nebula.png';
const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

const LONG = [
  'The **Cadian Gate** is an area of calm space leading into and out of the massive Warp rift called the Eye of Terror. It is the only predictably stable way out of that maelstrom of Warp energy.',
  'It is therefore a site of frequent raids by the forces of Chaos seeking to break through the Imperial defences in the region so that they can invade the larger Imperium of Man.',
  'Several Black Crusades have emerged from the Cadian Gate, including the most recent campaign, the 13th Black Crusade.',
  'The tendency of the forces of Chaos to turn on themselves has allowed the Imperial forces to stabilise the war zone.',
].join('\n\n');

async function setUp(request: APIRequestContext) {
  const slug = `panel-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data;
  };
  const universe = await post('/api/v1/universes', { slug, name: plain('Panel') });
  const map = await post(`/api/v1/universes/${universe.id}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const gate = await post(`/api/v1/maps/${map.id}/objects`, {
    name: plain('Cadian Gate'),
    baseType: 'system',
    description: { format: 'markdown', source: LONG, spoiler: false },
  });
  return { url: `/u/${slug}/main?select=${gate.id}` };
}

test('the name stays on top, the picture comes first, and a long description folds', async ({
  page,
}) => {
  const s = await setUp(page.request);
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.goto(s.url);
  await waitForFirstFrame(page);
  const panel = page.getByRole('complementary', { name: 'Details' });

  // A cover image, added in edit mode.
  await page.keyboard.press('e');
  await panel.getByRole('button', { name: 'Add image' }).click();
  await page
    .getByRole('dialog', { name: 'Add an image' })
    .getByLabel('Upload images')
    .setInputFiles(PNG);
  await expect(panel.getByRole('listitem', { name: 'Cover image' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();

  // The picture sits above the text.
  const figure = panel.getByRole('figure');
  const text = panel.getByText(/is an area of calm space/);
  await expect(figure).toBeVisible();
  const above = await figure.evaluate(
    (node, other) =>
      Boolean(node.compareDocumentPosition(other as Node) & Node.DOCUMENT_POSITION_FOLLOWING),
    await text.elementHandle(),
  );
  expect(above).toBe(true);

  // The description shows its start; More shows the rest, and Less folds it again.
  const more = panel.getByRole('button', { name: 'More' });
  await expect(more).toBeVisible();
  await page.screenshot({ path: test.info().outputPath('panel-folded.png') });
  await expect(panel).not.toContainText('turn on themselves');
  await more.click();
  await expect(panel).toContainText('turn on themselves');
  await expect(panel.getByRole('button', { name: 'Less' })).toBeVisible();

  // Scrolled to the bottom, the name is still at the top of the panel.
  const heading = panel.getByRole('heading', { name: 'Cadian Gate' });
  const before = await heading.boundingBox();
  await panel.locator('.overflow-y-auto').evaluate((node) => {
    node.scrollTop = node.scrollHeight;
  });
  await expect.poll(async () => (await heading.boundingBox())?.y).toBe(before?.y);
  await page.screenshot({ path: test.info().outputPath('panel.png') });
  await panel.getByRole('button', { name: 'Less' }).click();
  await expect(panel).not.toContainText('turn on themselves');
});
