import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  csvObjects,
  ENTITY_RECORD_SCHEMAS,
  exportJsonSchema,
  MapFile,
  parseCsv,
  RefAllocator,
  slugRef,
  UniverseFile,
  withRefs,
} from '../src/export/index.ts';
import { Uuid } from '../src/ids.ts';
import {
  CONFIG_RESOURCES,
  configResources,
  ENTITY_KINDS,
  entityKinds,
  SETTINGS_TARGETS,
  type ConfigResourceDef,
  type EntityKindDef,
} from '../src/registry/index.ts';
import { rt } from '../src/richtext/schema.ts';

/** The export format and CSV import (M7-T4). */

/** Whether a field holds an id, under its optional and nullable wrapping. */
function isIdField(schema: z.ZodType): boolean {
  let inner: z.ZodType = schema;
  while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) {
    inner = inner.unwrap() as z.ZodType;
  }
  return (
    inner.safeParse('019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b').success && !inner.safeParse('x').success
  );
}

describe('the registries’ references', () => {
  it('name every id field of every kind and settings resource', () => {
    for (const kind of ENTITY_KINDS) {
      const def: EntityKindDef = entityKinds[kind];
      const shape = (def.extension?.shape ?? {}) as Record<string, z.ZodType>;
      const ids = Object.keys(shape).filter((field) => isIdField(shape[field] ?? z.never()));
      expect(Object.keys(def.references ?? {}).sort(), kind).toEqual(ids.sort());
    }
    for (const resource of CONFIG_RESOURCES) {
      const def: ConfigResourceDef = configResources[resource];
      const shape = def.schema.shape as Record<string, z.ZodType>;
      const ids = Object.keys(shape).filter((field) => isIdField(shape[field] ?? z.never()));
      expect(Object.keys(def.references ?? {}).sort(), resource).toEqual(ids.sort());
      for (const field of def.naturalKey) expect(shape, resource).toHaveProperty(field);
    }
  });

  it('list the settings resources as the registry has them', () => {
    expect([...SETTINGS_TARGETS].sort()).toEqual([...CONFIG_RESOURCES].sort());
  });
});

describe('references', () => {
  it('swap id fields for refs, keeping whether they are optional or nullable', () => {
    const schema = withRefs(
      z.strictObject({ parentId: Uuid.nullable().optional(), typeId: Uuid, name: z.string() }),
      { parentId: 'entity', typeId: 'group_types' },
    );
    expect(Object.keys(schema.shape)).toEqual(['parent', 'type', 'name']);
    expect(schema.safeParse({ type: 'Sector', name: 'a' }).success).toBe(true);
    expect(schema.safeParse({ parent: null, type: 'Sector', name: 'a' }).success).toBe(true);
    expect(schema.safeParse({ name: 'a' }).success).toBe(false);
    expect(schema.safeParse({ typeId: 'x', type: 'Sector', name: 'a' }).success).toBe(false);
  });

  it('are made from names, never taking a key, and numbered when a name repeats', () => {
    expect(slugRef('Gudrun Prime', 'entry')).toBe('gudrun-prime');
    expect(slugRef('Ætheria’s Gate', 'entry')).toBe('therias-gate');
    expect(slugRef('Ñuñoa', 'entry')).toBe('nunoa');
    expect(slugRef('!!!', 'entry')).toBe('entry');
    const refs = new RefAllocator();
    expect(refs.reserve('gudrun')).toBe(true);
    expect(refs.reserve('gudrun')).toBe(false);
    expect(refs.take('gudrun')).toBe('gudrun-2');
    expect(refs.take('gudrun')).toBe('gudrun-3');
    expect(refs.take('hubris')).toBe('hubris');
  });
});

describe('the files', () => {
  it('read a hand-written map file, refs and all', () => {
    const file = {
      map: { slug: 'main', name: rt.plain('Main') },
      objects: [
        { externalKey: 'gudrun-system', name: rt.plain('Gudrun System'), baseType: 'system' },
        {
          ref: 'gudrun',
          name: rt.plain('Gudrun'),
          baseType: 'planet',
          parent: 'gudrun-system',
          subtype: 'Hive World',
          facts: [{ field: 'population', value: { type: 'number', number: 5 } }],
        },
      ],
      groups: [
        {
          externalKey: 'helican',
          name: rt.plain('Helican'),
          groupType: 'Sub-sector',
          members: [{ object: 'gudrun-system' }],
        },
      ],
      relations: [{ from: 'eisenhorn', to: 'gudrun', relationType: 'related' }],
    };
    expect(MapFile.safeParse(file).error).toBeUndefined();
    // An id where a reference goes is a mistake the schema names.
    const wrong = { ...file, objects: [{ ...file.objects[1], parentId: 'x' }] };
    expect(MapFile.safeParse(wrong).success).toBe(false);
  });

  it('give each kind its aspects and nothing more', () => {
    const route = Object.keys(ENTITY_RECORD_SCHEMAS.route.shape);
    expect(route).toContain('waypoints');
    expect(route).not.toContain('members');
    expect(Object.keys(ENTITY_RECORD_SCHEMAS.place.shape)).toContain('location');
    expect(Object.keys(ENTITY_RECORD_SCHEMAS.celestial_object.shape)).not.toContain('location');
    expect(Object.keys(UniverseFile.shape)).toEqual(
      expect.arrayContaining([
        'universe',
        'assets',
        'groupTypes',
        'fieldDefinitions',
        'characters',
      ]),
    );
  });

  it('publish a JSON Schema', () => {
    const schema = exportJsonSchema();
    expect(schema).toMatchObject({ type: 'object' });
    expect(JSON.stringify(schema)).toContain('externalKey');
  });
});

describe('CSV', () => {
  it('reads quoted fields, doubled quotes, CRLF and a byte-order mark', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n"two\nlines",3\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
      ['two\nlines', '3'],
    ]);
  });

  it('turns rows into objects and memberships, leaving empty cells out', () => {
    const result = csvObjects(
      'name,base_type,x,y,z,parent_key,group_key,external_key\n' +
        'Gudrun System,system,10,0,-5,,helican,gudrun-system\n' +
        'Gudrun,Planet,,,,gudrun-system,,\n',
    );
    expect(result.problems).toEqual([]);
    expect(result.objects).toEqual([
      {
        externalKey: 'gudrun-system',
        name: rt.plain('Gudrun System'),
        baseType: 'system',
        x: 10,
        y: 0,
        z: -5,
      },
      { ref: 'line-3', name: rt.plain('Gudrun'), baseType: 'planet', parent: 'gudrun-system' },
    ]);
    expect(result.memberships).toEqual([{ object: 'gudrun-system', group: 'helican', line: 2 }]);
  });

  it('says what is wrong, and where', () => {
    expect(csvObjects('name,kind\n').problems[0]?.message).toMatch(/Unknown column “kind”/);
    const result = csvObjects('name,base_type,x\n,comet,far\n');
    expect(result.problems.map((problem) => [problem.line, problem.message])).toEqual([
      [2, 'The name is empty.'],
      [2, expect.stringMatching(/base type “comet”/)],
      [2, 'x isn’t a number: “far”.'],
    ]);
  });
});
