import { withTestDb } from '@ge/db/testing';
import { describe, expect, it } from 'vitest';
import type { RouteAccess } from '../../src/http/access-guard.ts';
import { KNOWN_PARAMS, namesUniverse, paramsOf } from '../../src/http/route-universe.ts';
import type { ApiServer } from '../../src/server.ts';
import { authServer, ORIGIN } from '../auth/auth-world.ts';
import {
  buildAccessWorld,
  ROLES,
  type AccessWorld,
  type Role,
  type RowSet,
} from './access-world.ts';

/**
 * The access contract suite (M8-T11, data-model §8): every route in the OpenAPI document, none
 * listed by hand, tried by each kind of requester on a private universe.
 *
 * - A route whose path names a universe (through a universe, map, entity, settings row, asset
 *   or batch): a stranger and an anonymous visitor get 404; a viewer reads and gets 403 on
 *   writes; an editor writes and gets 403 on what only the owner may do; the owner may do it all.
 * - Any other route must say in its `x-ge-access` that it isn't about one universe.
 * - A route the suite can't classify, or can't fill in, fails it.
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
  return { status: response.statusCode, body: response.body };
}

type Level = 'read' | 'edit' | 'own';

/**
 * What data-model §8 says a route needs, worked out here from the route's method and path, apart
 * from what the route declares, so a route that declares too little fails:
 * - reading needs `read`, except History, exports and the image library, which need `edit`
 *   (they show drafts, or what's not published yet);
 * - changing anything needs `edit`;
 * - deleting the universe itself needs `own`, as do its address and visibility (`ownFields`).
 */
function specLevel(op: Operation): Level {
  if (op.method === 'get') return /\/history|\/export$|\/assets/.test(op.path) ? 'edit' : 'read';
  if (op.method === 'delete' && op.path === '/api/v1/universes/{universeId}') return 'own';
  return 'edit';
}
const OWN_FIELDS: Record<string, readonly string[]> = {
  '/api/v1/universes/{universeId}': ['slug', 'visibility'],
};

/** What each role should get from a route needing `level`. */
function expected(role: Role, level: 'read' | 'edit' | 'own'): 'allowed' | 403 | 404 {
  if (role === 'anonymous' || role === 'stranger') return 404;
  if (role === 'viewer') return level === 'read' ? 'allowed' : 403;
  if (role === 'editor') return level === 'own' ? 403 : 'allowed';
  return 'allowed';
}

describe('the access contract (M8-T11)', () => {
  it('holds for every route in the OpenAPI document', () =>
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
          const unscoped = op.access !== undefined && op.access.scope !== 'universe';
          if (unscoped) continue;
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
          for (const role of ROLES) {
            const { status, body } = await attempt(app, world, role, op);
            const want = expected(role, level);
            const ok = want === 'allowed' ? ALLOWED(status) : status === want;
            if (!ok)
              failures.push(
                `${op.operationId} as ${role}: ${String(status)}, wanted ${String(want)}: ${body.slice(0, 160)}`,
              );
          }
          // Fields only the owner may change, such as a universe's address.
          for (const field of ownFields) {
            const asEditor = await attempt(app, world, 'editor', op, { [field]: 'changed' });
            if (asEditor.status !== 403)
              failures.push(
                `${op.operationId} {${field}} as editor: ${String(asEditor.status)}, wanted 403`,
              );
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
    }));
});
