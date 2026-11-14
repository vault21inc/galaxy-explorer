import { schema, type Database } from '@ge/db';
import { withTestDb } from '@ge/db/testing';
import { rt } from '@ge/domain';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { addMembers, setLocation } from '../../src/services/aspects/placement.ts';
import { addLink, addRelation, attachImage, setFact } from '../../src/services/aspects/content.ts';
import { getEntity, listEntities } from '../../src/services/entity-read.ts';
import { createEntity, deleteEntity, updateEntity } from '../../src/services/entity-service.ts';
import { NotFound, VersionConflict } from '../../src/services/errors.ts';
import { SEES_EVERYTHING, viewerFor, type Viewer } from '../../src/services/visibility.ts';
import { buildWorld, inBatch, newEntity, newGroup, newObject } from './world.ts';

const anonymous: Viewer = viewerFor(null);

async function setStatus(
  db: Database,
  table: 'entities' | 'maps',
  id: string,
  status: 'draft' | 'published',
) {
  await inBatch(db, (tx) =>
    tx.execute(sql`update ${sql.identifier(table)} set status = ${status} where id = ${id}`),
  );
}

describe('entity service: create and read', () => {
  it('writes the base and extension rows in one batch, cleans HTML, and derives namePlain', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const created = await inBatch(db, (tx) =>
        createEntity(
          tx,
          'celestial_object',
          { mapId: w.mapId },
          {
            name: rt.html('<strong onclick="x()">Gudrun</strong> System'),
            baseType: 'system',
            explorable: true,
            x: 120.5,
          },
        ),
      );
      expect(created).toMatchObject({
        kind: 'celestial_object',
        universeId: w.universeId,
        mapId: w.mapId,
        name: { format: 'html', source: '<strong>Gudrun</strong> System', spoiler: false },
        namePlain: 'Gudrun System',
        baseType: 'system',
        explorable: true,
        x: 120.5,
        y: 0,
        parentId: null,
        appearance: {},
        version: 1,
        isSpoiler: false,
        status: 'published',
      });
      const log = await db.select().from(schema.changeLog);
      expect(log.map((entry) => entry.tableName).filter((t) => t !== 'universes')).toEqual(
        expect.arrayContaining(['entities', 'celestial_objects']),
      );
    }));

  it('fills a group outline color from its type', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const group = await inBatch(db, (tx) =>
        createEntity(
          tx,
          'group',
          { mapId: w.mapId },
          { name: rt.plain('Helican'), groupTypeId: w.sectorTypeId },
        ),
      );
      expect(group.outlineColor).toBe('#c8a24a');
    }));

  it('creates universe-scoped kinds in a universe, with no map', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const character = await inBatch(db, (tx) =>
        createEntity(
          tx,
          'character',
          { universeId: w.universeId },
          { name: rt.plain('Eisenhorn') },
        ),
      );
      expect(character.mapId).toBeNull();
    }));

  it('reports a missing map or entity as NotFound', () =>
    withTestDb(async (db) => {
      await buildWorld(db);
      const missing = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b';
      await expect(
        inBatch(db, (tx) => createEntity(tx, 'place', { mapId: missing }, { name: rt.plain('x') })),
      ).rejects.toBeInstanceOf(NotFound);
      await expect(
        getEntity(db, 'place', missing, { viewer: SEES_EVERYTHING }),
      ).rejects.toBeInstanceOf(NotFound);
    }));

  it('reads an entity only as its own kind', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const place = await newEntity(db, 'place', { mapId: w.mapId });
      await expect(
        getEntity(db, 'event', place, { viewer: SEES_EVERYTHING }),
      ).rejects.toBeInstanceOf(NotFound);
    }));

  it('includes the aspects asked for', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const system = await newObject(db, w.mapId, 'system');
      const event = await newEntity(db, 'event', { mapId: w.mapId });
      const character = await newEntity(db, 'character', { universeId: w.universeId });
      await inBatch(db, async (tx) => {
        await setFact(tx, system, {
          fieldDefinitionId: w.populationFieldId,
          value: { type: 'number', number: 5 },
        });
        await attachImage(tx, system, {
          assetId: w.assetId,
          caption: rt.html('<em>Ruins</em><script>x</script>'),
        });
        await addLink(tx, system, { url: 'https://example.com', label: 'Wiki' });
        await addRelation(tx, character, { relationType: 'participant', toEntityId: event });
        await setLocation(tx, event, { mode: 'object', objectId: system, isSpoiler: true });
      });
      const read = await getEntity(db, 'celestial_object', system, {
        viewer: SEES_EVERYTHING,
        include: ['facts', 'images', 'links', 'relations', 'location'],
      });
      expect(read.facts).toEqual([
        expect.objectContaining({ value: { type: 'number', number: 5 } }),
      ]);
      expect(read.images).toEqual([
        expect.objectContaining({ caption: rt.html('<em>Ruins</em>'), role: 'gallery' }),
      ]);
      expect(read.links).toEqual([
        expect.objectContaining({ url: 'https://example.com', label: 'Wiki' }),
      ]);
      expect(read.relations).toEqual([]);
      expect(read.location).toBeNull();
      const eventRead = await getEntity(db, 'event', event, {
        viewer: SEES_EVERYTHING,
        include: ['relations', 'location'],
      });
      expect(eventRead.relations).toEqual([
        expect.objectContaining({
          fromEntityId: character,
          toEntityId: event,
          relationType: 'participant',
        }),
      ]);
      expect(eventRead.location).toMatchObject({
        mode: 'object',
        objectId: system,
        isSpoiler: true,
        latDeg: null,
      });
      const withoutInclude = await getEntity(db, 'celestial_object', system, {
        viewer: SEES_EVERYTHING,
      });
      expect(withoutInclude).not.toHaveProperty('facts');
    }));

  it('lists group members on request', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const group = await newGroup(db, w.mapId, w.sectorTypeId);
      const system = await newObject(db, w.mapId, 'system');
      await inBatch(db, (tx) => addMembers(tx, group, [{ objectId: system, isSpoiler: true }]));
      await inBatch(db, (tx) => addMembers(tx, group, [{ objectId: system, isSpoiler: false }]));
      const read = await getEntity(db, 'group', group, {
        viewer: SEES_EVERYTHING,
        include: ['members'],
      });
      expect(read.members).toEqual([{ objectId: system, isSpoiler: false }]);
    }));
});

