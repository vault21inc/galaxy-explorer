import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

/**
 * Turns an upload into the files we store (architecture.md §8):
 * 1. sniff the real type from the bytes, never the file name or the browser's claim;
 * 2. decode with sharp, turn it upright by its EXIF orientation, and re-encode as WebP, which
 *    leaves EXIF, GPS positions and anything else embedded behind;
 * 3. make the variants: `thumb` (at most 256 px) and `display` (at most 1,600 px), never larger
 *    than the original; and for an image about twice as wide as tall, a map of a globe,
 *    `texture`: exactly 2:1 and a power of two wide, at most 2,048 px (M6-T2). GPUs build
 *    mipmaps of power-of-two textures best, and the planet shaders read the exact 2:1 shape.
 * 4. for an animated GIF or WebP, also `animated`: every frame, as an animated WebP, at most
 *    ANIMATED_MAX_PX. The other variants stay stills of the first frame, so everything that
 *    can't or shouldn't move (thumbnails, textures on the GPU, link previews, readers who ask
 *    for reduced motion) uses them unchanged; only a displayed image plays (D-54).
 */

/** What we accept. */
export const ACCEPTED_TYPES: ReadonlySet<string> = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'image/gif',
]);

/** The longest side of each variant, in pixels. */
export const VARIANT_SIZES = { thumb: 256, display: 1_600 } as const;
export type VariantName = keyof typeof VARIANT_SIZES | 'texture';

/** The widest `texture` variant, in pixels. */
export const TEXTURE_MAX_WIDTH_PX = 2_048;
/** How far from 2:1 an image may be and still count as a globe map: ±5 %. */
const TEXTURE_ASPECT_TOLERANCE = 0.05;

const WEBP_QUALITY = 82;

/**
 * The longest side of the `animated` variant, in pixels. Smaller than `display`: every frame is
 * stored, so the file grows with the frame count, and most GIFs are 500 px or less anyway.
 */
export const ANIMATED_MAX_PX = 800;
/** The most frames an animation may have: about 30 seconds at 10 frames a second. */
export const MAX_ANIMATION_FRAMES = 300;
/**
 * The most pixels all of an animation's frames may have together. sharp decodes every frame
 * to resize it, so this bounds the memory and time an upload takes, as MAX_INPUT_PIXELS does
 * for one frame: 100 million is about 400 MB decoded, such as 300 frames of 640 × 520.
 */
export const MAX_ANIMATION_PIXELS = 100_000_000;

/**
 * The most pixels an upload may have (M8-T3): 16,384 × 8,192, the largest globe map worth
 * reading. A file's header states its size, and a small file can claim a huge one (a
 * "decompression bomb"): sharp refuses past this before decoding a pixel. Decoded, an image
 * this size takes about 512 MB.
 */
export const MAX_INPUT_PIXELS = 16_384 * 8_192;

/** The upload isn't an image we take. */
export class UnsupportedImage extends Error {
  override readonly name = 'UnsupportedImage';
}

export interface ProcessedImage {
  sha256: string;
  /** Of the original, upright. */
  width: number;
  height: number;
  variants: Record<'thumb' | 'display', ImageVariant> & {
    texture?: ImageVariant;
    animated?: ImageVariant;
  };
}

export interface ImageVariant {
  data: Buffer;
  width: number;
  height: number;
}

/**
 * The `texture` variant's width for an image, or null when it isn't about 2:1: the largest
 * power of two up to the image's width, at most TEXTURE_MAX_WIDTH_PX. Small maps are enlarged
 * to at least 256 px wide.
 */
export function textureWidthFor(width: number, height: number): number | null {
  if (Math.abs(width / height / 2 - 1) > TEXTURE_ASPECT_TOLERANCE) return null;
  const powerOfTwo = 2 ** Math.floor(Math.log2(width));
  return Math.min(TEXTURE_MAX_WIDTH_PX, Math.max(256, powerOfTwo));
}

