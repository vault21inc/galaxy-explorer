import { schema, type Database, type Executor } from '@ge/db';
import { API_TOKEN_PATTERN, type ApiTokenRead, type TokenScope } from '@ge/domain';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { z } from 'zod';
import { signedIn, type SignedIn } from './context.ts';
import { hashToken } from './crypto.ts';

/**
 * API tokens (M8-T2, D-34, data-model §3.8): how an agent, such as the MCP server, acts for an
 * account. A request carries one as `Authorization: Bearer ge_…`; the database holds only its
 * SHA-256, like a session's. What the token may do is its account's access at the moment of the
 * request, narrowed by the token's scope and, if set, to its one universe (services/access.ts).
 */

/** What a request made with a token carries: enough to narrow its account's access. */
export interface TokenGrant {
  id: string;
  name: string;
  scope: TokenScope;
  /** The one universe it may reach; null for every universe its account can. */
  universeId: string | null;
}

/** How often a token in use has its last use noted: often enough for the account page. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;
const TOKEN_TEXT = new RegExp(API_TOKEN_PATTERN);

const { apiTokens, universes, users } = schema;

/** A new token's text: `ge_` and 32 random bytes, 256 bits that no one can guess. */
export function newApiToken(): string {
  return `ge_${randomBytes(32).toString('base64url')}`;
}

/** The token an `Authorization` header carries, if it's a bearer one; undefined if none is. */
export function bearerOf(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, value] = header.trim().split(/\s+/, 2);
  // Only `Bearer` is ours: anything else (a proxy's Basic, say) is left alone.
  if (scheme?.toLowerCase() !== 'bearer') return undefined;
  return value ?? '';
}

/** Scopes are stored as a set, `{read}` or `{read,write}`; the API speaks of the larger one. */
function scopeOf(scopes: readonly string[]): TokenScope {
  return scopes.includes('write') ? 'write' : 'read';
}
const scopesFor = (scope: TokenScope): TokenScope[] =>
  scope === 'write' ? ['read', 'write'] : ['read'];

export interface ResolvedToken {
  grant: TokenGrant;
  account: SignedIn;
}

/**
 * The token's grant and account, if the token exists, isn't revoked, and its account isn't
 * disabled; null otherwise. Checked on every request, so revoking a token or disabling its
 * account stops it at the very next one.
 */
export async function resolveToken(db: Database, token: string): Promise<ResolvedToken | null> {
  // Anything not shaped like a token can't be one: no need to ask the database.
  if (!TOKEN_TEXT.test(token)) return null;
  const [row] = await db
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(users.id, apiTokens.userId))
    .where(and(eq(apiTokens.tokenHash, hashToken(token)), isNull(apiTokens.revokedAt)));
  // No such token, or its account is disabled.
  if (row?.user.disabledAt !== null) return null;
  const now = Date.now();
  if (row.token.lastUsedAt === null || row.token.lastUsedAt.getTime() < now - TOUCH_EVERY_MS) {
    await db
      .update(apiTokens)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(apiTokens.id, row.token.id));
  }
  return {
    grant: {
      id: row.token.id,
      name: row.token.name,
      scope: scopeOf(row.token.scopes),
      universeId: row.token.universeId,
    },
    account: signedIn(row.user),
  };
}

/** How a token's changes read in History (ux.md §13): "token: claude-code, for aemos". */
export function tokenActorLabel(grant: TokenGrant, account: SignedIn): string {
  return `token: ${grant.name}, for ${account.username}`;
}

type TokenRead = z.infer<typeof ApiTokenRead>;

/** The account's tokens that still work, newest first, with the universe each is for. */
export async function listTokens(ex: Executor, userId: string): Promise<TokenRead[]> {
  return readTokens(ex, and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)));
}

/** One of the account's tokens, as the account page shows it. */
export async function readToken(ex: Executor, tokenId: string): Promise<TokenRead> {
  const [token] = await readTokens(ex, eq(apiTokens.id, tokenId));
  if (!token) throw new Error(`Token ${tokenId} has no row.`);
  return token;
}

async function readTokens(ex: Executor, where: SQL | undefined): Promise<TokenRead[]> {
  const rows = await ex
    .select({
      token: apiTokens,
      universe: { id: universes.id, slug: universes.slug, name: universes.namePlain },
    })
    .from(apiTokens)
    .leftJoin(universes, eq(universes.id, apiTokens.universeId))
    .where(where)
    .orderBy(desc(apiTokens.createdAt));
  return rows.map(({ token, universe }) => ({
    id: token.id,
    name: token.name,
    scope: scopeOf(token.scopes),
    universe: universe?.id ? universe : null,
    createdAt: token.createdAt.toISOString(),
    lastUsedAt: token.lastUsedAt?.toISOString() ?? null,
  }));
}

/** Makes a token for an account, and returns its row's id and the token's text, shown once. */
export async function createToken(
  ex: Executor,
  userId: string,
  options: { name: string; scope: TokenScope; universeId: string | null },
): Promise<{ id: string; secret: string }> {
  const secret = newApiToken();
  const [row] = await ex
    .insert(apiTokens)
    .values({
      userId,
      name: options.name,
      tokenHash: hashToken(secret),
      scopes: scopesFor(options.scope),
      universeId: options.universeId,
    })
    .returning({ id: apiTokens.id });
  if (!row) throw new Error('Making the token returned no row.');
  return { id: row.id, secret };
}

/**
 * Revokes one of the account's tokens: it stops at once. Its row stays, revoked, so History's
 * `actor_id` still names something. Null if the account has no such token that still works.
 */
export async function revokeToken(
  ex: Executor,
  userId: string,
  tokenId: string,
): Promise<{ name: string } | null> {
  const [row] = await ex
    .update(apiTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)),
    )
    .returning({ name: apiTokens.name });
  return row ?? null;
}
