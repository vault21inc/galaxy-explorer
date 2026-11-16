import { withTestDb } from '@ge/db/testing';
import { describe, expect, it } from 'vitest';
import type { RouteAccess } from '../../src/http/access-guard.ts';
import { KNOWN_PARAMS, namesUniverse, paramsOf } from '../../src/http/route-universe.ts';
import type { ApiServer } from '../../src/server.ts';
import { authServer, ORIGIN } from '../auth/auth-world.ts';
import {
  buildAccessWorld,
  ROLES,
  TOKEN_ROLES,
  type AccessWorld,
  type Role,
  type RowSet,
  type TokenRole,
} from './access-world.ts';

/**
 * The access contract suite (M8-T11, data-model §8): every route in the OpenAPI document, none
 * listed by hand, tried by each kind of requester on a private universe.
 *
 * - A route whose path names a universe (through a universe, map, entity, settings row, asset
 *   or batch): a stranger and an anonymous visitor get 404; a viewer reads and gets 403 on
 *   writes; an editor, and an admin it isn't shared with (D-50), write and get 403 on what only
 *   the owner may do; the owner may do it all.
 * - Any other route must say in its `x-ge-access` that it isn't about one universe.
 * - A route the suite can't classify, or can't fill in, fails it.
 * - API tokens (M8-T2) get their account's access, narrowed: a read token reads as a viewer
 *   does, a token for another universe gets 403, an admin's write token writes as its admin
 *   does, and every token gets 403 on the account and sharing routes and 404 on the admin ones,
 *   whoever's it is.
 *
 * Writes are sent with an empty body. The access check comes before validation, so a refused
 * request is refused whatever it carries, and an allowed one usually stops at a 400. Those that
 * succeed only change their role's own rows (access-world.ts).
 */

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
interface Operation {
  method: Method;
  path: string;
  operationId: string;
  access: RouteAccess | undefined;
}

function operationsOf(app: ApiServer): Operation[] {
  const doc = app.swagger() as {
    paths: Record<
      string,
      Partial<Record<Method, { operationId?: string; 'x-ge-access'?: RouteAccess }>>
    >;
  };
  return Object.entries(doc.paths).flatMap(([path, item]) =>
    (Object.entries(item) as [Method, { operationId?: string; 'x-ge-access'?: RouteAccess }][]).map(
      ([method, op]) => ({
        method,
        path,
        operationId: op.operationId ?? `${method} ${path}`,
        access: op['x-ge-access'],
      }),
    ),
  );
}

const NOBODY = '00000000-0000-4000-8000-000000000000';

