import { schema, type Database, type Executor } from '@ge/db';
import { rt } from '@ge/domain';
import { withTestDb } from '@ge/db/testing';
import { eq, sql } from 'drizzle-orm';
import { describe, it } from 'vitest';
import { addMembers, setLocation } from '../../src/services/aspects/placement.ts';
import { addRelation, attachImage, setFact } from '../../src/services/aspects/content.ts';
import { createEntity, updateEntity } from '../../src/services/entity-service.ts';
import { getEntity } from '../../src/services/entity-read.ts';
import { SEES_EVERYTHING } from '../../src/services/visibility.ts';
import {
  buildWorld,
  expectRuleViolation,
  inBatch,
  newEntity,
  newGroup,
  newObject,
  type World,
} from './world.ts';

/**
 * One row per rule (M1-T5): `allowed` must succeed and `rejected` must fail with a
 * RuleViolation about `path`. Both run against a fresh database with the same world.
 */
interface RuleCase {
  rule: string;
  allowed: (db: Database, w: World) => Promise<unknown>;
  rejected: (db: Database, w: World) => Promise<unknown>;
  path?: string;
  message?: RegExp;
}

const version = async (
  db: Database,
  id: string,
  kind: 'celestial_object' | 'group' = 'celestial_object',
) => (await getEntity(db, kind, id, { viewer: SEES_EVERYTHING })).version;

