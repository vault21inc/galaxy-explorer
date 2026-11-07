import { rt, type EntityKind } from '@ge/domain';
import type { Transaction } from '../src/audit/index.ts';
import {
  assets,
  celestialObjects,
  entities,
  eventCategories,
  events,
  fieldDefinitions,
  groupTypes,
  maps,
  objectGroups,
  objectSubtypes,
  universes,
} from '../src/schema/index.ts';

/**
 * A small universe with one of everything the history tests point at: a map, a system, a
 * place, an event, a character, a group with its type, a subtype, a field definition, an
 * event category and an asset. Built in one batch.
 */
export async function buildWorld(tx: Transaction) {
  const universeId = await insertReturningId(tx, universes, {
    slug: 'world',
    name: rt.plain('World'),
    namePlain: 'World',
  });
  const mapId = await insertReturningId(tx, maps, {
    universeId,
    slug: 'main',
    name: rt.plain('Main'),
    namePlain: 'Main',
  });
  const entity = (kind: EntityKind, scoped = true) =>
    bareEntity(tx, { universeId, mapId: scoped ? mapId : null, kind });

  const systemId = await entity('celestial_object');
  await tx.insert(celestialObjects).values({ entityId: systemId, mapId, baseType: 'system' });
  const groupTypeId = await insertReturningId(tx, groupTypes, {
    universeId,
    name: 'Sector',
    layer: 'Administrative',
    defaultColor: '#c8a24a',
  });
  const groupId = await entity('group');
  await tx
    .insert(objectGroups)
    .values({ entityId: groupId, mapId, groupTypeId, outlineColor: '#c8a24a' });
  const eventId = await entity('event');
  await tx.insert(events).values({ entityId: eventId, mapId });

  return {
    universeId,
    mapId,
    systemId,
    groupTypeId,
    groupId,
    eventId,
    placeId: await entity('place'),
    characterId: await entity('character', false),
    eventCategoryId: await insertReturningId(tx, eventCategories, {
      universeId,
      name: 'Battle',
      icon: 'swords',
      color: '#ff0000',
    }),
    subtypeId: await insertReturningId(tx, objectSubtypes, {
      universeId,
      baseType: 'planet',
      name: 'Hive World',
    }),
    fieldDefinitionId: await insertReturningId(tx, fieldDefinitions, {
      universeId,
      key: 'population',
      label: 'Population',
      valueType: 'number',
      appliesToKind: 'celestial_object',
    }),
    assetId: await insertReturningId(tx, assets, assetValues(universeId, 'world-asset')),
    /** A new entity with no extension row yet, for extension-table tests. */
    bareEntity: (kind: EntityKind) => entity(kind),
  };
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

export async function bareEntity(
  tx: Transaction,
  values: { universeId: string; mapId: string | null; kind: EntityKind },
): Promise<string> {
  return insertReturningId(tx, entities, {
    ...values,
    name: rt.plain(values.kind),
    namePlain: values.kind,
  });
}

export function assetValues(universeId: string, sha256: string) {
  const variant = { key: sha256, width: 64, height: 64 };
  return {
    universeId,
    sha256,
    mimeType: 'image/webp',
    width: 64,
    height: 64,
    byteSize: 100,
    variants: { thumb: variant, display: variant },
  };
}

/** Inserts into any table with an `id` column and returns the new id. */
async function insertReturningId(
  tx: Transaction,
  table:
    | typeof universes
    | typeof maps
    | typeof entities
    | typeof groupTypes
    | typeof eventCategories
    | typeof objectSubtypes
    | typeof fieldDefinitions
    | typeof assets,
  values: Record<string, unknown>,
): Promise<string> {
  const rows = (await tx
    .insert(table)
    .values(values as never)
    .returning()) as { id: string }[];
  const id = rows[0]?.id;
  if (!id) throw new Error('Insert returned no id.');
  return id;
}
