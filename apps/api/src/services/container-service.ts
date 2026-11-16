import { schema, type Executor } from '@ge/db';
import {
  MapCreate,
  MapRead,
  MapUpdate,
  UniverseCreate,
  UniverseRead,
  UniverseUpdate,
  type Visibility,
} from '@ge/domain';
import { and, asc, eq, exists, gt, inArray, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import { accessFactsOf, universeAccess, type Requester } from './access.ts';
import { NotFound, VersionConflict } from './errors.ts';
import { requireInUniverse, requireUniverse } from './lookup.ts';
import { derivedPlainText, sanitizeRichTextFields } from './sanitize.ts';
import type { Viewer } from './visibility.ts';

/** Universes and maps (data-model §3.1): versioned like entities, deleted with everything in them. */

const { assets, maps, universeMembers, universes, users } = schema;
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

/**
 * A universe as stored, before anyone asks: `UniverseRead` with its owner's id in place of the
 * owner's name, and without the requester's access and role, which `universeReads` adds. Its
 * `shareKey` is the real one; only the owner is sent it. Never sent as is.
 */
export const UniverseRecord = UniverseRead.omit({ owner: true, access: true, role: true }).extend({
  ownerId: z.uuid().nullable(),
});
export type UniverseRecord = z.infer<typeof UniverseRecord>;

const recordOf = (row: Row): UniverseRecord => UniverseRecord.parse(stamps(row));

/**
 * Who a new universe belongs to (M8-T11, D-34): the account that makes it, private; or, with no
 * accounts (and for the seeds), nobody, which makes it the installation's own, public.
 */
export interface Placement {
  ownerId: string | null;
  visibility: Visibility;
}
export const INSTALLATION_OWN: Placement = { ownerId: null, visibility: 'public' };

export async function createUniverse(
  tx: Executor,
  input: z.input<typeof UniverseCreate>,
  placement: Placement,
): Promise<UniverseRecord> {
  const values = sanitizeRichTextFields(UniverseCreate, UniverseCreate.parse(input));
  const [row] = await tx
    .insert(universes)
    .values({
      ...values,
      ...derivedPlainText(values),
      ...placement,
    } as typeof universes.$inferInsert)
    .returning();
  if (!row) throw new Error('Insert returned no row.');
  return recordOf(row);
}

export async function getUniverse(ex: Executor, id: string): Promise<UniverseRecord> {
  return recordOf(await requireUniverse(ex, id));
}

/** The universe at `/u/{slug}`, whoever may read it. */
export async function getUniverseBySlug(ex: Executor, slug: string): Promise<UniverseRecord> {
  const [row] = await ex.select().from(universes).where(eq(universes.slug, slug));
  if (!row) throw new NotFound('universe', slug);
  return recordOf(row);
}

/**
 * The universes a requester can read, which is what lists show (data-model §8): public ones,
 * plus the account's own and those shared with it; for an admin, every universe (D-50). A
 * link-only universe is never listed for someone who only has its key.
 *
 * This is `universeAccess`'s rule as SQL, for a list's filter: the two must agree.
 */
export function readableBy(requester: Requester): SQL | undefined {
  if (requester.kind === 'local') return undefined;
  const isPublic = eq(universes.visibility, 'public');
  if (requester.kind === 'anonymous') return isPublic;
  const { id, role } = requester.account;
  // An admin reads them all; `and` below drops the undefined, leaving only a token's narrowing.
  const readable =
    role === 'admin'
      ? undefined
      : or(
          isPublic,
          eq(universes.ownerId, id),
          exists(
            sql`(select 1 from ${universeMembers} where ${universeMembers.universeId} = ${universes.id}
           and ${universeMembers.userId} = ${id})`,
          ),
        );
  // A token for one universe lists that one alone (M8-T2), as `universeAccess` has it.
  const only = requester.token?.universeId;
  return only ? and(readable, eq(universes.id, only)) : readable;
}

export async function listUniverses(
  ex: Executor,
  requester: Requester,
  options: { cursor?: string; limit: number },
) {
  const rows = await ex
    .select()
    .from(universes)
    .where(
      and(readableBy(requester), options.cursor ? gt(universes.id, options.cursor) : undefined),
    )
    .orderBy(asc(universes.id))
    .limit(options.limit + 1);
  const result = page(rows, options.limit, (row) => row.id);
  return { ...result, items: result.items.map(recordOf) };
}

/**
 * Universes as a requester sees them: with their owners' usernames and the requester's access.
 * One they can't read is left out (the access guard has already refused it on its own routes).
 */
export async function universeReads(
  ex: Executor,
  requester: Requester,
  records: readonly UniverseRecord[],
): Promise<z.infer<typeof UniverseRead>[]> {
  const ownerIds = [...new Set(records.flatMap((record) => record.ownerId ?? []))];
  const owners = new Map(
    ownerIds.length === 0
      ? []
      : (
          await ex
            .select({ id: users.id, username: users.username })
            .from(users)
            .where(inArray(users.id, ownerIds))
        ).map((user) => [user.id, user.username]),
  );
  const facts = await accessFactsOf(
    ex,
    requester,
    records.map((record) => record.id),
  );
  return records.flatMap(({ ownerId, shareKey, ...record }) => {
    const known = facts.get(record.id);
    const level = known ? universeAccess(requester, known) : 'none';
    if (level === 'none') return [];
    return [
      {
        ...record,
        owner: ownerId ? (owners.get(ownerId) ?? null) : null,
        access: level,
        role: known?.memberRole ?? null,
        // The link is the owner's to hand out (M8-T12): nobody else is sent its key.
        shareKey: level === 'own' ? shareKey : null,
      },
    ];
  });
}

/**
 * Edits a universe's content: its address, name, description and settings. Its `visibility`
 * isn't content (D-41): the route hands it to `setVisibility` (sharing-service.ts), and an
 * update that carries only a visibility changes nothing here but checks the version.
 */
export async function updateUniverse(
  tx: Executor,
  id: string,
  input: z.input<typeof UniverseUpdate>,
): Promise<UniverseRecord> {
  const { version, visibility, ...values } = sanitizeRichTextFields(
    UniverseUpdate,
    UniverseUpdate.parse(input),
  );
  const row = await requireUniverse(tx, id);
  if (row.version !== version) throw new VersionConflict(recordOf(row));
  if (visibility === undefined || Object.keys(values).length > 0) {
    await tx
      .update(universes)
      .set({
        ...(values as Partial<typeof universes.$inferInsert>),
        ...derivedPlainText(values),
        version: sql`${universes.version} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(universes.id, id));
  }
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
