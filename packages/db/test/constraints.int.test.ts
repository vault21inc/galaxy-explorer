import { rt } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import {
  assets,
  celestialObjects,
  entityLinks,
  entityLocations,
  groupMembers,
  groupTypes,
  maps,
  objectGroups,
  universes,
} from '../src/schema/index.ts';
import { withTestDb } from '../src/testing/index.ts';
import {
  expectPgError,
  insertEntity,
  insertGroup,
  insertGroupType,
  insertMap,
  insertObject,
  insertUniverse,
  insertUniverseWithMap,
  PG,
} from './fixtures.ts';

/** These tests check constraints, not history, so their writes share one ambient batch. */
const withDb: typeof withTestDb = (fn) => withTestDb(fn, { ambientBatch: true });

// Each test makes the bad write and expects the database to reject it with the right
// constraint (M1-T3). The service layer adds friendlier checks in M1-T5; these are the floor.

describe('same-map references', () => {
  it('rejects a parent object from another map', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      const otherMapId = await insertMap(db, universeId, 'other');
      const system = await insertObject(db, { universeId, mapId: otherMapId });

      await expectPgError(
        insertObject(db, { universeId, mapId, baseType: 'planet', parentId: system }),
        PG.foreignKey,
        'celestial_objects_parent_fk',
      );
      // The same parent in the same map is fine.
      await insertObject(db, {
        universeId,
        mapId: otherMapId,
        baseType: 'planet',
        parentId: system,
      });
    }));

  it('rejects an object that is its own parent', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      const entityId = await insertEntity(db, { universeId, mapId, kind: 'celestial_object' });
      await expectPgError(
        db
          .insert(celestialObjects)
          .values({ entityId, mapId, baseType: 'system', parentId: entityId }),
        PG.check,
        'celestial_objects_not_own_parent',
      );
    }));

  it('rejects an extension row in a different map from its entity', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      const otherMapId = await insertMap(db, universeId, 'other');
      const entityId = await insertEntity(db, { universeId, mapId, kind: 'celestial_object' });
      await expectPgError(
        db.insert(celestialObjects).values({ entityId, mapId: otherMapId, baseType: 'system' }),
        PG.foreignKey,
        'celestial_objects_entity_fk',
      );
    }));
});

describe('group membership', () => {
  it('allows an object in at most one group of each type', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      const sector = await insertGroupType(db, universeId, 'Sector');
      const faction = await insertGroupType(db, universeId, 'Faction');
      const groupA = await insertGroup(db, { universeId, mapId, groupTypeId: sector });
      const groupB = await insertGroup(db, { universeId, mapId, groupTypeId: sector });
      const groupC = await insertGroup(db, { universeId, mapId, groupTypeId: faction });
      const objectId = await insertObject(db, { universeId, mapId });

      await db
        .insert(groupMembers)
        .values({ groupId: groupA, groupTypeId: sector, mapId, objectId });
      await expectPgError(
        db.insert(groupMembers).values({ groupId: groupB, groupTypeId: sector, mapId, objectId }),
        PG.unique,
        'group_members_one_group_per_type_uq',
      );
      // A group of another type is fine.
      await db
        .insert(groupMembers)
        .values({ groupId: groupC, groupTypeId: faction, mapId, objectId });
    }));

  it("rejects a membership that misstates the group's type", () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      const sector = await insertGroupType(db, universeId, 'Sector');
      const faction = await insertGroupType(db, universeId, 'Faction');
      const group = await insertGroup(db, { universeId, mapId, groupTypeId: sector });
      const objectId = await insertObject(db, { universeId, mapId });
      await expectPgError(
        db.insert(groupMembers).values({ groupId: group, groupTypeId: faction, mapId, objectId }),
        PG.foreignKey,
        'group_members_group_type_fk',
      );
    }));

  it('rejects a parent group from another map', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      const otherMapId = await insertMap(db, universeId, 'other');
      const groupTypeId = await insertGroupType(db, universeId);
      const parent = await insertGroup(db, { universeId, mapId: otherMapId, groupTypeId });
      const entityId = await insertEntity(db, { universeId, mapId, kind: 'group' });
      await expectPgError(
        db.insert(objectGroups).values({
          entityId,
          mapId,
          groupTypeId,
          parentGroupId: parent,
          outlineColor: '#c8a24a',
        }),
        PG.foreignKey,
        'object_groups_parent_fk',
      );
    }));
});

