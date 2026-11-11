import { rt, type EntityReadOf } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { deleteDescription, deleteRequest } from '../src/editor/actions/delete.ts';
import {
  copyName,
  duplicateOperations,
  type DuplicableObject,
} from '../src/editor/actions/duplicate.ts';
import { describeImpact, summarizeImpact } from '../src/editor/actions/impact.ts';
import { resolveEditKey } from '../src/input/bindings.ts';

/** The galaxy view's offset for copies (levels/registry.ts). */
const DUPLICATE_OFFSET = 20;

/** The pure parts of the selection commands (M3-T5): keys, delete, duplicate. */

const keys = (
  key: string,
  held: Partial<Record<'meta' | 'ctrl' | 'shift' | 'alt', boolean>> = {},
) => ({
  key,
  metaKey: held.meta ?? false,
  ctrlKey: held.ctrl ?? false,
  shiftKey: held.shift ?? false,
  altKey: held.alt ?? false,
});

describe('edit-mode shortcuts (ux.md §4)', () => {
  it('⌘A and ⌘D on a Mac, Ctrl+A and Ctrl+D elsewhere', () => {
    expect(resolveEditKey(keys('a', { meta: true }), 'mac')).toBe('select-all');
    expect(resolveEditKey(keys('d', { meta: true }), 'mac')).toBe('duplicate');
    expect(resolveEditKey(keys('g', { meta: true }), 'mac')).toBe('group');
    expect(resolveEditKey(keys('G', { ctrl: true, shift: true }), 'other')).toBe('ungroup');
    expect(resolveEditKey(keys('a', { ctrl: true }), 'other')).toBe('select-all');
    expect(resolveEditKey(keys('D', { ctrl: true }), 'other')).toBe('duplicate');
  });

  it('the other platform’s modifier, or extra ones, are not the shortcut', () => {
    expect(resolveEditKey(keys('a', { ctrl: true }), 'mac')).toBeNull();
    expect(resolveEditKey(keys('a', { meta: true }), 'other')).toBeNull();
    expect(resolveEditKey(keys('d', { meta: true, shift: true }), 'mac')).toBeNull();
    expect(resolveEditKey(keys('a'), 'mac')).toBeNull();
  });

  it('Delete and Backspace delete, without modifiers', () => {
    expect(resolveEditKey(keys('Delete'), 'other')).toBe('delete');
    expect(resolveEditKey(keys('Backspace'), 'mac')).toBe('delete');
    expect(resolveEditKey(keys('Backspace', { meta: true }), 'mac')).toBeNull();
  });
});

describe('delete', () => {
  const objects = [
    { id: 'a', version: 3, namePlain: 'Gudrun System' },
    { id: 'b', version: 1, namePlain: 'Helican' },
  ];

  it('names one object, counts several', () => {
    expect(deleteDescription(objects.slice(0, 1))).toBe('Delete “Gudrun System”');
    expect(deleteDescription(objects)).toBe('Delete 2 objects');
  });

  it('is one batch with each version, as a dry run first', () => {
    expect(deleteRequest(objects as never, true)).toEqual({
      description: 'Delete 2 objects',
      dryRun: true,
      operations: [
        { op: 'delete', kind: 'celestial_object', id: 'a', version: 3 },
        { op: 'delete', kind: 'celestial_object', id: 'b', version: 1 },
      ],
    });
    expect(deleteRequest(objects as never, false)).not.toHaveProperty('dryRun');
  });

  it('sums up the impact in words (ux.md §5)', () => {
    const impact = {
      entities: { insert: 0, update: 0, delete: 8 },
      celestial_objects: { insert: 0, update: 0, delete: 8 },
      group_members: { insert: 0, update: 0, delete: 3 },
      field_values: { insert: 0, update: 0, delete: 1 },
      entity_locations: { insert: 0, update: 0, delete: 4 },
    };
    const summary = summarizeImpact(impact, 1);
    expect(summary).toEqual({
      childObjects: 7,
      alsoDeleted: ['3 group memberships', '1 fact'],
      unplaced: 4,
      orphanedGroups: 0,
    });
    expect(describeImpact(summary)).toBe(
      '7 child objects, 3 group memberships, 1 fact; 4 places or events become unplaced',
    );
  });

  it('says nothing else is affected when only the objects go', () => {
    const impact = { celestial_objects: { insert: 0, update: 0, delete: 2 } };
    expect(describeImpact(summarizeImpact(impact, 2))).toBeNull();
    expect(
      describeImpact({ childObjects: 1, alsoDeleted: [], unplaced: 0, orphanedGroups: 0 }),
    ).toBe('1 child object');
  });

  it('says what deleting a group releases (M4-T2)', () => {
    const impact = {
      entities: { insert: 0, update: 0, delete: 1 },
      object_groups: { insert: 0, update: 2, delete: 1 },
      group_members: { insert: 0, update: 0, delete: 4 },
    };
    expect(describeImpact(summarizeImpact(impact, 0))).toBe(
      '4 group memberships; 2 child groups lose their parent',
    );
    const items = [
      { id: 'g', version: 2, namePlain: 'Helican', kind: 'group' as const },
      { id: 'h', version: 1, namePlain: 'Lyra', kind: 'group' as const },
    ];
    expect(deleteDescription(items)).toBe('Delete 2 groups');
    expect(deleteRequest(items as never, false).operations[0]).toEqual({
      op: 'delete',
      kind: 'group',
      id: 'g',
      version: 2,
    });
  });
});

