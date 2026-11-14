import { schema, type Executor } from '@ge/db';
import { eq, sql } from 'drizzle-orm';
import { QuotaExceeded } from './errors.ts';

/**
 * Media quotas (M8-T11, D-34): the images of all the universes an account owns count against
 * its `media_quota_bytes` (2 GiB unless an admin changes it), measured by the size of what was
 * uploaded. The installation's own universes (no owner) have no quota.
 */

const { assets, universes, users } = schema;

/** The bytes of media in the universes an account owns. */
export async function mediaUsedBytes(ex: Executor, ownerId: string): Promise<number> {
  const [row] = await ex
    .select({ used: sql<string>`coalesce(sum(${assets.byteSize}), 0)` })
    .from(assets)
    .innerJoin(universes, eq(universes.id, assets.universeId))
    .where(eq(universes.ownerId, ownerId));
  return Number(row?.used ?? 0);
}

/** Refuses an upload of `bytes` into a universe whose owner has no room left for it. */
export async function requireMediaRoom(
  ex: Executor,
  universeId: string,
  bytes: number,
): Promise<void> {
  const [owner] = await ex
    .select({ id: users.id, quotaBytes: users.mediaQuotaBytes })
    .from(universes)
    .innerJoin(users, eq(users.id, universes.ownerId))
    .where(eq(universes.id, universeId));
  if (!owner) return;
  const usedBytes = await mediaUsedBytes(ex, owner.id);
  if (usedBytes + bytes > owner.quotaBytes) throw new QuotaExceeded(usedBytes, owner.quotaBytes);
}
