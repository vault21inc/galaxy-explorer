import { schema, type Database, type Executor } from '@ge/db';
import type { SessionRead } from '@ge/domain';
import { and, desc, eq, lt, ne } from 'drizzle-orm';
import type { z } from 'zod';
import { signedIn, type SignedIn } from './context.ts';
import { hashToken, newToken } from './crypto.ts';

/**
 * Sessions (M8-T1): a signed-in browser holds a random token in an `HttpOnly` cookie, and the
 * database holds the token's hash. A session lasts 30 days from when it was last used: each use
 * slides its end forward, at most once every few minutes so that reading doesn't mean writing.
 */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** How often a session in use has its end moved forward, and its last use noted. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

const { sessions, users } = schema;

/** Starts a session for an account and returns its token, the cookie's value. */
export async function createSession(
  db: Executor,
  userId: string,
  userAgent: string | null,
): Promise<{ token: string; expiresAt: Date }> {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt,
    // Only what the browser said it is, trimmed: shown on the account page (M8-T13).
    userAgent: userAgent?.slice(0, 300) ?? null,
  });
  return { token, expiresAt };
}

export interface ResolvedSession {
  sessionId: string;
  account: SignedIn;
  /** Set when this request moved the session's end forward: the cookie is sent again. */
  renewedUntil: Date | null;
}

/**
 * The session a cookie's token names, if it's current and its account isn't disabled. An
 * expired session, or one of a disabled account, is deleted on the spot.
 */
export async function resolveSession(db: Database, token: string): Promise<ResolvedSession | null> {
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, hashToken(token)));
  if (!row) return null;
  const now = Date.now();
  if (row.session.expiresAt.getTime() <= now || row.user.disabledAt !== null) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }
  let renewedUntil: Date | null = null;
  if (row.session.lastSeenAt.getTime() < now - TOUCH_EVERY_MS) {
    renewedUntil = new Date(now + SESSION_TTL_MS);
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(now), expiresAt: renewedUntil })
      .where(eq(sessions.id, row.session.id));
  }
  return { sessionId: row.session.id, account: signedIn(row.user), renewedUntil };
}

/** Signs one session out. */
export async function endSession(
  db: Database,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const ended = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
    .returning({ id: sessions.id });
  return ended.length > 0;
}

/** Signs every session of an account out, except `keep` if given. */
export async function endSessionsOf(db: Executor, userId: string, keep?: string): Promise<void> {
  await db
    .delete(sessions)
    .where(
      keep === undefined
        ? eq(sessions.userId, userId)
        : and(eq(sessions.userId, userId), ne(sessions.id, keep)),
    );
}

/** An account's signed-in devices, most recently used first. Expired ones are swept first. */
export async function listSessions(
  db: Database,
  userId: string,
  currentId: string | null,
): Promise<z.infer<typeof SessionRead>[]> {
  await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), lt(sessions.expiresAt, new Date())));
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.userId, userId))
    .orderBy(desc(sessions.lastSeenAt));
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.lastSeenAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    current: row.id === currentId,
  }));
}