/** The SHA-256 of the original bytes, which identifies duplicates. */
export function sha256Of(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export async function processImage(data: Buffer): Promise<ProcessedImage> {
  const type = await fileTypeFromBuffer(data);
  if (!type || !ACCEPTED_TYPES.has(type.mime)) {
    throw new UnsupportedImage(
      `That file is ${type ? `a ${type.mime} file` : 'not an image we recognise'}. Upload a PNG, JPEG, WebP, AVIF or GIF image.`,
    );
  }
  // `.rotate()` without an angle applies the EXIF orientation, so photos stand upright once
  // the metadata is gone. Read this way, sharp sees only the first frame of a GIF or animated
  // WebP: the still that every variant but `animated` is made from.
  const upright = sharp(data, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS }).rotate();
  let width: number;
  let height: number;
  let frames: number;
  try {
    // The header alone gives the size; `autoOrient` is it after turning upright. Read as a
    // still, an animation's size is one frame's, and `pages` counts its frames.
    const metadata = await upright.metadata();
    ({ width, height } = metadata.autoOrient);
    frames = metadata.pages ?? 1;
  } catch (error) {
    if (error instanceof Error && error.message.includes('pixel limit')) {
      throw new UnsupportedImage(
        `That image has more than ${String(Math.round(MAX_INPUT_PIXELS / 1e6))} million pixels (16,384 × 8,192). Make it smaller and upload it again.`,
      );
    }
    throw new UnsupportedImage('That image is damaged or incomplete, so it can’t be read.');
  }

  const variant = async (maxPx: number) => {
    const { data: out, info } = await upright
      .clone()
      .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data: out, width: info.width, height: info.height };
  };
  if (frames > MAX_ANIMATION_FRAMES || width * height * frames > MAX_ANIMATION_PIXELS) {
    throw new UnsupportedImage(
      `That animation is too long to keep: ${String(frames)} frames of ${String(width)} × ${String(height)}. Upload one with at most ${String(MAX_ANIMATION_FRAMES)} frames, or a smaller one.`,
    );
  }
  const animated = async (): Promise<ImageVariant> => {
    // `animated: true` reads every frame, stacked one above the other; sharp resizes each one
    // and keeps their timings and loop count. `.rotate()` is left out: GIFs have no EXIF, and
    // an animated WebP's orientation, if any, would turn the whole stack, not each frame.
    const { data: out, info } = await sharp(data, {
      animated: true,
      failOn: 'error',
      limitInputPixels: MAX_ANIMATION_PIXELS,
    })
      .resize({
        width: ANIMATED_MAX_PX,
        height: ANIMATED_MAX_PX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    // `height` is the whole stack's; one frame is `pageHeight`.
    return { data: out, width: info.width, height: info.pageHeight ?? info.height };
  };
  const textureWidth = textureWidthFor(width, height);
  const texture = async (widthPx: number): Promise<ImageVariant> => {
    // `fill` stretches the last few percent to exactly 2:1.
    const { data: out, info } = await upright
      .clone()
      .resize({ width: widthPx, height: widthPx / 2, fit: 'fill' })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { data: out, width: info.width, height: info.height };
  };
  let thumb: ImageVariant;
  let display: ImageVariant;
  let surface: ImageVariant | null;
  let moving: ImageVariant | null;
  try {
    [thumb, display, surface, moving] = await Promise.all([
      variant(VARIANT_SIZES.thumb),
      variant(VARIANT_SIZES.display),
      textureWidth === null ? null : texture(textureWidth),
      frames > 1 ? animated() : null,
    ]);
  } catch {
    // The header was fine but the pixels aren't.
    throw new UnsupportedImage('That image is damaged or incomplete, so it can’t be read.');
  }
  return {
    sha256: sha256Of(data),
    width,
    height,
    variants: {
      thumb,
      display,
      ...(surface ? { texture: surface } : {}),
      ...(moving ? { animated: moving } : {}),
    },
  };
}

/**
 * Whether these bytes are an animation (more than one frame), read from the header alone: for
 * an upload that matches a still stored before animations were kept (D-54).
 */
export async function isAnimation(data: Buffer): Promise<boolean> {
  try {
    return ((await sharp(data).metadata()).pages ?? 1) > 1;
  } catch {
    return false;
  }
}
