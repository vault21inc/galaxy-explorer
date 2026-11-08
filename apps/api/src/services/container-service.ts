import { schema, type Executor } from '@ge/db';
import {
  MapCreate,
  MapRead,
  MapUpdate,
  UniverseCreate,
  UniverseRead,
  UniverseUpdate,
} from '@ge/domain';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { NotFound, VersionConflict } from './errors.ts';
import { requireInUniverse, requireUniverse } from './lookup.ts';
import { derivedPlainText, sanitizeRichTextFields } from './sanitize.ts';
import type { Viewer } from './visibility.ts';

/** Universes and maps (data-model §3.1): versioned like entities, deleted with everything in them. */

const { assets, maps, universes } = schema;
type Row = Record<string, unknown>;

const stamps = (row: Row) => ({
  ...row,
  createdAt: (row.createdAt as Date).toISOString(),
  updatedAt: (row.updatedAt as Date).toISOString(),
});
const page = <T>(rows: T[], limit: number, idOf: (row: T) => string) => ({
  items: rows.slice(0, limit),
  nextCursor: rows.length > limit && rows[limit - 1] ? idOf(rows[limit - 1] as T) : null,
});

// ---- universes ----------------------------------------------------------------------------

export async function createUniverse(tx: Executor, input: z.input<typeof UniverseCreate>) {
  const values = sanitizeRichTextFields(UniverseCreate, UniverseCreate.parse(input));
  const [row] = await tx
    .insert(universes)
    .values({ ...values, ...derivedPlainText(values) } as typeof universes.$inferInsert)
    .returning();
  if (!row) throw new Error('Insert returned no row.');
  return UniverseRead.parse(stamps(row));
}

export async function getUniverse(ex: Executor, id: string) {
  return UniverseRead.parse(stamps(await requireUniverse(ex, id)));
}

export async function listUniverses(ex: Executor, options: { cursor?: string; limit: number }) {
  const rows = await ex
    .select()
    .from(universes)
    .where(options.cursor ? gt(universes.id, options.cursor) : undefined)
    .orderBy(asc(universes.id))
    .limit(options.limit + 1);
  const result = page(rows, options.limit, (row) => row.id);
  return { ...result, items: result.items.map((row) => UniverseRead.parse(stamps(row))) };
}

export async function updateUniverse(
  tx: Executor,
  id: string,
  input: z.input<typeof UniverseUpdate>,
) {
  const { version, ...values } = sanitizeRichTextFields(
    UniverseUpdate,
    UniverseUpdate.parse(input),
  );
  const current = await getUniverse(tx, id);
  if (current.version !== version) throw new VersionConflict(current);
  await tx
    .update(universes)
    .set({
      ...(values as Partial<typeof universes.$inferInsert>),
      ...derivedPlainText(values),
      version: sql`${universes.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(universes.id, id));
  return getUniverse(tx, id);
}

/** Deletes a universe and everything in it (data-model §11). The UI asks the owner to type its name first. */
export async function deleteUniverse(tx: Executor, id: string, version: number): Promise<void> {
  const current = await getUniverse(tx, id);
  if (current.version !== version) throw new VersionConflict(current);
  await tx.delete(universes).where(eq(universes.id, id));
}

// ---- maps -------------------------------------------------------------------------------------

/** Draft maps are invisible to anonymous readers (data-model §8). */
const mapVisible = (viewer: Viewer) =>
  viewer.includeDrafts ? undefined : eq(maps.status, 'published');

async function checkUnderlay(ex: Executor, universeId: string, assetId: string | null | undefined) {
  if (!assetId) return;
  requireInUniverse(
    await ex.select().from(assets).where(eq(assets.id, assetId)),
    { universeId, mapId: null },
    '/underlayAssetId',
    'asset',
  );
}

export async function createMap(
  tx: Executor,
  universeId: string,
  input: z.input<typeof MapCreate>,
) {
  const values = sanitizeRichTextFields(MapCreate, MapCreate.parse(input));
  await requireUniverse(tx, universeId);
  await checkUnderlay(tx, universeId, values.underlayAssetId);
  const [row] = await tx
    .insert(maps)
    .values({ ...values, ...derivedPlainText(values), universeId } as typeof maps.$inferInsert)
    .returning();
  if (!row) throw new Error('Insert returned no row.');
  return MapRead.parse(stamps(row));
}

export async function getMap(ex: Executor, id: string, viewer: Viewer) {
  const [row] = await ex
    .select()
    .from(maps)
    .where(and(eq(maps.id, id), mapVisible(viewer)));
  if (!row) throw new NotFound('map', id);
  return MapRead.parse(stamps(row));
}

export async function listMaps(
  ex: Executor,
  universeId: string,
  options: { viewer: Viewer; cursor?: string; limit: number },
) {
  await requireUniverse(ex, universeId);
  const rows = await ex
    .select()
    .from(maps)
    .where(
      and(
        eq(maps.universeId, universeId),
        mapVisible(options.viewer),
        options.cursor ? gt(maps.id, options.cursor) : undefined,
      ),
    )
    .orderBy(asc(maps.id))
    .limit(options.limit + 1);
  const result = page(rows, options.limit, (row) => row.id);
  return { ...result, items: result.items.map((row) => MapRead.parse(stamps(row))) };
}

export async function updateMap(tx: Executor, id: string, input: z.input<typeof MapUpdate>) {
  const { version, ...values } = sanitizeRichTextFields(MapUpdate, MapUpdate.parse(input));
  const current = await getMap(tx, id, { includeDrafts: true });
  if (current.version !== version) throw new VersionConflict(current);
  await checkUnderlay(tx, current.universeId, values.underlayAssetId);
  await tx
    .update(maps)
    .set({
      ...(values as Partial<typeof maps.$inferInsert>),
      ...derivedPlainText(values),
      version: sql`${maps.version} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(maps.id, id));
  return getMap(tx, id, { includeDrafts: true });
}

/** Deletes a map and every map-scoped entity on it (data-model §11). */
export async function deleteMap(tx: Executor, id: string, version: number): Promise<void> {
  const current = await getMap(tx, id, { includeDrafts: true });
  if (current.version !== version) throw new VersionConflict(current);
  await tx.delete(maps).where(eq(maps.id, id));
}
