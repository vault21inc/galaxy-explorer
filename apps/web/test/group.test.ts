import { describe, expect, it } from 'vitest';
import {
  activeLayerOf,
  addToGroupRequest,
  conflictsFor,
  groupRequest,
  moveQuestion,
  parentChoices,
  removeFromGroupsRequest,
} from '../src/editor/actions/group.ts';

const member = (objectId: string) => ({ objectId, isSpoiler: false }) as never;
const group = (id: string, namePlain: string, groupTypeId: string, members: string[]) => ({
  id: id as never,
  namePlain,
  groupTypeId: groupTypeId as never,
  members: members.map(member),
});
const types = [
  { id: 'segmentum', layer: 'Administrative', parentGroupTypeId: null, sortKey: 0 },
  { id: 'sub', layer: 'Administrative', parentGroupTypeId: 'sector', sortKey: 2 },
  { id: 'sector', layer: 'Administrative', parentGroupTypeId: 'segmentum', sortKey: 1 },
  { id: 'realm', layer: 'Political', parentGroupTypeId: null, sortKey: 3 },
] as never[];

const helican = group('g1', 'Helican', 'sub', ['a', 'b']);
const lyra = group('g2', 'Lyra', 'sub', ['c']);
const realm = group('g3', 'Imperium', 'realm', ['a', 'c']);
const groups = [helican, lyra, realm];

describe('grouping (M4-T2)', () => {
  it('finds selected objects already in a group of the same type', () => {
    expect(conflictsFor(['a', 'c', 'd'], 'sub', groups)).toEqual([
      { group: helican, objectIds: ['a'] },
      { group: lyra, objectIds: ['c'] },
    ]);
    expect(conflictsFor(['d'], 'sub', groups)).toEqual([]);
  });

  it('asks before moving, naming every group', () => {
    expect(moveQuestion(conflictsFor(['a'], 'sub', groups), 'Ophidian')).toBe(
      'Move 1 object from Helican to Ophidian?',
    );
    expect(moveQuestion(conflictsFor(['a', 'b', 'c'], 'sub', groups), 'Ophidian')).toBe(
      'Move 3 objects from Helican and Lyra to Ophidian?',
    );
  });

  it('creates, releases and adds in one batch', () => {
    const request = groupRequest(
      {
        mapId: 'm',
        name: 'Ophidian',
        groupTypeId: 'sub',
        outlineColor: '#c8a24a',
        parentGroupId: null,
      },
      ['a', 'd'],
      conflictsFor(['a', 'd'], 'sub', groups),
    );
    expect(request.description).toBe('Group 2 objects as “Ophidian”');
    expect(request.operations.map((operation) => operation.op)).toEqual([
      'create',
      'removeMembers',
      'addMembers',
    ]);
    expect(request.operations[1]).toEqual({ op: 'removeMembers', id: 'g1', data: ['a'] });
    expect(request.operations[2]).toEqual({
      op: 'addMembers',
      id: '$op:0',
      data: [{ objectId: 'a' }, { objectId: 'd' }],
    });
  });

  it('adds to an existing group, moving from its siblings and skipping members', () => {
    const request = addToGroupRequest(lyra, ['a', 'c', 'd'], groups);
    expect(request?.description).toBe('Add 2 objects to “Lyra”');
    expect(request?.operations).toEqual([
      { op: 'removeMembers', id: 'g1', data: ['a'] },
      { op: 'addMembers', id: 'g2', data: [{ objectId: 'a' }, { objectId: 'd' }] },
    ]);
    expect(addToGroupRequest(lyra, ['c'], groups)).toBeNull();
  });

  it('removes from the groups of one layer only', () => {
    const request = removeFromGroupsRequest(['a', 'c'], 'Administrative', groups, types);
    expect(request?.operations).toEqual([
      { op: 'removeMembers', id: 'g1', data: ['a'] },
      { op: 'removeMembers', id: 'g2', data: ['c'] },
    ]);
    expect(request?.description).toBe('Remove 2 objects from Helican and Lyra');
    expect(removeFromGroupsRequest(['d'], 'Administrative', groups, types)).toBeNull();
  });

  it('picks the active layer: the chosen one, else the first in settings order', () => {
    expect(activeLayerOf(null, types)).toBe('Administrative');
    expect(activeLayerOf('Political', types)).toBe('Political');
    expect(activeLayerOf('Gone', types)).toBe('Administrative');
    expect(activeLayerOf(null, [])).toBeNull();
  });

  it('offers as parents only groups of the parent type', () => {
    const sector = group('g4', 'Scarus', 'sector', []);
    expect(parentChoices('sub', [...groups, sector], types)).toEqual([sector]);
    expect(parentChoices('segmentum', [...groups, sector], types)).toEqual([]);
  });
});
