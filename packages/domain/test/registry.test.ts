import { describe, expect, expectTypeOf, it } from 'vitest';
import { z } from 'zod';
import {
  BASE_TYPES,
  configResources,
  ENTITY_KINDS,
  entityKinds,
  objectTypes,
  relationTypes,
  VIEW_LEVELS,
  viewLevels,
  type ViewLevelDef,
} from '../src/registry/index.ts';

const baseTypes: readonly string[] = BASE_TYPES;
const kinds: readonly string[] = ENTITY_KINDS;
const levels: readonly string[] = VIEW_LEVELS;

/** The base types a view level is about; none for the galaxy view, whose subject is the map. */
const subjectTypes = (subject: ViewLevelDef['subject']): readonly string[] =>
  subject === 'map' ? [] : subject;

describe('registry invariants', () => {
  it.each(Object.entries(objectTypes))(
    '%s: explorableAs is a view level or null',
    (_name, type) => {
      if (type.explorableAs !== null) expect(levels).toContain(type.explorableAs);
    },
  );

  it.each(Object.entries(objectTypes))(
    '%s: every parent is a base type or the map',
    (_name, type) => {
      for (const parent of type.parents) expect([...baseTypes, 'map']).toContain(parent);
      expect(type.parents.length).toBeGreaterThan(0);
    },
  );

  it.each(Object.entries(objectTypes))(
    '%s: sizes are for view levels and positive',
    (_name, type) => {
      for (const [level, size] of Object.entries(type.size)) {
        expect(levels).toContain(level);
        expect(size).toBeGreaterThan(0);
      }
    },
  );

  it('region types have no body size, and every other type has one', () => {
    for (const type of Object.values(objectTypes)) {
      const sized = Object.keys(type.size).length > 0;
      expect(sized).toBe(!('region' in type));
    }
  });

  it('a view level opened by a type has that type among its subjects, and vice versa', () => {
    for (const [name, type] of Object.entries(objectTypes)) {
      if (type.explorableAs === null) continue;
      expect(subjectTypes(viewLevels[type.explorableAs].subject)).toContain(name);
    }
    for (const [level, def] of Object.entries(viewLevels)) {
      for (const subject of subjectTypes(def.subject)) {
        expect(baseTypes).toContain(subject);
        expect(objectTypes[subject as keyof typeof objectTypes].explorableAs).toBe(level);
      }
    }
  });

  it('plurals are unique across entity kinds and config resources, and URL-safe', () => {
    const plurals = [
      ...Object.values(entityKinds).map((kind) => kind.plural),
      ...Object.values(configResources).map((resource) => resource.plural),
    ];
    expect(new Set(plurals).size).toBe(plurals.length);
    for (const plural of plurals) expect(plural).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it('relation endpoints name registered entity kinds', () => {
    for (const type of Object.values(relationTypes)) {
      for (const end of [type.from, type.to]) {
        if (end !== '*') for (const kind of end) expect(kinds).toContain(kind);
      }
    }
  });

  it.each(Object.entries(configResources))('%s has a schema with fields', (_name, resource) => {
    expect(resource.schema).toBeInstanceOf(z.ZodObject);
    expect(Object.keys(resource.schema.shape).length).toBeGreaterThan(0);
  });

  it('content fields of each kind exist in its extension', () => {
    for (const kind of Object.values(entityKinds)) {
      const fields = Object.keys(kind.extension?.shape ?? {});
      for (const field of kind.contentFields) expect(fields).toContain(field);
    }
  });

  it('registers routes, the first kind added after M1 (M4-T7)', () => {
    expect(kinds).toContain('route');
  });

  it('keeps literal types, so derived code is typed per kind', () => {
    expectTypeOf(entityKinds.celestial_object.plural).toEqualTypeOf<'objects'>();
    expectTypeOf(entityKinds.character.scope).toEqualTypeOf<'universe'>();
    expectTypeOf(objectTypes.planet.explorableAs).toEqualTypeOf<'orbit'>();
  });
});
