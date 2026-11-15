import { schema, type Executor } from '@ge/db';
import type {
  AccessEventRead,
  AdminLinkRead,
  AdminUniverseRead,
  AdminUserRead,
  AdminUserUpdate,
  SiteRole,
} from '@ge/domain';
import { and, count, desc, eq, isNull, lt, ne, sql } from 'drizzle-orm';
import type { z } from 'zod';
import { createAccountLink, linkUrl } from '../auth/links.ts';
import { endSessionsOf } from '../auth/sessions.ts';
import type { Requester } from './access.ts';
import { recordAccessEvent } from './access-events.ts';
import { NotFound, RuleViolation } from './errors.ts';
import { requireUniverse } from './lookup.ts';

/**
 * The admin screens' service (M8-T13, D-34): accounts, the universes as a list of facts about
 * them, and the access log. Admins manage accounts, not content: nothing here reads what's in a
 * universe, and every change is recorded in `access_events`.
 */

const { accessEvents, assets, changeBatches, entities, universes, users } = schema;

const iso = (date: Date | null) => (date === null ? null : date.toISOString());

// ---- accounts ------------------------------------------------------------------------------

/**
 * The universes an account owns, and the bytes of media in them, as SQL beside its row. The
 * outer row is named in full (`"users"."id"`): Drizzle writes a column of a one-table query as a
 * bare `"id"`, which inside a subquery would mean the subquery's own table.
 */
const ownedCount = sql<string>`(select count(*) from ${universes} u where u.owner_id = "users"."id")`;
const ownedBytes = sql<string>`(select coalesce(sum(a.byte_size), 0) from ${assets} a
  join ${universes} u on u.id = a.universe_id where u.owner_id = "users"."id")`;

/** Every account, by username (the Accounts screen). */
export async function listAdminUsers(
  ex: Executor,
  only?: string,
): Promise<z.infer<typeof AdminUserRead>[]> {
  const rows = await ex
    .select({ user: users, owned: ownedCount, used: ownedBytes })
    .from(users)
    .where(only === undefined ? undefined : eq(users.id, only))
    .orderBy(users.username);
  return rows.map(({ user, owned, used }) => ({
    id: user.id,
    username: user.username,
    // The database's check constraint allows only the site roles.
    role: user.role as SiteRole,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: iso(user.lastLoginAt),
    disabledAt: iso(user.disabledAt),
    twoFactor: user.totpSecretEnc !== null,
    universesOwned: Number(owned),
    mediaUsedBytes: Number(used),
    mediaQuotaBytes: user.mediaQuotaBytes,
  }));
}

async function requireUser(ex: Executor, userId: string) {
  const [user] = await ex.select().from(users).where(eq(users.id, userId));
  if (!user) throw new NotFound('account', userId);
  return user;
}

/** Admins who can still sign in, other than `except`. */
async function otherActiveAdmins(ex: Executor, except: string): Promise<number> {
  const [row] = await ex
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.disabledAt), ne(users.id, except)));
  return row?.n ?? 0;
}

const LAST_ADMIN =
  'This is the last admin who can sign in. Make another account an admin first, so someone can still manage the site.';

/**
 * Changes an account's role, status or media quota. Disabling ends its sessions at once (and its
 * API tokens, M8-T2, which stop with it). The last admin who can sign in can't be demoted or
 * disabled, so the site always has someone to manage it.
 */
export async function updateAdminUser(
  ex: Executor,
  requester: Requester,
  userId: string,
  update: z.infer<typeof AdminUserUpdate>,
): Promise<z.infer<typeof AdminUserRead>> {
  const user = await requireUser(ex, userId);
  const disabling = update.disabled === true && user.disabledAt === null;
  const enabling = update.disabled === false && user.disabledAt !== null;
  const roleChange = update.role !== undefined && update.role !== user.role;
  const quotaChange =
    update.mediaQuotaBytes !== undefined && update.mediaQuotaBytes !== user.mediaQuotaBytes;
  const losesAdmin =
    user.role === 'admin' && user.disabledAt === null && (disabling || update.role === 'member');
  if (losesAdmin && (await otherActiveAdmins(ex, userId)) === 0)
    throw new RuleViolation(LAST_ADMIN);

  await ex
    .update(users)
    .set({
      ...(roleChange ? { role: update.role } : {}),
      ...(disabling ? { disabledAt: new Date() } : enabling ? { disabledAt: null } : {}),
      ...(quotaChange ? { mediaQuotaBytes: update.mediaQuotaBytes } : {}),
    })
    .where(eq(users.id, userId));
  const about = { userId, detail: { username: user.username } };
  if (disabling) {
    await endSessionsOf(ex, userId);
    await recordAccessEvent(ex, requester, { action: 'user.disable', ...about });
  }
  if (enabling) await recordAccessEvent(ex, requester, { action: 'user.enable', ...about });
  if (roleChange) {
    await recordAccessEvent(ex, requester, {
      action: 'user.role',
      userId,
      detail: { username: user.username, from: user.role, to: update.role },
    });
  }
  if (quotaChange) {
    await recordAccessEvent(ex, requester, {
      action: 'user.quota',
      userId,
      detail: { username: user.username, from: user.mediaQuotaBytes, to: update.mediaQuotaBytes },
    });
  }
  const [read] = await listAdminUsers(ex, userId);
  if (!read) throw new NotFound('account', userId);
  return read;
}

/**
 * Deletes an account that owns nothing: its universes must be transferred or deleted first, so
 * deleting an account never deletes content. Its sessions, links and memberships go with it.
 */