/** The id a path parameter stands for, from a role's rows; undefined if the suite can't tell. */
function valueFor(
  world: AccessWorld,
  rows: RowSet,
  path: string,
  param: string,
): string | undefined {
  const segment = path.replace(/^\/api\/v1\//, '').split('/')[0];
  const byId: Record<string, string> = {
    objects: path.includes('/views/system') ? rows.systemId : rows.planetId,
    groups: rows.groupId,
    routes: rows.routeId,
    places: rows.placeId,
    events: rows.eventId,
    characters: rows.characterId,
    'group-types': rows.groupTypeId,
    'event-categories': rows.eventCategoryId,
    'object-subtypes': rows.objectSubtypeId,
    'field-definitions': rows.fieldDefinitionId,
  };
  const values: Record<string, string | undefined> = {
    universeId: world.universeId,
    mapId: rows.mapId,
    id: byId[segment ?? ''],
    // Locations are a place's or event's; relations here start at the character.
    entityId: path.includes('/location')
      ? rows.eventId
      : path.includes('/relations')
        ? rows.characterId
        : rows.planetId,
    groupId: rows.groupId,
    routeId: rows.routeId,
    batchId: rows.batchId,
    assetId: rows.assetId,
    fieldDefinitionId: rows.fieldDefinitionId,
    linkId: rows.linkId,
    relationId: rows.relationId,
    citationId: rows.citationId,
    externalKey: 'contract-key',
    role: 'gallery',
    username: world.memberUsername,
    // Account and admin routes (M8-T2's token checks): any id will do, since a token is refused
    // whatever the path names.
    token: 'no-such-link',
    sessionId: NOBODY,
    tokenId: NOBODY,
    userId: NOBODY,
  };
  return values[param];
}

function fill(world: AccessWorld, rows: RowSet, path: string): string {
  return path.replace(/\{([A-Za-z]+)\}/g, (_match, param: string) => {
    const value = valueFor(world, rows, path, param);
    if (value === undefined) throw new Error(`Can't fill {${param}} in ${path}.`);
    return value;
  });
}

const isToken = (role: Role): role is TokenRole => (TOKEN_ROLES as readonly Role[]).includes(role);

const ALLOWED = (status: number) => ![401, 403, 404].includes(status) && status < 500;

async function attempt(
  app: ApiServer,
  world: AccessWorld,
  role: Role,
  op: Operation,
  body: Record<string, unknown> = {},
) {
  const response = await app.inject({
    method: op.method.toUpperCase() as 'GET',
    url: fill(world, world.rows[role], op.path),
    // Browsers send Origin with every write; without it the CSRF check would answer first.
    headers: { ...world.headers[role], ...ORIGIN },
    ...(op.method === 'get' ? {} : { payload: body }),
  });
  // A member removed or a universe left: shared again, so the next request finds it as it was.
  if (op.method !== 'get') await world.restoreMembers();
  return { status: response.statusCode, body: response.body };
}

type Level = 'read' | 'edit' | 'own';

/**
 * What data-model §8 says a route needs, worked out here from the route's method and path, apart
 * from what the route declares, so a route that declares too little fails:
 * - reading needs `read`, except History, exports, the image library, the members list and the
 *   drafts count, which need `edit` (they show drafts, what's not published yet, or who else
 *   is in);
 * - changing anything needs `edit`;
 * - who has access is the owner's (M8-T12): deleting the universe, its members, its share link
 *   and transferring it need `own`, as do its address and visibility (`ownFields`);
 * - leaving needs only `read`: a viewer may leave too.
 */
const UNIVERSE = '/api/v1/universes/{universeId}';
function specLevel(op: Operation): Level {
  if (op.method === 'get') {
    if (op.path === `${UNIVERSE}/members` || op.path === `${UNIVERSE}/drafts`) return 'edit';
    return /\/history|\/export$|\/assets/.test(op.path) ? 'edit' : 'read';
  }
  if (op.method === 'delete' && op.path === UNIVERSE) return 'own';
  if (op.method === 'delete' && op.path === `${UNIVERSE}/membership`) return 'read';
  const sharing = ['/members/{username}', '/share-key', '/transfer'];
  if (sharing.some((tail) => op.path === `${UNIVERSE}${tail}`)) return 'own';
  return 'edit';
}
const OWN_FIELDS: Record<string, readonly string[]> = { [UNIVERSE]: ['slug', 'visibility'] };

/**
 * Whether a route needs someone signed in on the site (architecture.md §7), so that an API
 * token never reaches it, worked out apart from what the route declares: the account's own
 * settings (its devices, password, two-factor codes, storage and tokens), and sharing (who's in, the drafts
 * count shown before making it public, the link, a transfer, leaving), and deleting a universe.
 */
const ACCOUNT_SETTINGS = /^\/api\/v1\/auth\/(sessions|password|two-factor|storage|tokens)/;
function specSession(op: Operation): boolean {
  if (ACCOUNT_SETTINGS.test(op.path)) return true;
  if (op.method === 'delete' && op.path === UNIVERSE) return true;
  const sharing = ['/members', '/members/{username}', '/membership', '/drafts', '/share-key'];
  return [...sharing, '/transfer'].some((tail) => op.path === `${UNIVERSE}${tail}`);
}

/** What each token should get from a universe route needing `level`. */
function expectedOfToken(role: TokenRole, op: Operation, level: Level): 'allowed' | 403 | 404 {
  // The same answer whatever the path names: it tells a token nothing about any universe.
  if (op.access?.session) return 403;
  // The admin edits the owner's private universe (D-50): its token does what the admin does.
  if (role === 'adminToken') return level === 'own' ? 403 : 'allowed';
  // The owner can read it, so there's nothing to hide: the token is for another universe.
  if (role === 'elsewhereToken') return 403;
  if (role === 'readToken') return level === 'read' ? 'allowed' : 403;
  return 'allowed';
}

/** What each token should get from a route about no one universe. */
function unscopedOfToken(role: TokenRole, op: Operation): 'allowed' | 403 | 404 | 'unchecked' {
  const access = op.access;
  if (access?.scope === 'admin') return 404;
  if (op.path === '/api/v1/auth/token') return 'allowed';
  if (op.path.startsWith('/api/v1/auth/') || access?.session) return 403;
  if (access?.scope === 'editor') {
    if (role === 'readToken') return 403;
    if (role === 'elsewhereToken' && access.newUniverse) return 403;
    return 'allowed';
  }
  return 'unchecked';
}

/** What each person should get from a route needing `level`. */
function expected(role: (typeof ROLES)[number], level: Level): 'allowed' | 403 | 404 {
  if (role === 'anonymous' || role === 'stranger') return 404;
  if (role === 'viewer') return level === 'read' ? 'allowed' : 403;
  if (role === 'editor' || role === 'admin') return level === 'own' ? 403 : 'allowed';
  return 'allowed';
}

describe('the access contract (M8-T11)', () => {
  it(
    'holds for every route in the OpenAPI document',
    () =>
      withTestDb(async (db, url) => {
        const app = await authServer(url);
        try {
          const world = await buildAccessWorld(db, app);
          const failures: string[] = [];
          let scoped = 0;
          // Reads, then writes, then deletes, children before parents (the document lists parents
          // first), so a delete never takes away a row a later request needs.
          const all = operationsOf(app);
          const ordered = [
            ...all.filter((op) => op.method !== 'delete'),
            ...all.filter((op) => op.method === 'delete').reverse(),
          ];
          for (const op of ordered) {
            const params = paramsOf(op.path);
            if (Boolean(op.access?.session) !== specSession(op)) {
              failures.push(
                `${op.operationId}: ${op.access?.session ? 'needs' : 'doesn’t need'} a session, architecture.md §7 says the opposite`,
              );
            }
            const unscoped = op.access !== undefined && op.access.scope !== 'universe';
            if (unscoped) {
              // A route about no one universe: what tokens get from it.
              for (const role of TOKEN_ROLES) {
                const want = unscopedOfToken(role, op);
                if (want === 'unchecked') continue;
                const { status, body } = await attempt(app, world, role, op);
                const ok = want === 'allowed' ? ALLOWED(status) : status === want;
                if (!ok)
                  failures.push(
                    `${op.operationId} as ${role}: ${String(status)}, wanted ${String(want)}: ${body.slice(0, 160)}`,
                  );
              }
              continue;
            }
            const unknown = params.filter((param) => !KNOWN_PARAMS.has(param));
            if (unknown.length > 0 || !namesUniverse(op.path)) {
              failures.push(
                `${op.operationId}: can't classify (${unknown.length > 0 ? `unknown {${unknown.join('}, {')}}` : 'names no universe and declares no x-ge-access'})`,
              );
              continue;
            }
            scoped += 1;
            const access = op.access?.scope === 'universe' ? op.access : undefined;
            const declared = access?.level ?? (op.method === 'get' ? 'read' : 'edit');
            const level = specLevel(op);
            if (declared !== level) {
              failures.push(`${op.operationId}: declares ${declared}, data-model §8 says ${level}`);
            }
            const ownFields = op.method === 'patch' ? (OWN_FIELDS[op.path] ?? []) : [];
            const missing = ownFields.filter((field) => !access?.ownFields?.includes(field));
            if (missing.length > 0) {
              failures.push(`${op.operationId}: ${missing.join(', ')} should be the owner's alone`);
            }
            // Tokens before the owner, whose allowed deletes take away rows they name too.
            const roles: Role[] = [...ROLES.filter((r) => r !== 'owner'), ...TOKEN_ROLES, 'owner'];
            for (const role of roles) {
              const { status, body } = await attempt(app, world, role, op);
              const want = isToken(role) ? expectedOfToken(role, op, level) : expected(role, level);
              const ok = want === 'allowed' ? ALLOWED(status) : status === want;
              if (!ok)
                failures.push(
                  `${op.operationId} as ${role}: ${String(status)}, wanted ${String(want)}: ${body.slice(0, 160)}`,
                );
            }
            // Fields only the owner may change, such as a universe's address.
            for (const field of ownFields) {
              for (const role of ['editor', 'admin'] as const) {
                const refused = await attempt(app, world, role, op, { [field]: 'changed' });
                if (refused.status !== 403)
                  failures.push(
                    `${op.operationId} {${field}} as ${role}: ${String(refused.status)}, wanted 403`,
                  );
              }
              const asOwner = await attempt(app, world, 'owner', op, { [field]: 'changed' });
              if (!ALLOWED(asOwner.status))
                failures.push(`${op.operationId} {${field}} as owner: ${String(asOwner.status)}`);
            }
          }
          expect(failures).toEqual([]);
          // The registries' routes are all here: every kind's and settings resource's, and more.
          expect(scoped).toBeGreaterThan(100);
        } finally {
          await app.close();
        }
      }),
    // Every route as ten requesters: a few seconds alone, more beside the other suites.
    60_000,
  );
});
