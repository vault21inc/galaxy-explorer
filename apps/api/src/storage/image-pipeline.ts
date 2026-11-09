import { createHash } from 'node:crypto';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';

/**
 * Turns an upload into the files we store (architecture.md §8):
 * 1. sniff the real type from the bytes, never the file name or the browser's claim;
 * 2. decode with sharp, turn it upright by its EXIF orientation, and re-encode as WebP, which
 *    leaves EXIF, GPS positions and anything else embedded behind;
 * 3. make the variants: `thumb` (at most 256 px) and `display` (at most 1,600 px), never larger
 *    than the original. Surface textures (`texture`) arrive with planets in M6.
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
export type VariantName = keyof typeof VARIANT_SIZES;

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
  variants: Record<VariantName, { data: Buffer; width: number; height: number }>;
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
  let thumb: Awaited<ReturnType<typeof variant>>;
  let display: Awaited<ReturnType<typeof variant>>;
  try {
    [thumb, display] = await Promise.all([
      variant(VARIANT_SIZES.thumb),
      variant(VARIANT_SIZES.display),
    ]);
  } catch {
    // The header was fine but the pixels aren't.
    throw new UnsupportedImage('That image is damaged or incomplete, so it can’t be read.');
  }
  return { sha256: sha256Of(data), width, height, variants: { thumb, display } };
}
