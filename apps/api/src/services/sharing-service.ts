import { randomBytes } from 'node:crypto';
import { schema, type Executor } from '@ge/db';
import { UniverseMemberRead, type MemberRole, type Visibility } from '@ge/domain';
import { and, asc, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { Requester } from './access.ts';
import { recordAccessEvent } from './access-events.ts';
import { NoSuchAccount, NotAMember, RuleViolation } from './errors.ts';
import { requireUniverse } from './lookup.ts';
import { mediaUsedBytes } from './quota.ts';

/**
 * Sharing a universe (M8-T12, D-34, ux.md §13): its members, its visibility and share link,
 * and handing it to another account. Who may call these is the access guard's to check
 * (http/access-guard.ts); every change is recorded in `access_events`.
 *
 * None of this is content: `universe_members` isn't audited, and the universe's access columns
 * are left out of History (migration 0009, D-41), so none of it is undone by a revert.
 */

const { assets, entities, maps, universeMembers, universes, users } = schema;
type MemberRead = z.infer<typeof UniverseMemberRead>;

/** The account with this exact username, or a 404 that says there's none. */
async function accountNamed(ex: Executor, username: string) {
  const [user] = await ex
    .select({ id: users.id, username: users.username, quotaBytes: users.mediaQuotaBytes })
    .from(users)
    .where(eq(users.username, username));
  if (!user) throw new NoSuchAccount(username);
  return user;
}

// ---- members -------------------------------------------------------------------------------

const addedBy = alias(users, 'added_by');

/** The accounts a universe is shared with, by username. Its owner isn't one of them. */
export async function listMembers(ex: Executor, universeId: string): Promise<MemberRead[]> {
  const rows = await ex
    .select({
      username: users.username,
      role: universeMembers.role,
      addedBy: addedBy.username,
      createdAt: universeMembers.createdAt,
    })
    .from(universeMembers)
    .innerJoin(users, eq(users.id, universeMembers.userId))
    .leftJoin(addedBy, eq(addedBy.id, universeMembers.addedBy))
    .where(eq(universeMembers.universeId, universeId))
    .orderBy(asc(users.username));
  return rows.map((row) =>
    UniverseMemberRead.parse({ ...row, createdAt: row.createdAt.toISOString() }),
  );
}

async function memberOf(ex: Executor, universeId: string, username: string) {
  return (await listMembers(ex, universeId)).find((member) => member.username === username);
}

/**
 * Shares a universe with an account, or changes its role. Its owner can't also be a member;
 * a username that doesn't exist is a 404 that says so.
 */
export async function setMember(
  ex: Executor,
  requester: Requester,
  universeId: string,
  username: string,
  role: MemberRole,
): Promise<MemberRead> {
  const universe = await requireUniverse(ex, universeId);
  const account = await accountNamed(ex, username);
  if (account.id === universe.ownerId) {
    throw new RuleViolation(`${username} owns this universe already.`, '/username');
  }
  const before = await memberOf(ex, universeId, username);
  if (before?.role !== role) {
    await ex
      .insert(universeMembers)
      .values({
        universeId,
        userId: account.id,
        role,
        addedBy: requester.kind === 'account' ? requester.account.id : null,
      })
      .onConflictDoUpdate({
        target: [universeMembers.universeId, universeMembers.userId],
        set: { role },
      });
    await recordAccessEvent(ex, requester, {
      action: before ? 'member.role' : 'member.add',
      userId: account.id,
      universeId,
      detail: before ? { username, from: before.role, to: role } : { username, role },
    });
  }
  const after = await memberOf(ex, universeId, username);
  if (!after) throw new Error('The member just added is missing.');
  return after;
}

/** Stops sharing a universe with an account. */
export async function removeMember(
  ex: Executor,
  requester: Requester,
  universeId: string,
  username: string,
): Promise<void> {
  const account = await accountNamed(ex, username);
  const removed = await ex
    .delete(universeMembers)
    .where(and(eq(universeMembers.universeId, universeId), eq(universeMembers.userId, account.id)))
    .returning({ role: universeMembers.role });
  const [row] = removed;
  if (!row) throw new NotAMember(username);
  await recordAccessEvent(ex, requester, {
    action: 'member.remove',
    userId: account.id,
    universeId,
    detail: { username, role: row.role },
  });
}

/** "Leave this universe": a member removes themself. Its owner transfers it instead. */
export async function leaveUniverse(
  ex: Executor,
  requester: Requester,
  universeId: string,
): Promise<void> {
  if (requester.kind !== 'account') {
    throw new RuleViolation('Only an account it’s shared with can leave a universe.');
  }
  const { account } = requester;
  const universe = await requireUniverse(ex, universeId);
  if (universe.ownerId === account.id) {
    throw new RuleViolation('You own this universe: transfer it to someone else, or delete it.');
  }
  const [row] = await ex
    .delete(universeMembers)
    .where(and(eq(universeMembers.universeId, universeId), eq(universeMembers.userId, account.id)))
    .returning({ role: universeMembers.role });
  if (!row)
    throw new RuleViolation('This universe isn’t shared with you, so there’s nothing to leave.');
  await recordAccessEvent(ex, requester, {
    action: 'member.leave',
    userId: account.id,
    universeId,
    detail: { username: account.username, role: row.role },
  });
}

// ---- visibility and the share link ---------------------------------------------------------

/** A share link's key: random and unguessable, 128 bits, safe in a URL. */
function newShareKey(): string {
  return randomBytes(16).toString('base64url');
}

/**
 * Private, link-only or public (data-model §8). Choosing `link` makes a share key; leaving
 * `link` drops it, so the old link stops working, and coming back makes a new one. The version
 * isn't bumped: this isn't an edit of the universe's content, and History doesn't see it.
 */
export async function setVisibility(
  ex: Executor,
  requester: Requester,
  universeId: string,
  visibility: Visibility,
): Promise<void> {
  const row = await requireUniverse(ex, universeId);
  if (row.visibility === visibility) return;
  await ex
    .update(universes)
    .set({ visibility, shareKey: visibility === 'link' ? newShareKey() : null })
    .where(eq(universes.id, universeId));
  await recordAccessEvent(ex, requester, {
    action: 'universe.visibility',
    universeId,
    detail: { slug: row.slug, from: row.visibility, to: visibility },
  });
}

/** "Make a new link": a new share key, so everyone holding the old link is locked out. */
export async function replaceShareKey(
  ex: Executor,
  requester: Requester,
  universeId: string,
): Promise<void> {
  const row = await requireUniverse(ex, universeId);
  if (row.visibility !== 'link') {
    throw new RuleViolation('Only a link-only universe has a share link to replace.');
  }
  await ex.update(universes).set({ shareKey: newShareKey() }).where(eq(universes.id, universeId));
  await recordAccessEvent(ex, requester, {
    action: 'universe.link',
    universeId,
    detail: { slug: row.slug },
  });
}

/**
 * The universe a share link opens: its id, if `key` is its current key. Anything else (no such
 * address, not link-only, an old key) is null, and the route answers 404 alike.
 */
export async function universeForShareKey(
  ex: Executor,
  slug: string,
  key: string,
): Promise<string | null> {
  const [row] = await ex
    .select({ id: universes.id })
    .from(universes)
    .where(
      and(eq(universes.slug, slug), eq(universes.visibility, 'link'), eq(universes.shareKey, key)),
    );
  return row?.id ?? null;
}

// ---- transfer ------------------------------------------------------------------------------

/** The bytes of media a universe holds, which count against its owner's quota. */
async function universeMediaBytes(ex: Executor, universeId: string): Promise<number> {
  const [row] = await ex
    .select({ used: sql<string>`coalesce(sum(${assets.byteSize}), 0)` })
    .from(assets)
    .where(eq(assets.universeId, universeId));
  return Number(row?.used ?? 0);
}

const mb = (bytes: number) => `${(bytes / 1024 ** 2).toFixed(1)} MB`;

/**
 * Hands a universe to another account, if its media quota has room for the universe's images.
 * The previous owner stays on as an editor (for one of the installation's own universes, the
 * admin handing it over does); the new owner stops being a member, since owning is more.
 */
export async function transferUniverse(
  ex: Executor,
  requester: Requester,
  universeId: string,
  username: string,
): Promise<void> {
  const universe = await requireUniverse(ex, universeId);
  const account = await accountNamed(ex, username);
  if (account.id === universe.ownerId) {
    throw new RuleViolation(`${username} owns this universe already.`, '/username');
  }
  const bytes = await universeMediaBytes(ex, universeId);
  const usedBytes = await mediaUsedBytes(ex, account.id);
  if (usedBytes + bytes > account.quotaBytes) {
    throw new RuleViolation(
      `${username} has no room for this universe’s images (${mb(bytes)}): ${mb(usedBytes)} of their ${mb(account.quotaBytes)} is used. An admin can raise their quota.`,
      '/username',
    );
  }
  const previousOwnerId =
    universe.ownerId ?? (requester.kind === 'account' ? requester.account.id : null);
  await ex.update(universes).set({ ownerId: account.id }).where(eq(universes.id, universeId));
  await ex
    .delete(universeMembers)
    .where(and(eq(universeMembers.universeId, universeId), eq(universeMembers.userId, account.id)));
  if (previousOwnerId) {
    await ex
      .insert(universeMembers)
      .values({ universeId, userId: previousOwnerId, role: 'editor', addedBy: previousOwnerId })
      .onConflictDoUpdate({
        target: [universeMembers.universeId, universeMembers.userId],
        set: { role: 'editor' },
      });
  }
  await recordAccessEvent(ex, requester, {
    action: 'universe.transfer',
    userId: account.id,
    universeId,
    detail: { slug: universe.slug, to: username, mediaBytes: bytes },
  });
}

// ---- drafts --------------------------------------------------------------------------------

/**
 * How many drafts a universe has: maps, and entries anywhere in it. Making it public asks the
 * owner to confirm, saying these stay hidden from readers (ux.md §13).
 */
export async function countDrafts(
  ex: Executor,
  universeId: string,
): Promise<{ maps: number; entries: number }> {
  const count = sql<string>`count(*)`;
  const [draftMaps] = await ex
    .select({ count })
    .from(maps)
    .where(and(eq(maps.universeId, universeId), eq(maps.status, 'draft')));
  const [draftEntries] = await ex
    .select({ count })
    .from(entities)
    .where(and(eq(entities.universeId, universeId), eq(entities.status, 'draft')));
  return { maps: Number(draftMaps?.count ?? 0), entries: Number(draftEntries?.count ?? 0) };
}