export async function deleteAdminUser(
  ex: Executor,
  requester: Requester,
  userId: string,
): Promise<void> {
  const user = await requireUser(ex, userId);
  const [owned] = await ex
    .select({ n: count() })
    .from(universes)
    .where(eq(universes.ownerId, userId));
  const n = owned?.n ?? 0;
  if (n > 0) {
    throw new RuleViolation(
      `${user.username} owns ${String(n)} universe${n === 1 ? '' : 's'}. Transfer or delete ${n === 1 ? 'it' : 'them'} first.`,
    );
  }
  if (
    user.role === 'admin' &&
    user.disabledAt === null &&
    (await otherActiveAdmins(ex, userId)) === 0
  ) {
    throw new RuleViolation(LAST_ADMIN);
  }
  // Recorded first, with the name: the row's link to the account is cleared when it goes.
  await recordAccessEvent(ex, requester, {
    action: 'user.delete',
    userId,
    detail: { username: user.username, role: user.role },
  });
  await ex.delete(users).where(eq(users.id, userId));
}

/** An invite link for a new account of `role`, shown to the admin once. */
export async function createInvite(
  ex: Executor,
  requester: Requester,
  role: SiteRole,
  publicUrl: string,
): Promise<z.infer<typeof AdminLinkRead>> {
  const createdBy = requester.kind === 'account' ? requester.account.id : null;
  const { token, expiresAt } = await createAccountLink(ex, { purpose: 'invite', role, createdBy });
  await recordAccessEvent(ex, requester, {
    action: 'invite.create',
    detail: { role, expiresAt: expiresAt.toISOString() },
  });
  return { url: linkUrl(publicUrl, token), expiresAt: expiresAt.toISOString() };
}

/** A reset link for an account, shown to the admin once: a new password and new codes. */
export async function createResetLink(
  ex: Executor,
  requester: Requester,
  userId: string,
  publicUrl: string,
): Promise<z.infer<typeof AdminLinkRead>> {
  const user = await requireUser(ex, userId);
  const createdBy = requester.kind === 'account' ? requester.account.id : null;
  const { token, expiresAt } = await createAccountLink(ex, {
    purpose: 'reset',
    userId,
    createdBy,
  });
  await recordAccessEvent(ex, requester, {
    action: 'user.reset',
    userId,
    detail: { username: user.username, expiresAt: expiresAt.toISOString() },
  });
  return { url: linkUrl(publicUrl, token), expiresAt: expiresAt.toISOString() };
}

// ---- universes -----------------------------------------------------------------------------

/**
 * Every universe, as facts about it (the Universes screen): its owner, visibility, how many
 * objects and how much media it holds, and when it last changed. Never its content.
 */
export async function listAdminUniverses(
  ex: Executor,
): Promise<z.infer<typeof AdminUniverseRead>[]> {
  const rows = await ex
    .select({
      id: universes.id,
      slug: universes.slug,
      name: universes.namePlain,
      owner: users.username,
      visibility: universes.visibility,
      // The outer row in full, as above.
      objectCount: sql<string>`(select count(*) from ${entities} e
        where e.universe_id = "universes"."id" and e.kind = 'celestial_object')`,
      mediaBytes: sql<string>`(select coalesce(sum(a.byte_size), 0) from ${assets} a
        where a.universe_id = "universes"."id")`,
      lastChangeAt: sql<Date>`greatest("universes"."updated_at", (select max(b.created_at)
        from ${changeBatches} b where b.universe_id = "universes"."id"))`,
    })
    .from(universes)
    .leftJoin(users, eq(users.id, universes.ownerId))
    .orderBy(universes.namePlain);
  return rows.map((row) => ({
    ...row,
    // The database's check constraint allows only these.
    visibility: row.visibility as z.infer<typeof AdminUniverseRead>['visibility'],
    objectCount: Number(row.objectCount),
    mediaBytes: Number(row.mediaBytes),
    lastChangeAt: new Date(row.lastChangeAt).toISOString(),
  }));
}

/** A takedown: the universe becomes private, and its share link stops working. */
export async function takeDownUniverse(
  ex: Executor,
  requester: Requester,
  universeId: string,
): Promise<void> {
  const row = await requireUniverse(ex, universeId);
  await ex
    .update(universes)
    .set({ visibility: 'private', shareKey: null })
    .where(eq(universes.id, universeId));
  await recordAccessEvent(ex, requester, {
    action: 'universe.takedown',
    universeId,
    detail: { slug: row.slug, from: row.visibility },
  });
}

// ---- the log -------------------------------------------------------------------------------

/** The access log, newest first, a page at a time (`cursor`: the last row's id). */
export async function listAccessEvents(
  ex: Executor,
  options: { cursor?: string; limit: number },
): Promise<{ items: z.infer<typeof AccessEventRead>[]; nextCursor: string | null }> {
  const rows = await ex
    .select({ event: accessEvents, user: users.username, universe: universes.slug })
    .from(accessEvents)
    .leftJoin(users, eq(users.id, accessEvents.userId))
    .leftJoin(universes, eq(universes.id, accessEvents.universeId))
    // Ids are time-ordered (uuidv7), so they page in the order of the rows' times.
    .where(options.cursor ? lt(accessEvents.id, options.cursor) : undefined)
    .orderBy(desc(accessEvents.id))
    .limit(options.limit + 1);
  const page = rows.slice(0, options.limit);
  return {
    items: page.map(({ event, user, universe }) => ({
      id: event.id,
      actor: event.actorLabel,
      action: event.action as z.infer<typeof AccessEventRead>['action'],
      user,
      universe,
      detail: event.detail as Record<string, unknown>,
      createdAt: event.createdAt.toISOString(),
    })),
    nextCursor: rows.length > options.limit ? (page.at(-1)?.event.id ?? null) : null,
  };
}