describe('duplicate (ux.md §5)', () => {
  const ID = '019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7b';
  const object = {
    id: ID,
    kind: 'celestial_object',
    universeId: ID,
    mapId: ID,
    name: rt.md('**Gudrun**'),
    namePlain: 'Gudrun',
    summary: rt.plain('A hive world.'),
    description: null,
    isSpoiler: false,
    status: 'published',
    externalKey: 'gudrun',
    clonedFromEntityId: null,
    version: 4,
    createdAt: '2026-11-08T00:00:00.000Z',
    updatedAt: '2026-11-08T00:00:00.000Z',
    parentId: null,
    baseType: 'system',
    subtypeId: null,
    explorable: true,
    x: 100,
    y: -5,
    z: 30,
    appearance: { color: '#ff0000' },
    facts: [
      {
        entityId: ID,
        fieldDefinitionId: ID,
        value: { type: 'number', number: 3 },
        isSpoiler: false,
        sortKey: null,
      },
    ],
  } as unknown as EntityReadOf<'celestial_object'> & DuplicableObject;

  it('creates a copy to the right with " copy" after the name, then its facts', () => {
    const [create, facts, ...rest] = duplicateOperations([object], ID, DUPLICATE_OFFSET);
    expect(rest).toEqual([]);
    expect(create).toEqual({
      op: 'create',
      kind: 'celestial_object',
      mapId: ID,
      data: {
        name: rt.md('**Gudrun** copy'),
        summary: rt.plain('A hive world.'),
        description: null,
        isSpoiler: false,
        status: 'published',
        parentId: null,
        baseType: 'system',
        subtypeId: null,
        explorable: true,
        x: 100 + DUPLICATE_OFFSET,
        y: -5,
        z: 30,
        appearance: { color: '#ff0000' },
      },
    });
    expect(facts).toEqual({
      op: 'setFacts',
      id: '$op:0',
      data: [
        {
          fieldDefinitionId: ID,
          value: { type: 'number', number: 3 },
          isSpoiler: false,
          sortKey: null,
        },
      ],
    });
  });

  it('points each copy’s facts at that copy', () => {
    const operations = duplicateOperations(
      [object, { ...object, facts: [] }, object],
      ID,
      DUPLICATE_OFFSET,
    );
    expect(
      operations.map((operation) => ('id' in operation ? operation.id : operation.op)),
    ).toEqual(['create', '$op:0', 'create', 'create', '$op:3']);
  });

  it('adds " copy" inside a closing HTML paragraph', () => {
    expect(copyName(rt.html('<p>Gudrun</p>')).source).toBe('<p>Gudrun copy</p>');
    expect(copyName(rt.plain('Gudrun')).source).toBe('Gudrun copy');
  });
});
