import { schema, withBatch, type Actor, type Database, type Executor } from '@ge/db';
import { rt, type BaseType } from '@ge/domain';
import { expect } from 'vitest';
import { createEntity } from '../../src/services/entity-service.ts';
import { RuleViolation } from '../../src/services/errors.ts';

export const actor: Actor = { type: 'local', label: 'test' };

/** Runs `fn` as one change batch and returns its result. */
export async function inBatch<T>(db: Database, fn: (tx: Executor) => Promise<T>): Promise<T> {
  return (await withBatch(db, actor, 'test', fn)).result;
}

async function insertId<T extends { id: unknown }>(rows: Promise<T[]>): Promise<string> {
  const [row] = await rows;
  if (!row) throw new Error('Insert returned no row.');
  return row.id as string;
}

/**
 * A universe with the settings rows rules point at, plus a second universe and map for the
 * "elsewhere" cases. Built in one batch.
 */
export async function buildWorld(db: Database) {
  return inBatch(db, async (tx) => {
    const {
      universes,
      maps,
      groupTypes,
      eventCategories,
      objectSubtypes,
      fieldDefinitions,
      assets,
    } = schema;
    const universe = (slug: string) =>
      insertId(
        tx
          .insert(universes)
          .values({ slug, name: rt.plain(slug), namePlain: slug })
          .returning(),
      );
    const map = (universeId: string, slug: string) =>
      insertId(
        tx
          .insert(maps)
          .values({ universeId, slug, name: rt.plain(slug), namePlain: slug })
          .returning(),
      );
    const asset = (universeId: string, sha256: string) => {
      const variant = { key: sha256, width: 1, height: 1 };
      return insertId(
        tx
          .insert(assets)
          .values({
            universeId,
            sha256,
            mimeType: 'image/webp',
            width: 1,
            height: 1,
            byteSize: 1,
            variants: { thumb: variant, display: variant },
          })
          .returning(),
      );
    };

    const universeId = await universe('warhammer');
    const otherUniverseId = await universe('elsewhere');
    const sectorTypeId = await insertId(
      tx
        .insert(groupTypes)
        .values({ universeId, name: 'Sector', layer: 'Administrative', defaultColor: '#c8a24a' })
        .returning(),
    );
    const hiveSubtypeId = await insertId(
      tx
        .insert(objectSubtypes)
        .values({ universeId, baseType: 'planet', name: 'Hive World' })
        .returning(),
    );
    const field = (values: Partial<typeof fieldDefinitions.$inferInsert> & { key: string }) =>
      insertId(
        tx
          .insert(fieldDefinitions)
          .values({
            universeId,
            label: values.key,
            valueType: 'number',
            appliesToKind: 'celestial_object',
            ...values,
          })
          .returning(),
      );

    return {
      universeId,
      mapId: await map(universeId, 'm41'),
      otherMapId: await map(universeId, 'm42'),
      otherUniverseId,
      otherUniverseMapId: await map(otherUniverseId, 'main'),
      sectorTypeId,
      subsectorTypeId: await insertId(
        tx
          .insert(groupTypes)
          .values({
            universeId,
            name: 'Sub-sector',
            layer: 'Administrative',
            parentGroupTypeId: sectorTypeId,
            defaultColor: '#a08040',
          })
          .returning(),
      ),
      factionTypeId: await insertId(
        tx
          .insert(groupTypes)
          .values({ universeId, name: 'Faction', layer: 'Political', defaultColor: '#ff0000' })
          .returning(),
      ),
      regionTypeId: await insertId(
        tx
          .insert(groupTypes)
          .values({ universeId, name: 'Region', layer: 'Geographic', defaultColor: '#00ff00' })
          .returning(),
      ),
      foreignGroupTypeId: await insertId(
        tx
          .insert(groupTypes)
          .values({
            universeId: otherUniverseId,
            name: 'Sector',
            layer: 'Admin',
            defaultColor: '#000000',
          })
          .returning(),
      ),
      categoryId: await insertId(
        tx
          .insert(eventCategories)
          .values({ universeId, name: 'Battle', icon: 'swords', color: '#ff0000' })
          .returning(),
      ),
      foreignCategoryId: await insertId(
        tx
          .insert(eventCategories)
          .values({ universeId: otherUniverseId, name: 'Battle', icon: 'swords', color: '#ff0000' })
          .returning(),
      ),
      hiveSubtypeId,
      foreignSubtypeId: await insertId(
        tx
          .insert(objectSubtypes)
          .values({ universeId: otherUniverseId, baseType: 'planet', name: 'Hive World' })
          .returning(),
      ),
      populationFieldId: await field({ key: 'population' }),
      planetOnlyFieldId: await field({ key: 'gravity', appliesToBaseType: 'planet' }),
      hiveOnlyFieldId: await field({ key: 'tithe', appliesToSubtypeId: hiveSubtypeId }),
      eventFieldId: await field({ key: 'casualties', appliesToKind: 'event' }),
      assetId: await asset(universeId, 'ours'),
      foreignAssetId: await asset(otherUniverseId, 'theirs'),
    };
  });
}

export type World = Awaited<ReturnType<typeof buildWorld>>;

/** Creates an object through the service and returns its id. */
export async function newObject(
  db: Database,
  mapId: string,
  baseType: BaseType,
  extra: {
    parentId?: string | null;
    orbitCenterId?: string | null;
    name?: string;
    explorable?: boolean;
    subtypeId?: string;
  } = {},
): Promise<string> {
  const { name, ...fields } = extra;
  const read = await inBatch(db, (tx) =>
    createEntity(
      tx,
      'celestial_object',
      { mapId },
      { name: rt.plain(name ?? baseType), baseType, ...fields },
    ),
  );
  return read.id;
}

export async function newEntity(
  db: Database,
  kind: 'place' | 'event' | 'character',
  scope: { mapId: string } | { universeId: string },
  name: string = kind,
): Promise<string> {
  const read = await inBatch(db, (tx) => createEntity(tx, kind, scope, { name: rt.plain(name) }));
  return read.id;
}

export async function newGroup(
  db: Database,
  mapId: string,
  groupTypeId: string,
  extra: { parentGroupId?: string | null; name?: string } = {},
): Promise<string> {
  const read = await inBatch(db, (tx) =>
    createEntity(
      tx,
      'group',
      { mapId },
      {
        name: rt.plain(extra.name ?? 'Group'),
        groupTypeId,
        parentGroupId: extra.parentGroupId ?? null,
      },
    ),
  );
  return read.id;
}

/** Expects a RuleViolation, optionally about a given field and with a message matching. */
export async function expectRuleViolation(
  write: Promise<unknown>,
  path?: string,
  message?: RegExp,
): Promise<void> {
  const error: unknown = await write.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error, 'expected a RuleViolation').toBeInstanceOf(RuleViolation);
  if (path !== undefined) expect((error as RuleViolation).path).toBe(path);
  if (message) expect((error as RuleViolation).message).toMatch(message);
}