const cases: RuleCase[] = [
  // ---- objects ----
  {
    rule: "an object's parent has a type its base type allows",
    allowed: async (db, w) =>
      newObject(db, w.mapId, 'planet', { parentId: await newObject(db, w.mapId, 'system') }),
    rejected: async (db, w) =>
      newObject(db, w.mapId, 'moon', { parentId: await newObject(db, w.mapId, 'system') }),
    path: '/parentId',
    message: /can't be inside a system/,
  },
  {
    rule: "'map' (no parent) only for types allowed at the top level",
    allowed: (db, w) => newObject(db, w.mapId, 'system'),
    rejected: (db, w) => newObject(db, w.mapId, 'star'),
    path: '/parentId',
    message: /can't be at the top level/,
  },
  {
    rule: 'the parent is on the same map',
    allowed: async (db, w) =>
      newObject(db, w.mapId, 'planet', { parentId: await newObject(db, w.mapId, 'system') }),
    rejected: async (db, w) =>
      newObject(db, w.mapId, 'planet', { parentId: await newObject(db, w.otherMapId, 'system') }),
    path: '/parentId',
    message: /another map/,
  },
  {
    rule: 'children stay allowed when the base type changes',
    allowed: async (db, w) => {
      const id = await newObject(db, w.mapId, 'planet');
      return inBatch(db, async (tx) =>
        updateEntity(tx, 'celestial_object', id, {
          version: await version(db, id),
          baseType: 'black_hole',
        }),
      );
    },
    rejected: async (db, w) => {
      const system = await newObject(db, w.mapId, 'system');
      await newObject(db, w.mapId, 'planet', { parentId: system });
      return inBatch(db, async (tx) =>
        updateEntity(tx, 'celestial_object', system, {
          version: await version(db, system),
          baseType: 'black_hole',
        }),
      );
    },
    path: '/baseType',
  },
  {
    rule: 'explorable only for types that open a view',
    allowed: (db, w) => newObject(db, w.mapId, 'planet', { explorable: true }),
    rejected: (db, w) => newObject(db, w.mapId, 'black_hole', { explorable: true }),
    path: '/explorable',
  },
  {
    rule: "the subtype is this universe's and refines this base type",
    allowed: (db, w) => newObject(db, w.mapId, 'planet', { subtypeId: w.hiveSubtypeId }),
    rejected: (db, w) => newObject(db, w.mapId, 'planet', { subtypeId: w.foreignSubtypeId }),
    path: '/subtypeId',
  },
  {
    rule: 'a subtype of another base type is rejected',
    allowed: (db, w) => newObject(db, w.mapId, 'planet', { subtypeId: w.hiveSubtypeId }),
    rejected: (db, w) => newObject(db, w.mapId, 'black_hole', { subtypeId: w.hiveSubtypeId }),
    path: '/subtypeId',
    message: /subtype of planet/,
  },
  // ---- groups ----
  {
    rule: "the group type is this universe's",
    allowed: (db, w) => newGroup(db, w.mapId, w.sectorTypeId),
    rejected: (db, w) => newGroup(db, w.mapId, w.foreignGroupTypeId),
    path: '/groupTypeId',
  },
  {
    rule: "group types nest: a Sub-sector's parent is a Sector",
    allowed: async (db, w) =>
      newGroup(db, w.mapId, w.subsectorTypeId, {
        parentGroupId: await newGroup(db, w.mapId, w.sectorTypeId),
      }),
    rejected: async (db, w) =>
      newGroup(db, w.mapId, w.subsectorTypeId, {
        parentGroupId: await newGroup(db, w.mapId, w.factionTypeId),
      }),
    path: '/parentGroupId',
    message: /must be a Sector/,
  },
  {
    rule: 'a top-level group type has no parent group',
    allowed: (db, w) => newGroup(db, w.mapId, w.sectorTypeId),
    rejected: async (db, w) =>
      newGroup(db, w.mapId, w.sectorTypeId, {
        parentGroupId: await newGroup(db, w.mapId, w.sectorTypeId),
      }),
    path: '/parentGroupId',
  },
  {
    rule: 'the parent group is on the same map',
    allowed: async (db, w) =>
      newGroup(db, w.mapId, w.subsectorTypeId, {
        parentGroupId: await newGroup(db, w.mapId, w.sectorTypeId),
      }),
    rejected: async (db, w) =>
      newGroup(db, w.mapId, w.subsectorTypeId, {
        parentGroupId: await newGroup(db, w.otherMapId, w.sectorTypeId),
      }),
    path: '/parentGroupId',
  },
  {
    rule: "a group can't end up inside its own subgroup",
    allowed: async (db, w) => {
      await inBatch(db, (tx) => updateEntityType(tx, w.regionTypeId, w.regionTypeId));
      return newGroup(db, w.mapId, w.regionTypeId, {
        parentGroupId: await newGroup(db, w.mapId, w.regionTypeId),
      });
    },
    rejected: async (db, w) => {
      await inBatch(db, (tx) => updateEntityType(tx, w.regionTypeId, w.regionTypeId));
      const outer = await newGroup(db, w.mapId, w.regionTypeId);
      await newGroup(db, w.mapId, w.regionTypeId, { parentGroupId: outer });
      const inner = await newGroup(db, w.mapId, w.regionTypeId, { parentGroupId: outer });
      return inBatch(db, async (tx) =>
        updateEntity(tx, 'group', outer, {
          version: await version(db, outer, 'group'),
          parentGroupId: inner,
        }),
      );
    },
    path: '/parentGroupId',
    message: /inside itself/,
  },
  {
    rule: 'an object is in one group of each type, and the message names the current group',
    allowed: async (db, w) => {
      const object = await newObject(db, w.mapId, 'system', { name: 'Gudrun' });
      await inBatch(db, async (tx) =>
        addMembers(tx, await newGroup(db, w.mapId, w.sectorTypeId, { name: 'Helican' }), [
          { objectId: object },
        ]),
      );
      return inBatch(db, async (tx) =>
        addMembers(tx, await newGroup(db, w.mapId, w.factionTypeId), [{ objectId: object }]),
      );
    },
    rejected: async (db, w) => {
      const object = await newObject(db, w.mapId, 'system', { name: 'Gudrun' });
      await inBatch(db, async (tx) =>
        addMembers(tx, await newGroup(db, w.mapId, w.sectorTypeId, { name: 'Helican' }), [
          { objectId: object },
        ]),
      );
      return inBatch(db, async (tx) =>
        addMembers(tx, await newGroup(db, w.mapId, w.sectorTypeId, { name: 'Antian' }), [
          { objectId: object },
        ]),
      );
    },
    path: '/0/objectId',
    message: /Gudrun is already in Helican, another Sector/,
  },
  {
    rule: 'members are top-level objects on the same map',
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        addMembers(tx, await newGroup(db, w.mapId, w.sectorTypeId), [
          { objectId: await newObject(db, w.mapId, 'system') },
        ]),
      ),
    rejected: async (db, w) => {
      const planet = await newObject(db, w.mapId, 'planet', {
        parentId: await newObject(db, w.mapId, 'system'),
      });
      return inBatch(db, async (tx) =>
        addMembers(tx, await newGroup(db, w.mapId, w.sectorTypeId), [{ objectId: planet }]),
      );
    },
    path: '/0/objectId',
    message: /isn't a top-level object/,
  },
  {
    rule: "changing a group's type keeps members in one group per type",
    allowed: async (db, w) => {
      const group = await newGroup(db, w.mapId, w.sectorTypeId);
      await inBatch(db, async (tx) =>
        addMembers(tx, group, [{ objectId: await newObject(db, w.mapId, 'system') }]),
      );
      return inBatch(db, async (tx) =>
        updateEntity(tx, 'group', group, {
          version: await version(db, group, 'group'),
          groupTypeId: w.factionTypeId,
        }),
      );
    },
    rejected: async (db, w) => {
      const object = await newObject(db, w.mapId, 'system');
      const sector = await newGroup(db, w.mapId, w.sectorTypeId);
      await inBatch(db, async (tx) => addMembers(tx, sector, [{ objectId: object }]));
      await inBatch(db, async (tx) =>
        addMembers(tx, await newGroup(db, w.mapId, w.factionTypeId), [{ objectId: object }]),
      );
      return inBatch(db, async (tx) =>
        updateEntity(tx, 'group', sector, {
          version: await version(db, sector, 'group'),
          groupTypeId: w.factionTypeId,
        }),
      );
    },
    path: '/groupTypeId',
  },
  // ---- events ----
  {
    rule: "an event's category is this universe's",
    allowed: (db, w) =>
      inBatch(db, (tx) =>
        createEntity(
          tx,
          'event',
          { mapId: w.mapId },
          { name: rt.plain('Siege'), categoryId: w.categoryId },
        ),
      ),
    rejected: (db, w) =>
      inBatch(db, (tx) =>
        createEntity(
          tx,
          'event',
          { mapId: w.mapId },
          { name: rt.plain('Siege'), categoryId: w.foreignCategoryId },
        ),
      ),
    path: '/categoryId',
  },
  // ---- relations ----
  {
    rule: 'relation ends are kinds the relation type allows',
    allowed: async (db, w) => {
      const character = await newEntity(db, 'character', { universeId: w.universeId });
      return inBatch(db, async (tx) =>
        addRelation(tx, character, {
          relationType: 'participant',
          toEntityId: await newEntity(db, 'event', { mapId: w.mapId }),
        }),
      );
    },
    rejected: async (db, w) => {
      const event = await newEntity(db, 'event', { mapId: w.mapId });
      return inBatch(db, async (tx) =>
        addRelation(tx, event, {
          relationType: 'participant',
          toEntityId: await newEntity(db, 'character', { universeId: w.universeId }),
        }),
      );
    },
    path: '/relationType',
  },
  {
    rule: 'relation ends are in the same universe',
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        addRelation(tx, await newEntity(db, 'place', { mapId: w.mapId }), {
          relationType: 'related',
          toEntityId: await newEntity(db, 'place', { mapId: w.otherMapId }),
        }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        addRelation(tx, await newEntity(db, 'place', { mapId: w.mapId }), {
          relationType: 'related',
          toEntityId: await newEntity(db, 'place', { mapId: w.otherUniverseMapId }),
        }),
      ),
    path: '/toEntityId',
  },
  {
    rule: "an entity isn't related to itself",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        addRelation(tx, await newEntity(db, 'place', { mapId: w.mapId }), {
          relationType: 'related',
          toEntityId: await newEntity(db, 'place', { mapId: w.mapId }),
        }),
      ),
    rejected: async (db, w) => {
      const place = await newEntity(db, 'place', { mapId: w.mapId });
      return inBatch(db, (tx) =>
        addRelation(tx, place, { relationType: 'related', toEntityId: place }),
      );
    },
    path: '/toEntityId',
  },
  // ---- locations ----
  {
    rule: 'only kinds with a location aspect have one',
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'event', { mapId: w.mapId }), {
          mode: 'object',
          objectId: await newObject(db, w.mapId, 'system'),
        }),
      ),
    rejected: async (db, w) => {
      const group = await newGroup(db, w.mapId, w.sectorTypeId);
      return inBatch(db, async (tx) =>
        setLocation(tx, group, {
          mode: 'object',
          objectId: await newObject(db, w.mapId, 'system'),
        }),
      );
    },
    message: /can't have a location/,
  },
  {
    rule: "'surface' is on a planet or moon",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'place', { mapId: w.mapId }), {
          mode: 'surface',
          objectId: await newObject(db, w.mapId, 'planet'),
          latDeg: 10,
          lonDeg: 20,
        }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'place', { mapId: w.mapId }), {
          mode: 'surface',
          objectId: await newObject(db, w.mapId, 'system'),
          latDeg: 10,
          lonDeg: 20,
        }),
      ),
    path: '/objectId',
    message: /no surface/,
  },
  {
    rule: "'space' is in a system's frame (or the galaxy's)",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'event', { mapId: w.mapId }), {
          mode: 'space',
          objectId: await newObject(db, w.mapId, 'system'),
          x: 1,
          y: 2,
          z: 3,
        }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'event', { mapId: w.mapId }), {
          mode: 'space',
          objectId: await newObject(db, w.mapId, 'planet'),
          x: 1,
          y: 2,
          z: 3,
        }),
      ),
    path: '/objectId',
  },
  {
    rule: "'object' is at an object on the same map",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'event', { mapId: w.mapId }), {
          mode: 'object',
          objectId: await newObject(db, w.mapId, 'station'),
        }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'event', { mapId: w.mapId }), {
          mode: 'object',
          objectId: await newObject(db, w.otherMapId, 'station'),
        }),
      ),
    path: '/objectId',
  },
  {
    rule: "'place' targets a place",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'event', { mapId: w.mapId }), {
          mode: 'place',
          placeId: await newEntity(db, 'place', { mapId: w.mapId }),
        }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'event', { mapId: w.mapId }), {
          mode: 'place',
          placeId: await newEntity(db, 'event', { mapId: w.mapId }),
        }),
      ),
    path: '/placeId',
    message: /not a place/,
  },
  {
    rule: "a place isn't located at itself",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setLocation(tx, await newEntity(db, 'place', { mapId: w.mapId }), {
          mode: 'place',
          placeId: await newEntity(db, 'place', { mapId: w.mapId }),
        }),
      ),
    rejected: async (db, w) => {
      const place = await newEntity(db, 'place', { mapId: w.mapId });
      return inBatch(db, (tx) => setLocation(tx, place, { mode: 'place', placeId: place }));
    },
    path: '/placeId',
  },
  // ---- facts ----
  {
    rule: "a fact's field applies to the entity's kind",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setFact(tx, await newObject(db, w.mapId, 'system'), {
          fieldDefinitionId: w.populationFieldId,
          value: { type: 'number', number: 5 },
        }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        setFact(tx, await newEntity(db, 'place', { mapId: w.mapId }), {
          fieldDefinitionId: w.populationFieldId,
          value: { type: 'number', number: 5 },
        }),
      ),
    path: '/fieldDefinitionId',
  },
  {
    rule: "a fact's field applies to the object's base type",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setFact(tx, await newObject(db, w.mapId, 'planet'), {
          fieldDefinitionId: w.planetOnlyFieldId,
          value: { type: 'number', number: 1 },
        }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        setFact(tx, await newObject(db, w.mapId, 'system'), {
          fieldDefinitionId: w.planetOnlyFieldId,
          value: { type: 'number', number: 1 },
        }),
      ),
    path: '/fieldDefinitionId',
  },
  {
    rule: "a fact's field applies to the object's subtype",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setFact(tx, await newObject(db, w.mapId, 'planet', { subtypeId: w.hiveSubtypeId }), {
          fieldDefinitionId: w.hiveOnlyFieldId,
          value: { type: 'number', number: 1 },
        }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        setFact(tx, await newObject(db, w.mapId, 'planet'), {
          fieldDefinitionId: w.hiveOnlyFieldId,
          value: { type: 'number', number: 1 },
        }),
      ),
    path: '/fieldDefinitionId',
  },
  {
    rule: "a fact's value has the field's type",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        setFact(tx, await newObject(db, w.mapId, 'system'), {
          fieldDefinitionId: w.populationFieldId,
          value: { type: 'number', number: 5 },
        }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        setFact(tx, await newObject(db, w.mapId, 'system'), {
          fieldDefinitionId: w.populationFieldId,
          value: { type: 'text', text: rt.plain('five') },
        }),
      ),
    path: '/value/type',
  },
  // ---- images ----
  {
    rule: "an image's asset is this universe's",
    allowed: async (db, w) =>
      inBatch(db, async (tx) =>
        attachImage(tx, await newObject(db, w.mapId, 'system'), { assetId: w.assetId }),
      ),
    rejected: async (db, w) =>
      inBatch(db, async (tx) =>
        attachImage(tx, await newObject(db, w.mapId, 'system'), { assetId: w.foreignAssetId }),
      ),
    path: '/assetId',
  },
  // ---- drafts ----
  {
    rule: "writes into a draft map aren't blocked",
    allowed: async (db, w) => {
      await inBatch(db, (tx) => tx.execute(draftMap(w.mapId)));
      return newObject(db, w.mapId, 'system');
    },
    rejected: async (db, w) => {
      await inBatch(db, (tx) => tx.execute(draftMap(w.mapId)));
      return newObject(db, w.mapId, 'star');
    },
    path: '/parentId',
  },
];

const draftMap = (mapId: string) => sql`update maps set status = 'draft' where id = ${mapId}`;

/** Lets a group type nest inside itself (a Region inside a Region), for the cycle case. */
function updateEntityType(tx: Executor, typeId: string, parentTypeId: string) {
  return tx
    .update(schema.groupTypes)
    .set({ parentGroupTypeId: parentTypeId })
    .where(eq(schema.groupTypes.id, typeId));
}

describe('service rules (table-driven)', () => {
  describe.each(cases)('$rule', ({ allowed, rejected, path, message }) => {
    it('allows the valid case', () =>
      withTestDb(async (db) => {
        await allowed(db, await buildWorld(db));
      }));

    it('rejects the invalid case with a RuleViolation', () =>
      withTestDb(async (db) => {
        await expectRuleViolation(rejected(db, await buildWorld(db)), path, message);
      }));
  });
});
