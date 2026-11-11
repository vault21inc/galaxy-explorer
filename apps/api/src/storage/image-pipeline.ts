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
 */

/** What we accept. GIFs keep only their first frame. */
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

/** The upload isn't an image we take. */
export class UnsupportedImage extends Error {
  override readonly name = 'UnsupportedImage';
}

export interface ProcessedImage {
  sha256: string;
  /** Of the original, upright. */
  width: number;
  height: number;
  variants: Record<'thumb' | 'display', ImageVariant> & { texture?: ImageVariant };
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
  // the metadata is gone. sharp reads only the first frame of a GIF or animated WebP.
  const upright = sharp(data, { failOn: 'error' }).rotate();
  let width: number;
  let height: number;
  try {
    // The header alone gives the size; `autoOrient` is it after turning upright.
    const metadata = await upright.metadata();
    ({ width, height } = metadata.autoOrient);
  } catch {
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
  try {
    [thumb, display, surface] = await Promise.all([
      variant(VARIANT_SIZES.thumb),
      variant(VARIANT_SIZES.display),
      textureWidth === null ? null : texture(textureWidth),
    ]);
  } catch {
    // The header was fine but the pixels aren't.
    throw new UnsupportedImage('That image is damaged or incomplete, so it can’t be read.');
  }
  return {
    sha256: sha256Of(data),
    width,
    height,
    variants: { thumb, display, ...(surface ? { texture: surface } : {}) },
  };
}
