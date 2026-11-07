import { describe, expect, expectTypeOf, it } from 'vitest';
import type { z } from 'zod';
import { configSchemasFor, schemasFor } from '../src/registry/index.ts';
import { rt } from '../src/richtext/index.ts';

const UUID = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b';
const NOW = '2026-11-07T12:00:00.000Z';

describe('schemasFor (entity kinds)', () => {
  const objects = schemasFor('celestial_object');

  it('create needs the base and extension fields that have no default', () => {
    expect(objects.create.safeParse({ name: rt.plain('Gudrun'), baseType: 'system' }).success).toBe(
      true,
    );
    expect(objects.create.safeParse({ name: rt.plain('Gudrun') }).success).toBe(false);
    expect(objects.create.safeParse({ baseType: 'system' }).success).toBe(false);
  });

  it('create rejects unknown fields and invalid values', () => {
    const base = { name: rt.plain('Gudrun'), baseType: 'system' };
    expect(objects.create.safeParse({ ...base, colour: '#fff' }).success).toBe(false);
    expect(objects.create.safeParse({ ...base, baseType: 'comet' }).success).toBe(false);
    expect(objects.create.safeParse({ ...base, appearance: { color: '#FFF' } }).success).toBe(
      false,
    );
  });

  it('update needs the version and nothing else, and adds no defaults', () => {
    expect(objects.update.parse({ version: 3, x: 10 })).toEqual({ version: 3, x: 10 });
    expect(objects.update.safeParse({ x: 10 }).success).toBe(false);
    expect(objects.update.safeParse({ version: 3, colour: 'red' }).success).toBe(false);
  });

  it('read has every field, plus the server-side ones', () => {
    const row = {
      id: UUID,
      kind: 'celestial_object',
      universeId: UUID,
      mapId: UUID,
      name: rt.plain('Gudrun'),
      namePlain: 'Gudrun',
      summary: null,
      description: null,
      isSpoiler: false,
      status: 'published',
      externalKey: null,
      clonedFromEntityId: null,
      version: 1,
      createdAt: NOW,
      updatedAt: NOW,
      parentId: null,
      baseType: 'system',
      subtypeId: null,
      explorable: true,
      x: 1,
      y: 2,
      z: 3,
      appearance: {},
    };
    expect(objects.read.safeParse(row).success).toBe(true);
    const withoutAppearance: Partial<typeof row> = { ...row };
    delete withoutAppearance.appearance;
    expect(objects.read.safeParse(withoutAppearance).success).toBe(false);
    expect(objects.read.safeParse({ ...row, kind: 'event' }).success).toBe(false);
  });

  it('types the read schema per kind', () => {
    type ObjectRead = z.infer<typeof objects.read>;
    expectTypeOf<ObjectRead['kind']>().toEqualTypeOf<'celestial_object'>();
    expectTypeOf<ObjectRead['mapId']>().toEqualTypeOf<z.infer<typeof objects.read.shape.id>>();
    type CharacterRead = z.infer<ReturnType<typeof schemasFor<'character'>>['read']>;
    expectTypeOf<CharacterRead['mapId']>().toEqualTypeOf<null>();
  });

  it('kinds without an extension table have just the base fields', () => {
    const places = schemasFor('place');
    expect(Object.keys(places.create.shape).sort()).toEqual(
      ['description', 'externalKey', 'isSpoiler', 'name', 'status', 'summary'].sort(),
    );
  });

  it('events carry their date fields', () => {
    const events = schemasFor('event');
    expect(
      events.create.parse({ name: rt.plain('Fall'), dateText: '240.M41', dateSort: 240.41 }),
    ).toMatchObject({
      dateText: '240.M41',
    });
  });
});

describe('configSchemasFor (config resources)', () => {
  it('derives create, update and read the same way, without a version', () => {
    const groupTypes = configSchemasFor('group_types');
    const created = { name: 'Sector', layer: 'Administrative', defaultColor: '#c8a24a' };
    expect(groupTypes.create.safeParse(created).success).toBe(true);
    expect(groupTypes.create.safeParse({ ...created, extra: 1 }).success).toBe(false);
    expect(groupTypes.update.parse({ layer: 'Political' })).toEqual({ layer: 'Political' });
    const read = { ...created, id: UUID, universeId: UUID, parentGroupTypeId: null, sortKey: 0 };
    expect(groupTypes.read.safeParse(read).success).toBe(true);
  });

  it('validates field definition keys and value types', () => {
    const fields = configSchemasFor('field_definitions');
    const valid = {
      key: 'population',
      label: 'Population',
      valueType: 'number',
      appliesToKind: 'celestial_object',
    };
    expect(fields.create.safeParse(valid).success).toBe(true);
    expect(fields.create.safeParse({ ...valid, key: 'Population' }).success).toBe(false);
    expect(fields.create.safeParse({ ...valid, valueType: 'boolean' }).success).toBe(false);
    expect(fields.create.safeParse({ ...valid, appliesToKind: 'route' }).success).toBe(false);
  });
});