describe('locations', () => {
  /** A place entity plus a body and another place to point at. */
  async function setup(db: Parameters<Parameters<typeof withTestDb>[0]>[0]) {
    const { universeId, mapId } = await insertUniverseWithMap(db);
    const entityId = await insertEntity(db, { universeId, mapId, kind: 'place' });
    const body = await insertObject(db, { universeId, mapId, baseType: 'planet' });
    const otherPlace = await insertEntity(db, { universeId, mapId, kind: 'place' });
    return { mapId, entityId, body, otherPlace };
  }

  const point = { x: 1, y: 2, z: 3 };

  it.each([
    [
      'surface',
      (s: Awaited<ReturnType<typeof setup>>) => ({ objectId: s.body, latDeg: 10, lonDeg: 20 }),
    ],
    ['object', (s: Awaited<ReturnType<typeof setup>>) => ({ objectId: s.body })],
    ['space', () => point],
    ['space', (s: Awaited<ReturnType<typeof setup>>) => ({ objectId: s.body, ...point })],
    ['place', (s: Awaited<ReturnType<typeof setup>>) => ({ placeId: s.otherPlace })],
  ] as const)('accepts a valid %s location', (mode, columns) =>
    withDb(async (db) => {
      const s = await setup(db);
      await db
        .insert(entityLocations)
        .values({ entityId: s.entityId, mapId: s.mapId, mode, ...columns(s) });
    }),
  );

  it.each([
    [
      'surface without a latitude',
      'surface',
      (s: Awaited<ReturnType<typeof setup>>) => ({ objectId: s.body, lonDeg: 20 }),
    ],
    ['surface without a body', 'surface', () => ({ latDeg: 10, lonDeg: 20 })],
    [
      'surface with a position too',
      'surface',
      (s: Awaited<ReturnType<typeof setup>>) => ({
        objectId: s.body,
        latDeg: 10,
        lonDeg: 20,
        ...point,
      }),
    ],
    ['object without a body', 'object', () => ({})],
    [
      'object with a latitude',
      'object',
      (s: Awaited<ReturnType<typeof setup>>) => ({ objectId: s.body, latDeg: 10 }),
    ],
    [
      'object with a place',
      'object',
      (s: Awaited<ReturnType<typeof setup>>) => ({ objectId: s.body, placeId: s.otherPlace }),
    ],
    ['space without z', 'space', () => ({ x: 1, y: 2 })],
    ['space with a latitude', 'space', () => ({ ...point, latDeg: 10 })],
    [
      'space with a place',
      'space',
      (s: Awaited<ReturnType<typeof setup>>) => ({ ...point, placeId: s.otherPlace }),
    ],
    ['place without a place', 'place', () => ({})],
    [
      'place with a body',
      'place',
      (s: Awaited<ReturnType<typeof setup>>) => ({ placeId: s.otherPlace, objectId: s.body }),
    ],
    [
      'place with a position',
      'place',
      (s: Awaited<ReturnType<typeof setup>>) => ({ placeId: s.otherPlace, ...point }),
    ],
  ] as const)('rejects %s', (_label, mode, columns) =>
    withDb(async (db) => {
      const s = await setup(db);
      await expectPgError(
        db
          .insert(entityLocations)
          .values({ entityId: s.entityId, mapId: s.mapId, mode, ...columns(s) }),
        PG.check,
        'entity_locations_mode_columns',
      );
    }),
  );

  it.each([
    ['latitude above 90', { latDeg: 91, lonDeg: 0 }, 'entity_locations_lat_range'],
    ['longitude of 180', { latDeg: 0, lonDeg: 180 }, 'entity_locations_lon_range'],
  ])('rejects a %s', (_label, angles, constraint) =>
    withDb(async (db) => {
      const s = await setup(db);
      await expectPgError(
        db.insert(entityLocations).values({
          entityId: s.entityId,
          mapId: s.mapId,
          mode: 'surface',
          objectId: s.body,
          ...angles,
        }),
        PG.check,
        constraint,
      );
    }),
  );

  it('rejects an unknown mode', () =>
    withDb(async (db) => {
      const s = await setup(db);
      await expectPgError(
        db
          .insert(entityLocations)
          .values({ entityId: s.entityId, mapId: s.mapId, mode: 'orbit', ...point }),
        PG.check,
        'entity_locations_mode_check',
      );
    }));
});

