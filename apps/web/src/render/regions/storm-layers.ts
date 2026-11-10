import { STORM_TEXTURE_PX } from '../tuning.ts';
import { bakeStormPixels, stormBakeKey, type StormParams } from './storm-bake.ts';

/**
 * The pixels of each storm texture layer (M4-T6), by key, kept for the page's lifetime: storms
 * are few, a layer is 256 kB, and returning to a map shouldn't bake again. Generated layers come
 * from `bakeStormPixels`; uploaded pictures are drawn into a layer once they've loaded.
 */
const layers = new Map<string, Uint8Array>();
const loading = new Map<string, Promise<void>>();

/** A generated layer's pixels, baked on first use. */
export function generatedLayer(params: StormParams): { key: string; pixels: Uint8Array } {
  const key = stormBakeKey(params);
  let pixels = layers.get(key);
  if (!pixels) {
    pixels = bakeStormPixels(params, STORM_TEXTURE_PX);
    layers.set(key, pixels);
  }
  return { key, pixels };
}

export const uploadKey = (url: string) => `upload:${url}`;

/** An uploaded picture's pixels, once loaded; undefined until then. */
export function uploadedLayer(url: string): Uint8Array | undefined {
  return layers.get(uploadKey(url));
}

/**
 * Loads an uploaded picture into a layer: drawn onto a square canvas of the layer's size,
 * stretched to fill it, which a top-down picture of a round storm is. Resolves when it's ready.
 */
export function loadUploadedLayer(url: string): Promise<void> {
  const key = uploadKey(url);
  const pending = loading.get(key);
  if (pending) return pending;
  const work = new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = STORM_TEXTURE_PX;
      canvas.height = STORM_TEXTURE_PX;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('No 2D canvas.'));
        return;
      }
      context.drawImage(image, 0, 0, STORM_TEXTURE_PX, STORM_TEXTURE_PX);
      const { data } = context.getImageData(0, 0, STORM_TEXTURE_PX, STORM_TEXTURE_PX);
      layers.set(key, new Uint8Array(data.buffer.slice(0)));
      resolve();
    };
    image.onerror = () => {
      reject(new Error(`Couldn't load ${url}.`));
    };
    image.src = url;
  });
  loading.set(key, work);
  work.catch(() => {
    // Try again next time it's asked for.
    loading.delete(key);
  });
  return work;
}
