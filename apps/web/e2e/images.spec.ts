import { readFile } from 'node:fs/promises';
import { expect, test, type APIRequestContext, type Page } from './test.ts';
import { waitForFirstFrame } from './test-hooks.ts';
import { getJson } from './api.ts';

/** Images (M3-T7): upload one to an object, credit it, and hide it as a spoiler. */

const plain = (source: string) => ({ format: 'plain', source, spoiler: false });

/**
 * A small real PNG, so the upload goes through the whole pipeline. Paths are read from the
 * web package, where Playwright runs.
 */
const PNG = 'e2e/fixtures/nebula.png';

async function setUp(request: APIRequestContext) {
  const slug = `images-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const post = async (url: string, data: object) => {
    const response = await request.post(url, { data });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { id: string } }).data.id;
  };
  const universeId = await post('/api/v1/universes', { slug, name: plain('Images test') });
  const mapId = await post(`/api/v1/universes/${universeId}/maps`, {
    slug: 'main',
    name: plain('Main'),
  });
  const id = await post(`/api/v1/maps/${mapId}/objects`, {
    name: plain('Corvid'),
    baseType: 'system',
    x: 0,
    y: 0,
    z: 0,
  });
  return { url: `/u/${slug}/main?select=${id}`, id };
}

async function imagesOf(request: APIRequestContext, id: string) {
  return (
    (await getJson(request, `/api/v1/objects/${id}?include=images`)) as {
      data: { images: { isSpoiler: boolean; role: string; asset: { credit: string | null } }[] };
    }
  ).data.images;
}

const toggleEditMode = (page: Page) =>
  page.getByRole('button', { name: 'Edit', exact: true }).click();

test.describe('images (M3-T7)', () => {
  test('an added image shows with its credit; as a spoiler it is blurred in view mode', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    await waitForFirstFrame(page);
    await page.keyboard.press('e');
    const panel = page.getByRole('complementary', { name: 'Details' });
    const section = panel.getByRole('region', { name: 'Images' });

    // Upload through the picker: the first image becomes the cover.
    await section.getByRole('button', { name: 'Add image' }).click();
    const picker = page.getByRole('dialog', { name: 'Add an image' });
    await picker.getByLabel('Upload images').setInputFiles(PNG);
    await expect(picker).toBeHidden();
    const row = section.getByRole('listitem', { name: 'Cover image' });
    await expect(row).toBeVisible();

    // Credit it.
    const credit = row.getByLabel('Credit');
    await credit.fill('Art: Ana Vale');
    await credit.press('Enter');
    await expect
      .poll(async () => (await imagesOf(page.request, s.id))[0]?.asset.credit)
      .toBe('Art: Ana Vale');

    // In view mode: the image, with its credit under it.
    await toggleEditMode(page);
    const figure = panel.getByRole('figure');
    // Without alt text the picture is decorative to screen readers, so it has no img role.
    await expect(figure.locator('img')).toBeVisible();
    await expect(figure).toContainText('Art: Ana Vale');
    await expect(figure.locator('[data-spoiler-hidden]')).toHaveCount(0);

    // Flag it as a spoiler; in view mode it's blurred behind a chip, and a click reveals it.
    await toggleEditMode(page);
    await row.getByRole('switch', { name: 'Image is a spoiler' }).click();
    await expect.poll(async () => (await imagesOf(page.request, s.id))[0]?.isSpoiler).toBe(true);
    await toggleEditMode(page);
    await expect(figure.locator('img[data-spoiler-hidden]')).toBeVisible();
    await expect(figure).not.toContainText('Art: Ana Vale');
    await figure
      .getByRole('button', { name: 'Potential spoiler image, hidden. Reveal it' })
      .click();
    await expect(figure.locator('[data-spoiler-hidden]')).toHaveCount(0);
    await expect(figure).toContainText('Art: Ana Vale');
  });

  test('the library offers an uploaded image again, and not twice to the same object', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    await page.goto(s.url);
    await waitForFirstFrame(page);
    await page.keyboard.press('e');
    const section = page
      .getByRole('complementary', { name: 'Details' })
      .getByRole('region', { name: 'Images' });
    await section.getByRole('button', { name: 'Add image' }).click();
    const picker = page.getByRole('dialog', { name: 'Add an image' });
    await picker.getByLabel('Upload images').setInputFiles(PNG);
    await expect(picker).toBeHidden();

    await section.getByRole('button', { name: 'Add image' }).click();
    await expect(
      picker.getByRole('list', { name: 'Image library' }).getByRole('button'),
    ).toHaveAccessibleName('nebula.png, already added');
    await expect(picker.getByRole('button', { name: 'nebula.png, already added' })).toBeDisabled();
  });

  test('an animated cover plays, pauses, and starts still for reduced motion (D-54)', async ({
    page,
  }) => {
    const s = await setUp(page.request);
    const universe = (await getJson(page.request, `/api/v1/objects/${s.id}`)) as {
      data: { universeId: string };
    };
    // Uploaded through the API, then made the cover: the picker is covered above.
    const uploaded = await page.request.post(
      `/api/v1/universes/${universe.data.universeId}/assets`,
      {
        multipart: {
          file: { name: 'blink.gif', mimeType: 'image/gif', buffer: await gifFixture() },
        },
      },
    );
    expect(uploaded.ok(), await uploaded.text()).toBe(true);
    const asset = ((await uploaded.json()) as { data: { id: string } }).data;
    const attached = await page.request.post(`/api/v1/entities/${s.id}/images`, {
      data: { assetId: asset.id, role: 'cover' },
    });
    expect(attached.ok(), await attached.text()).toBe(true);

    await page.goto(s.url);
    await waitForFirstFrame(page);
    const figure = page.getByRole('complementary', { name: 'Details' }).getByRole('figure');
    const picture = figure.locator('img');
    await expect(picture).toHaveAttribute('src', /\/animated\.webp$/);
    await figure.getByRole('button', { name: 'Pause the animation' }).click();
    await expect(picture).toHaveAttribute('src', /\/display\.webp$/);
    await expect(picture).toHaveAttribute('data-animation', 'paused');

    // Asking the system for reduced motion: the still, until the reader presses play.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await waitForFirstFrame(page);
    await expect(picture).toHaveAttribute('src', /\/display\.webp$/);
    await figure.getByRole('button', { name: 'Play the animation' }).click();
    await expect(picture).toHaveAttribute('src', /\/animated\.webp$/);
  });
});

/** A 40 × 30 GIF of three frames, red, green and blue, read from the web package. */
const gifFixture = () => readFile('e2e/fixtures/blink.gif');