describe('entity service: update and delete', () => {
  it('updates base and extension fields and bumps the version', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const id = await newObject(db, w.mapId, 'system');
      const updated = await inBatch(db, (tx) =>
        updateEntity(tx, 'celestial_object', id, { version: 1, name: rt.md('**New** name'), x: 5 }),
      );
      expect(updated).toMatchObject({
        version: 2,
        namePlain: 'New name',
        x: 5,
        baseType: 'system',
      });
      const onlyExtension = await inBatch(db, (tx) =>
        updateEntity(tx, 'celestial_object', id, { version: 2, y: 7 }),
      );
      expect(onlyExtension).toMatchObject({ version: 3, y: 7, namePlain: 'New name' });
    }));

  it('rejects a stale version with the current record', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const id = await newObject(db, w.mapId, 'system');
      await inBatch(db, (tx) => updateEntity(tx, 'celestial_object', id, { version: 1, x: 1 }));
      const error: unknown = await inBatch(db, (tx) =>
        updateEntity(tx, 'celestial_object', id, { version: 1, x: 2 }),
      ).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(VersionConflict);
      expect((error as VersionConflict).current).toMatchObject({ id, version: 2, x: 1 });
      await expect(
        inBatch(db, (tx) => deleteEntity(tx, 'celestial_object', id, 1)),
      ).rejects.toBeInstanceOf(VersionConflict);
    }));

  it('deletes an object with its whole subtree, but keeps events located there (unplaced)', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const system = await newObject(db, w.mapId, 'system');
      const planet = await newObject(db, w.mapId, 'planet', { parentId: system });
      const moon = await newObject(db, w.mapId, 'moon', { parentId: planet });
      const event = await newEntity(db, 'event', { mapId: w.mapId });
      await inBatch(db, (tx) =>
        setLocation(tx, event, { mode: 'surface', objectId: moon, latDeg: 0, lonDeg: 0 }),
      );

      await inBatch(db, (tx) => deleteEntity(tx, 'celestial_object', system, 1));

      const left = await db
        .select({ id: schema.entities.id })
        .from(schema.entities)
        .where(eq(schema.entities.mapId, w.mapId));
      expect(left.map((row) => row.id)).toEqual([event]);
      expect(await db.select().from(schema.entityLocations)).toEqual([]);
    }));
});