describe('entity scope', () => {
  it('rejects a character with a map', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      await expectPgError(
        insertEntity(db, { universeId, mapId, kind: 'character' }),
        PG.check,
        'entities_scope_check',
      );
      await insertEntity(db, { universeId, mapId: null, kind: 'character' });
    }));

  it('rejects a map-scoped entity without a map', () =>
    withDb(async (db) => {
      const universeId = await insertUniverse(db);
      await expectPgError(
        insertEntity(db, { universeId, mapId: null, kind: 'event' }),
        PG.check,
        'entities_scope_check',
      );
    }));

  it('rejects an unknown kind', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      await expectPgError(
        insertEntity(db, { universeId, mapId, kind: 'starship' as 'event' }),
        PG.check,
        'entities_kind_check',
      );
    }));
});

describe('external keys', () => {
  it('are unique per map but may repeat across maps', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      const otherMapId = await insertMap(db, universeId, 'other');
      await insertEntity(db, { universeId, mapId, kind: 'place', externalKey: 'gudrun' });
      await expectPgError(
        insertEntity(db, { universeId, mapId, kind: 'event', externalKey: 'gudrun' }),
        PG.unique,
        'entities_external_key_uq',
      );
      await insertEntity(db, {
        universeId,
        mapId: otherMapId,
        kind: 'place',
        externalKey: 'gudrun',
      });
    }));

  it('are unique per universe for universe-scoped kinds, whose map is null', () =>
    withDb(async (db) => {
      const universeId = await insertUniverse(db);
      const otherUniverseId = await insertUniverse(db, 'other-universe');
      await insertEntity(db, {
        universeId,
        mapId: null,
        kind: 'character',
        externalKey: 'eisenhorn',
      });
      await expectPgError(
        insertEntity(db, { universeId, mapId: null, kind: 'character', externalKey: 'eisenhorn' }),
        PG.unique,
        'entities_external_key_uq',
      );
      await insertEntity(db, {
        universeId: otherUniverseId,
        mapId: null,
        kind: 'character',
        externalKey: 'eisenhorn',
      });
    }));

  it('may be left out on any number of entities', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      await insertEntity(db, { universeId, mapId, kind: 'place' });
      await insertEntity(db, { universeId, mapId, kind: 'place' });
    }));
});

describe('formats', () => {
  it.each(['Warhammer', 'warhammer 40k', 'a--b', '-a', ''])(
    'rejects the universe slug %j',
    (slug) =>
      withDb(async (db) => {
        await expectPgError(
          db.insert(universes).values({ slug, name: rt.plain('x'), namePlain: 'x' }),
          PG.check,
          'universes_slug_format',
        );
      }),
  );

  it('rejects a bad map slug', () =>
    withDb(async (db) => {
      const universeId = await insertUniverse(db);
      await expectPgError(
        db.insert(maps).values({ universeId, slug: 'M41', name: rt.plain('x'), namePlain: 'x' }),
        PG.check,
        'maps_slug_format',
      );
    }));

  it.each(['#FFFFFF', '#fff', 'c8a24a', 'red'])('rejects the color %j', (color) =>
    withDb(async (db) => {
      const universeId = await insertUniverse(db);
      await expectPgError(
        db
          .insert(groupTypes)
          .values({ universeId, name: 'Sector', layer: 'Admin', defaultColor: color }),
        PG.check,
        'group_types_default_color_format',
      );
    }),
  );

  it.each(['javascript:alert(1)', 'ftp://example.com', 'example.com', '/relative'])(
    'rejects the link %j',
    (url) =>
      withDb(async (db) => {
        const { universeId, mapId } = await insertUniverseWithMap(db);
        const entityId = await insertEntity(db, { universeId, mapId, kind: 'place' });
        await expectPgError(
          db.insert(entityLinks).values({ entityId, url }),
          PG.check,
          'entity_links_url_format',
        );
      }),
  );

  it('rejects an asset source URL that is not http(s)', () =>
    withDb(async (db) => {
      const universeId = await insertUniverse(db);
      const variant = { key: 'a', width: 1, height: 1 };
      await expectPgError(
        db.insert(assets).values({
          universeId,
          sha256: 'x',
          mimeType: 'image/webp',
          width: 1,
          height: 1,
          byteSize: 1,
          variants: { thumb: variant, display: variant },
          sourceUrl: 'data:text/html,hi',
        }),
        PG.check,
        'assets_source_url_format',
      );
    }));

  it('accepts well-formed values', () =>
    withDb(async (db) => {
      const { universeId, mapId } = await insertUniverseWithMap(db);
      const entityId = await insertEntity(db, { universeId, mapId, kind: 'place' });
      await db.insert(entityLinks).values({ entityId, url: 'https://example.com/wiki' });
      expect(await insertGroupType(db, universeId)).toBeTruthy();
    }));
});
