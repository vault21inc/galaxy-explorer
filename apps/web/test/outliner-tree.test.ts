import { HIDE_SPOILERS, rt, SHOW_SPOILERS, type ViewObject } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { outlinerKey, type OutlinerTree } from '../src/panels/outliner/outliner-keys.ts';
import {
  ancestorsOf,
  openByDefault,
  outlinerRows,
  visibleRows,
} from '../src/panels/outliner/outliner-tree.ts';

/** The outliner as a tree of layers, group types and groups (M4-T4). */

const object = (id: string, name: string) =>
  ({
    id,
    baseType: 'system',
    name: rt.plain(name),
    namePlain: name,
    nameRedacted: name,
    nameSpoiler: false,
    isSpoiler: false,
    status: 'published',
  }) as unknown as ViewObject;
const group = (id: string, name: string, typeId: string, members: string[], extra = {}) =>
  ({
    id,
    groupTypeId: typeId,
    parentGroupId: null,
    members: members.map((objectId) => ({ objectId, isSpoiler: false })),
    status: 'published',
    isSpoiler: false,
    namePlain: name,
    nameSpoiler: false,
    nameRedacted: name,
    ...extra,
  }) as never;
const types = [
  { id: 'sector', name: 'Sector', layer: 'Administrative', sortKey: 0 },
  { id: 'sub', name: 'Sub-sector', layer: 'Administrative', sortKey: 1 },
  { id: 'realm', name: 'Realm', layer: 'Political', sortKey: 2 },
  { id: 'empty', name: 'Empty', layer: 'Nothing yet', sortKey: 3 },
] as never[];
const objects = [object('a', 'Alpha'), object('b', 'Beta'), object('c', 'Gamma')];
const groups = [
  group('scarus', 'Scarus', 'sector', []),
  group('helican', 'Helican', 'sub', ['b', 'a'], { parentGroupId: 'scarus' }),
  group('tau', 'Tau', 'realm', ['a']),
];

const rows = outlinerRows(objects, groups, types, SHOW_SPOILERS);
const shown = (list: typeof rows) => list.map((row) => `${'  '.repeat(row.level - 1)}${row.text}`);

describe('outlinerRows', () => {
  it('nests layer › type › group › nested groups › members, then ungrouped objects', () => {
    expect(shown(rows)).toEqual([
      'Administrative',
      '  Sector',
      '    Scarus',
      '      Helican',
      '        Alpha',
      '        Beta',
      'Political',
      '  Realm',
      '    Tau',
      '      Alpha',
      'Gamma',
    ]);
    // Layers and types only open; groups and objects select.
    expect(rows.map((row) => row.id)).toEqual([
      null,
      null,
      'scarus',
      'helican',
      'a',
      'b',
      null,
      null,
      'tau',
      'a',
      'c',
    ]);
    // An object in two layers has a row in each, with its own key.
    expect(new Set(rows.map((row) => row.key)).size).toBe(rows.length);
  });

  it('hides a hidden spoiler group’s name', () => {
    const secret = outlinerRows(
      objects,
      [group('veil', 'The Veil', 'realm', ['c'], { isSpoiler: true })],
      types,
      HIDE_SPOILERS,
    ).find((row) => row.id === 'veil');
    expect(secret).toMatchObject({ hidden: true });
    expect(secret?.text).not.toContain('Veil');
  });

  it('survives a cycle of parents', () => {
    const cycle = outlinerRows(
      objects,
      [
        group('x', 'X', 'sub', ['a'], { parentGroupId: 'y' }),
        group('y', 'Y', 'sub', ['b'], { parentGroupId: 'x' }),
      ],
      types,
      SHOW_SPOILERS,
    );
    // Neither is a root, so neither shows under a type; their objects are still listed.
    expect(shown(cycle)).toEqual(['Gamma']);
  });
});

describe('visibleRows and ancestorsOf', () => {
  it('starts with groups closed, and opening one shows its rows', () => {
    const closed = visibleRows(rows, openByDefault);
    expect(shown(closed)).toEqual([
      'Administrative',
      '  Sector',
      '    Scarus',
      'Political',
      '  Realm',
      '    Tau',
      'Gamma',
    ]);
    const open = new Set(['group:scarus']);
    const opened = visibleRows(rows, (row) => openByDefault(row) || open.has(row.key));
    expect(shown(opened)).toContain('      Helican');
    expect(shown(opened)).not.toContain('        Alpha');
  });

  it('lists the rows to open to show one', () => {
    const alpha = rows.find((row) => row.key === 'group:helican/a');
    expect(ancestorsOf(rows, alpha?.key ?? '')).toEqual([
      'group:helican',
      'group:scarus',
      'type:sector',
      'layer:Administrative',
    ]);
  });
});

describe('outliner keys in a tree', () => {
  const keys = ['layer', 'group', 'member'];
  const tree = (open: Record<string, boolean | null>): OutlinerTree => ({
    parentOf: (row) => ({ group: 'layer', member: 'group' })[row] ?? null,
    openOf: (row) => open[row] ?? null,
    selectable: (row) => row !== 'layer',
  });
  const press = (name: string) => ({ key: name, shift: false, primary: false });

  it('Right opens a closed row, then moves into it', () => {
    expect(outlinerKey(keys, 'group', press('ArrowRight'), tree({ group: false }))).toEqual({
      focus: 'group',
      expand: { row: 'group', open: true },
    });
    expect(outlinerKey(keys, 'group', press('ArrowRight'), tree({ group: true }))).toEqual({
      focus: 'member',
    });
  });

  it('Left closes an open row, else moves to the parent', () => {
    expect(outlinerKey(keys, 'group', press('ArrowLeft'), tree({ group: true }))).toEqual({
      focus: 'group',
      expand: { row: 'group', open: false },
    });
    expect(outlinerKey(keys, 'member', press('ArrowLeft'), tree({}))).toEqual({ focus: 'group' });
  });

  it('Space on a layer row opens or closes it instead of selecting', () => {
    expect(outlinerKey(keys, 'layer', press(' '), tree({ layer: true }))).toEqual({
      focus: 'layer',
      expand: { row: 'layer', open: false },
    });
  });
});