describe('entity service: lists', () => {
  it('filters by extension fields, status and name, and pages with a cursor', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const system = await newObject(db, w.mapId, 'system', { name: 'Gudrun' });
      const planets = [];
      for (const name of ['Gudrun I', 'Gudrun II', 'Gudrun III']) {
        planets.push(await newObject(db, w.mapId, 'planet', { parentId: system, name }));
      }
      await newObject(db, w.otherMapId, 'system', { name: 'Elsewhere' });

      const topLevel = await listEntities(
        db,
        'celestial_object',
        { mapId: w.mapId },
        { viewer: SEES_EVERYTHING, where: { parentId: null }, limit: 10 },
      );
      expect(topLevel.items.map((item) => item.id)).toEqual([system]);

      const page1 = await listEntities(
        db,
        'celestial_object',
        { mapId: w.mapId },
        { viewer: SEES_EVERYTHING, where: { baseType: 'planet' }, limit: 2 },
      );
      expect(page1.items.map((item) => item.id)).toEqual(planets.slice(0, 2));
      const page2 = await listEntities(
        db,
        'celestial_object',
        { mapId: w.mapId },
        {
          viewer: SEES_EVERYTHING,
          where: { baseType: 'planet' },
          limit: 2,
          cursor: page1.nextCursor ?? '',
        },
      );
      expect(page2).toMatchObject({
        items: [expect.objectContaining({ id: planets[2] })],
        nextCursor: null,
      });

      const searched = await listEntities(
        db,
        'celestial_object',
        { mapId: w.mapId },
        { viewer: SEES_EVERYTHING, q: 'ii', limit: 10 },
      );
      expect(searched.items.map((item) => item.namePlain)).toEqual(['Gudrun II', 'Gudrun III']);
      const percent = await listEntities(
        db,
        'celestial_object',
        { mapId: w.mapId },
        { viewer: SEES_EVERYTHING, q: '%', limit: 10 },
      );
      expect(percent.items).toEqual([]);
    }));
});

describe('drafts (data-model §8)', () => {
  it('hides drafts, children of draft objects and everything on a draft map from anonymous readers', () =>
    withTestDb(async (db) => {
      const w = await buildWorld(db);
      const visible = await newObject(db, w.mapId, 'system', { name: 'Visible' });
      const draft = await newObject(db, w.mapId, 'system', { name: 'Draft' });
      const child = await newObject(db, w.mapId, 'planet', {
        parentId: draft,
        name: 'Child of draft',
      });
      const grandchild = await newObject(db, w.mapId, 'moon', {
        parentId: child,
        name: 'Grandchild',
      });
      await setStatus(db, 'entities', draft, 'draft');

      const list = (viewer: Viewer) =>
        listEntities(db, 'celestial_object', { mapId: w.mapId }, { viewer, limit: 10 }).then(
          (page) => page.items.map((item) => item.id),
        );
      expect(await list(anonymous)).toEqual([visible]);
      expect(await list(SEES_EVERYTHING)).toEqual(
        expect.arrayContaining([visible, draft, child, grandchild]),
      );
      await expect(
        getEntity(db, 'celestial_object', grandchild, { viewer: anonymous }),
      ).rejects.toBeInstanceOf(NotFound);

      await setStatus(db, 'maps', w.mapId, 'draft');
      expect(await list(anonymous)).toEqual([]);
      expect(await list(SEES_EVERYTHING)).toHaveLength(4);
    }));

  it('lets only editors ask for drafts (M8-T11)', () => {
    expect(viewerFor(null, { includeDrafts: true })).toEqual({ includeDrafts: false });
    expect(viewerFor('read', { includeDrafts: true })).toEqual({ includeDrafts: false });
    expect(viewerFor('edit', { includeDrafts: true })).toEqual({ includeDrafts: true });
    expect(viewerFor('own', { includeDrafts: true })).toEqual({ includeDrafts: true });
    expect(viewerFor('own')).toEqual({ includeDrafts: false });
  });
});
