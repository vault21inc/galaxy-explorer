import { describe, expect, it } from 'vitest';
import type { ConfigReadOf } from '@ge/domain';
import { parseList } from '@/panels/entity-form/fields/list-field.tsx';
import { definitionsFor } from '@/panels/facts/facts-editor.tsx';

/** Which field definitions an entity gets (M7-T1), and the list widget's parsing. */

const definition = (id: string, overrides: Partial<ConfigReadOf<'field_definitions'>> = {}) =>
  ({
    id,
    label: id,
    appliesToKind: 'celestial_object',
    appliesToBaseType: null,
    appliesToSubtypeId: null,
    sortKey: 0,
    ...overrides,
  }) as unknown as ConfigReadOf<'field_definitions'>;

describe('definitionsFor', () => {
  const all = [
    definition('any object', { sortKey: 2 }),
    definition('planets', { appliesToBaseType: 'planet' as never, sortKey: 1 }),
    definition('hive worlds', {
      appliesToBaseType: 'planet' as never,
      appliesToSubtypeId: 'hive' as never,
      sortKey: 3,
    }),
    definition('events', { appliesToKind: 'event' }),
  ];
  const ids = (kind: string, entity: { baseType?: string | null; subtypeId?: string | null }) =>
    definitionsFor(kind, entity, all).map((item) => item.id);

  it('keeps the kind’s definitions, narrowed by base type and subtype, in order', () => {
    expect(ids('celestial_object', { baseType: 'planet', subtypeId: 'hive' })).toEqual([
      'planets',
      'any object',
      'hive worlds',
    ]);
    expect(ids('celestial_object', { baseType: 'planet', subtypeId: null })).toEqual([
      'planets',
      'any object',
    ]);
    expect(ids('celestial_object', { baseType: 'system' })).toEqual(['any object']);
    expect(ids('event', {})).toEqual(['events']);
    expect(ids('character', {})).toEqual([]);
  });
});

describe('parseList', () => {
  it('splits on commas, trims, and drops empty items', () => {
    expect(parseList(' population , pop,, tithe grade ')).toEqual([
      'population',
      'pop',
      'tithe grade',
    ]);
    expect(parseList('   ')).toEqual([]);
  });
});
