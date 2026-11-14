import { schema, type Executor } from '@ge/db';
import { mediaUrl, type AssetMetadata, type AssetRead, type AssetVariants } from '@ge/domain';
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { assetKey, type BlobStore } from '../storage/blob-store.ts';
import type { ImageVariant, ProcessedImage, VariantName } from '../storage/image-pipeline.ts';
import { NotFound, requireChanges } from './errors.ts';

/** Uploaded images (data-model §3.6, architecture.md §8). */

const { assets } = schema;
type AssetRow = typeof assets.$inferSelect;

/** An asset as the API returns it, with the URLs of its variants. */
export function toAssetRead(row: AssetRow): AssetRead {
  // The hash only finds duplicates; it isn't part of what the API shows.
  const { sha256: _sha256, ...rest } = row;
  const read = {
    ...rest,
    createdAt: row.createdAt.toISOString(),
    urls: { thumb: mediaUrl(row.variants.thumb.key), display: mediaUrl(row.variants.display.key) },
  };
  // Ids from the database are UUIDs; the domain type only brands them.
  return read as unknown as AssetRead;
}

/** The same image already uploaded to this universe, found by the hash of its bytes. */
export async function findDuplicate(ex: Executor, universeId: string, sha256: string) {
  const [row] = await ex
    .select()
    .from(assets)
    .where(and(eq(assets.universeId, universeId), eq(assets.sha256, sha256)));
  return row ? toAssetRead(row) : null;
}

/**
 * Stores a processed upload: its variants first, under the new asset's id, then the row, all
 * inside the caller's batch. If anything fails, the files written so far are deleted; the
 * transaction takes care of the row.
 */
export async function storeAsset(
  tx: Executor,
  store: BlobStore,
  input: {
    universeId: string;
    image: ProcessedImage;
    byteSize: number;
    originalFilename: string | null;
  },
): Promise<AssetRead> {
  const { universeId, image } = input;
  // The id comes first because the file keys contain it.
  const idRows = await tx.execute<{ id: string }>(sql`select uuidv7() as id`);
  const id = idRows.rows[0]?.id;
  if (!id) throw new Error('Postgres returned no new id.');
  const written: string[] = [];
  try {
    const variants = {} as AssetVariants;
    for (const [name, variant] of Object.entries(image.variants) as [VariantName, ImageVariant][]) {
      const key = assetKey(universeId, id, name);
      await store.put(key, variant.data, 'image/webp');
      written.push(key);
      variants[name] = { key, width: variant.width, height: variant.height };
    }
    const [row] = await tx
      .insert(assets)
      .values({
        id,
        universeId,
        sha256: image.sha256,
        mimeType: 'image/webp',
        width: image.width,
        height: image.height,
        byteSize: input.byteSize,
        variants,
        originalFilename: input.originalFilename,
      })
      .returning();
    if (!row) throw new Error('Inserting the asset returned no row.');
    return toAssetRead(row);
  } catch (error) {
    await Promise.all(written.map((key) => store.delete(key)));
    throw error;
  }
}

/** A universe's images, newest first: the asset picker's library. */
export async function listAssets(
  ex: Executor,
  universeId: string,
  options: { cursor?: string; limit: number },
) {
  const rows = await ex
    .select()
    .from(assets)
    .where(
      and(
        eq(assets.universeId, universeId),
        options.cursor ? lt(assets.id, options.cursor) : undefined,
      ),
    )
    // Ids are UUIDv7, so they sort by creation time.
    .orderBy(desc(assets.id))
    .limit(options.limit + 1);
  const page = rows.slice(0, options.limit);
  return {
    items: page.map(toAssetRead),
    nextCursor: rows.length > options.limit ? (page.at(-1)?.id ?? null) : null,
  };
}

export async function getAsset(ex: Executor, id: string): Promise<AssetRead> {
  const [row] = await ex.select().from(assets).where(eq(assets.id, id));
  if (!row) throw new NotFound('asset', id);
  return toAssetRead(row);
}

/** Changes alt text, credit, source or license (A5). Empty text clears a field. */
export async function updateAssetMetadata(
  tx: Executor,
  id: string,
  input: z.output<typeof AssetMetadata>,
): Promise<AssetRead> {
  const patch = Object.fromEntries(
    Object.entries(input).map(([field, value]) => [field, value === '' ? null : value]),
  );
  requireChanges(patch);
  const [row] = await tx.update(assets).set(patch).where(eq(assets.id, id)).returning();
  if (!row) throw new NotFound('asset', id);
  return toAssetRead(row);
}

/** The assets of these ids, for attaching to image rows. */
export async function assetsById(ex: Executor, ids: readonly string[]) {
  if (ids.length === 0) return new Map<string, AssetRead>();
  const rows = await ex
    .select()
    .from(assets)
    .where(inArray(assets.id, [...ids]));
  return new Map(rows.map((row) => [row.id, toAssetRead(row)]));
}
