import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, sep } from 'node:path';
import { mediaUrl } from '@ge/domain';

/**
 * Where uploaded files live (architecture.md §8). One interface, so production can move to
 * object storage without touching the upload code. Keys are paths such as
 * `u/{universeId}/{assetId}/display.webp`.
 */
export interface BlobStore {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** The file, or null if there's none. */
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
  /** The URL readers load it from. */
  publicUrl(key: string): string;
}

/** Files under a directory (`GE_MEDIA_DIR`), served at `/media/` by the API or Caddy. */
export class LocalBlobStore implements BlobStore {
  readonly root: string;

  constructor(root: string) {
    this.root = normalize(root);
  }

  /** The file's path, refusing keys that would leave the root (`..`, absolute paths). */
  pathOf(key: string): string {
    const path = normalize(join(this.root, key));
    if (!path.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return path;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }

  publicUrl(key: string): string {
    return mediaUrl(key);
  }
}

/** The key of one stored variant (architecture.md §8). */
export function assetKey(universeId: string, assetId: string, variant: string): string {
  return `u/${universeId}/${assetId}/${variant}.webp`;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

/** Exactly the keys `assetKey` makes: what `/media/*` will serve, and nothing else. */
export const ASSET_KEY_PATTERN = new RegExp(
  `^u/${UUID}/${UUID}/(thumb|display|texture|animated)\\.webp$`,
);
