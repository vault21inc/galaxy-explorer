import { schema, withBatch, type Database } from '@ge/db';
import { rt } from '@ge/domain';
import type { ApiServer } from '../../src/server.ts';
import { codeFor, makeAccount, ORIGIN, sessionOf, signIn } from '../auth/auth-world.ts';

/**
 * The world the access contract suite (M8-T11) runs in: one private universe, its owner, an
 * editor and a viewer it's shared with, a stranger, and everything a route can name, made
 * through the API as the owner.
 *
 * The editor and the owner each get their own set of rows (a map with one entity of every kind,
 * settings rows, an asset, links and so on): the suite's allowed requests may change or delete
 * what they name, and with separate sets one role's requests never disturb the other's.
 */

export const ROLES = ['anonymous', 'stranger', 'viewer', 'editor', 'owner'] as const;
export type Role = (typeof ROLES)[number];

/** The ids one role's requests name, by path parameter. */
export interface RowSet {
  mapId: string;
  systemId: string;
  planetId: string;
  groupId: string;
  routeId: string;
  placeId: string;
  eventId: string;
  characterId: string;
  groupTypeId: string;
  eventCategoryId: string;
  objectSubtypeId: string;
  fieldDefinitionId: string;
  assetId: string;
  linkId: string;
  relationId: string;
  citationId: string;
  batchId: string;
}

export interface AccessWorld {
  universeId: string;
  /** Each role's `cookie` header (none for anonymous). */
  headers: Record<Role, Record<string, string>>;
  /** The rows each role's requests name: the editor's own set, the owner's for everyone else. */
  rows: Record<Role, RowSet>;
}

type Inject = (method: string, url: string, payload?: unknown) => Promise<Record<string, any>>;

