import { schema, type Executor } from '@ge/db';
import type { MemberRole, UniverseAccess, Visibility } from '@ge/domain';
import { and, eq, inArray } from 'drizzle-orm';
import type { SignedIn } from '../auth/context.ts';
import type { TokenGrant } from '../auth/tokens.ts';

/**
 * Who may do what in a universe (M8-T11, D-34, data-model §8). `universeAccess` is the only
 * place that decides; everything else asks it.
 */

/**
 * Who is asking, worked out once per request (auth/requester.ts):
 * - `local`: GE_AUTH_MODE=none, on your own machine, where everyone owns everything, except
 *   the private preview's readers (`mayEdit: false`), who only read;
 * - `account`: someone signed in, or an API token acting for its account (M8-T2), which then
 *   carries the token's grant;
 * - `anonymous`: nobody signed in.
 *
 * `shareKeys` are the share links' keys this browser has unlocked, by universe (M8-T12). A
 * request made with a token reads no cookies, so it has none.
 */
export type Requester = { shareKeys: ReadonlyMap<string, string> } & (
  | { kind: 'local'; mayEdit: boolean }
  | { kind: 'account'; account: SignedIn; token?: TokenGrant }
  | { kind: 'anonymous' }
);

/** The grant of the API token making the request, if one is. */
export function tokenOf(requester: Requester): TokenGrant | null {
  return requester.kind === 'account' ? (requester.token ?? null) : null;
}

/** What `universeAccess` needs to know about a universe. */
export interface AccessFacts {
  id: string;
  ownerId: string | null;
  visibility: Visibility;
  shareKey: string | null;
  /** The requester's role in it, if it's shared with them. */
  memberRole: MemberRole | null;
}

const RANK: Record<UniverseAccess, number> = { none: 0, read: 1, edit: 2, own: 3 };

/** Whether `access` allows what `needed` allows. */
export function atLeast(access: UniverseAccess, needed: UniverseAccess): boolean {
  return RANK[access] >= RANK[needed];
}

/**
 * The access table of data-model §8:
 * - `own`: its owner; an admin, for an unowned universe; everyone locally;
 * - `edit`: its editors; an admin, for every other account's universe (D-50);
 * - `read`: its viewers; anyone, for a public universe; anyone with its key, for a link one;
 * - `none`: everyone else, who get a 404 as if it didn't exist.
 *
 * An admin edits other accounts' universes as an editor would, but doesn't own them: who may
 * reach a universe stays its owner's (D-41), and the admin routes cover transfer, takedown and
 * deletion. History records the admin's changes under their name, like anyone's.
 *
 * An API token (M8-T2) gets its account's access, narrowed (`tokenNarrowed`): it never does
 * more than its account may at that moment, so a token loses a universe the moment its account
 * does.
 */
export function universeAccess(requester: Requester, universe: AccessFacts): UniverseAccess {
  const access = accountAccess(requester, universe);
  const token = tokenOf(requester);
  return token ? tokenNarrowed(token, universe.id, access) : access;
}

/**
 * A token's narrowing of its account's access:
 * - a token for one universe reaches no other (`none`);
 * - a `read` token reads as a viewer would, at most: no changes, and no drafts.
 */
export function tokenNarrowed(
  token: TokenGrant,
  universeId: string,
  access: UniverseAccess,
): UniverseAccess {
  if (token.universeId !== null && token.universeId !== universeId) return 'none';
  if (token.scope === 'read' && atLeast(access, 'read')) return 'read';
  return access;
}

/** What the requester's account may do in the universe, before any token narrows it. */
export function accountAccess(requester: Requester, universe: AccessFacts): UniverseAccess {
  if (requester.kind === 'local') return requester.mayEdit ? 'own' : 'read';
  if (requester.kind === 'account') {
    const { account } = requester;
    if (universe.ownerId === account.id) return 'own';
    if (universe.ownerId === null && account.role === 'admin') return 'own';
    // Before the viewer check: an admin it's shared with as a viewer still edits.
    if (universe.memberRole === 'editor' || account.role === 'admin') return 'edit';
    if (universe.memberRole === 'viewer') return 'read';
  }
  if (universe.visibility === 'public') return 'read';
  const key = requester.shareKeys.get(universe.id);
  if (universe.visibility === 'link' && universe.shareKey !== null && key === universe.shareKey) {
    return 'read';
  }
  return 'none';
}

const { universeMembers, universes } = schema;

/** The facts `universeAccess` needs, for each of these universes that exists. */
export async function accessFactsOf(
  ex: Executor,
  requester: Requester,
  universeIds: readonly string[],
): Promise<Map<string, AccessFacts>> {
  if (universeIds.length === 0) return new Map();
  const columns = {
    id: universes.id,
    ownerId: universes.ownerId,
    visibility: universes.visibility,
    shareKey: universes.shareKey,
  };
  const ids = inArray(universes.id, [...universeIds]);
  // Only an account can be a member; without one there's nothing to join.
  const rows =
    requester.kind === 'account'
      ? await ex
          .select({ ...columns, memberRole: universeMembers.role })
          .from(universes)
          .leftJoin(
            universeMembers,
            and(
              eq(universeMembers.universeId, universes.id),
              eq(universeMembers.userId, requester.account.id),
            ),
          )
          .where(ids)
      : (await ex.select(columns).from(universes).where(ids)).map((row) => ({
          ...row,
          memberRole: null,
        }));
  // The database's check constraints allow only the registry's values.
  return new Map(
    rows.map((row) => [
      row.id,
      {
        ...row,
        visibility: row.visibility as Visibility,
        memberRole: row.memberRole as MemberRole | null,
      },
    ]),
  );
}

/** The requester's access to each of these universes; one that doesn't exist is `none`. */
export async function accessTo(
  ex: Executor,
  requester: Requester,
  universeIds: readonly string[],
): Promise<Map<string, UniverseAccess>> {
  const facts = await accessFactsOf(ex, requester, universeIds);
  return new Map(
    universeIds.map((id) => {
      const known = facts.get(id);
      return [id, known ? universeAccess(requester, known) : 'none'];
    }),
  );
}