async function rowSet(
  db: Database,
  call: Inject,
  universeId: string,
  name: string,
): Promise<RowSet> {
  const settings = async (resource: string, body: Record<string, unknown>) =>
    (await call('POST', `/universes/${universeId}/${resource}`, body)).data.id as string;
  const groupTypeId = await settings('group-types', {
    name: `${name} sector`,
    layer: 'Administrative',
    defaultColor: '#c8a24a',
  });
  const eventCategoryId = await settings('event-categories', {
    name: `${name} battle`,
    icon: 'lucide:swords',
    color: '#ff0000',
  });
  const objectSubtypeId = await settings('object-subtypes', {
    baseType: 'planet',
    name: `${name} hive`,
  });
  const fieldDefinitionId = await settings('field-definitions', {
    key: `${name}_population`,
    label: 'Population',
    valueType: 'number',
    appliesToKind: 'celestial_object',
  });
  const mapId = (
    await call('POST', `/universes/${universeId}/maps`, { slug: name, name: rt.plain(name) })
  ).data.id as string;

  // An asset straight in the database: the suite needs its row, not an image.
  const { result: assetId } = await withBatch(
    db,
    { type: 'local', label: 'test' },
    'asset',
    async (tx) => {
      const variant = { key: name, width: 1, height: 1 };
      const [row] = await tx
        .insert(schema.assets)
        .values({
          universeId,
          sha256: name,
          mimeType: 'image/webp',
          width: 1,
          height: 1,
          byteSize: 1,
          variants: { thumb: variant, display: variant },
        })
        .returning({ id: schema.assets.id });
      if (!row) throw new Error('No asset.');
      return row.id;
    },
    { universeId },
  );

  const plain = (text: string) => rt.plain(`${name} ${text}`);
  const batch = await call('POST', '/batch', {
    description: `${name}'s rows`,
    operations: [
      {
        op: 'create',
        kind: 'celestial_object',
        mapId,
        data: { name: plain('system'), baseType: 'system', explorable: true },
      },
      {
        op: 'create',
        kind: 'celestial_object',
        mapId,
        data: {
          name: plain('planet'),
          baseType: 'planet',
          parentId: '$op:0',
          explorable: true,
          x: 4,
        },
      },
      { op: 'create', kind: 'group', mapId, data: { name: plain('group'), groupTypeId } },
      { op: 'create', kind: 'route', mapId, data: { name: plain('route') } },
      { op: 'create', kind: 'place', mapId, data: { name: plain('place') } },
      { op: 'create', kind: 'event', mapId, data: { name: plain('event') } },
      { op: 'create', kind: 'character', universeId, data: { name: plain('character') } },
      { op: 'addMembers', id: '$op:2', data: [{ objectId: '$op:0' }] },
      { op: 'setWaypoints', id: '$op:3', data: ['$op:0'] },
      {
        op: 'setLocation',
        id: '$op:5',
        data: { mode: 'surface', objectId: '$op:1', latDeg: 10, lonDeg: 20 },
      },
      {
        op: 'addRelation',
        id: '$op:6',
        data: { relationType: 'participant', toEntityId: '$op:5' },
      },
      { op: 'addLink', id: '$op:1', data: { url: 'https://example.com/', label: 'Example' } },
      {
        op: 'setFacts',
        id: '$op:1',
        data: [{ fieldDefinitionId, value: { type: 'number', number: 5 } }],
      },
      {
        op: 'addCitation',
        id: '$op:1',
        data: {
          target: 'name',
          sourceUrl: 'https://example.com/wiki',
          retrievedAt: '2026-11-14T00:00:00Z',
        },
      },
    ],
  });
  const ids = (batch.data.results as { id: string | null }[]).map((result) => result.id ?? '');
  const [systemId, planetId, groupId, routeId, placeId, eventId, characterId] = ids as [
    string,
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  await call('POST', `/entities/${planetId}/images`, { assetId });
  const first = async (path: string) =>
    ((await call('GET', path)).data as { id: string }[])[0]?.id ?? '';
  // A batch of its own for History's routes: reverting it removes only a throwaway character.
  const throwaway = await call('POST', `/universes/${universeId}/characters`, {
    name: plain('throwaway'),
  });
  return {
    mapId,
    systemId,
    planetId,
    groupId,
    routeId,
    placeId,
    eventId,
    characterId,
    groupTypeId,
    eventCategoryId,
    objectSubtypeId,
    fieldDefinitionId,
    assetId,
    linkId: await first(`/entities/${planetId}/links`),
    relationId: await first(`/entities/${characterId}/relations`),
    citationId: await first(`/entities/${planetId}/citations`),
    batchId: throwaway.batchId as string,
  };
}

export async function buildAccessWorld(db: Database, app: ApiServer): Promise<AccessWorld> {
  const accounts = {
    owner: await makeAccount(db, 'owner'),
    editor: await makeAccount(db, 'editor'),
    viewer: await makeAccount(db, 'viewer'),
    stranger: await makeAccount(db, 'stranger'),
  };
  const headers = { anonymous: {} } as Record<Role, Record<string, string>>;
  for (const [role, account] of Object.entries(accounts) as [
    Exclude<Role, 'anonymous'>,
    (typeof accounts)['owner'],
  ][]) {
    headers[role] = sessionOf(await signIn(app, account, await codeFor(account.secret)));
  }
  const call: Inject = async (method, url, payload) => {
    const response = await app.inject({
      method: method as 'GET',
      url: `/api/v1${url}`,
      headers: { ...headers.owner, ...ORIGIN },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });
    if (response.statusCode >= 300) {
      throw new Error(`${method} ${url}: ${String(response.statusCode)} ${response.body}`);
    }
    return { ...response.json<Record<string, any>>(), batchId: response.headers['x-ge-batch-id'] };
  };

  const universe = await call('POST', '/universes', { slug: 'private', name: rt.plain('Private') });
  const universeId = universe.data.id as string;
  await db.insert(schema.universeMembers).values([
    { universeId, userId: accounts.editor.id, role: 'editor', addedBy: accounts.owner.id },
    { universeId, userId: accounts.viewer.id, role: 'viewer', addedBy: accounts.owner.id },
  ]);
  const ownerRows = await rowSet(db, call, universeId, 'owner');
  const editorRows = await rowSet(db, call, universeId, 'editor');
  return {
    universeId,
    headers,
    rows: {
      anonymous: ownerRows,
      stranger: ownerRows,
      viewer: ownerRows,
      editor: editorRows,
      owner: ownerRows,
    },
  };
}
