import { beforeEach, describe, expect, it } from 'vitest';
import { affectedQueries, createdEntities, type BatchDetail } from '../src/api/history.ts';
import { resolveEditKey } from '../src/input/bindings.ts';
import { relativeTime } from '../src/panels/history/relative-time.ts';
import { useHistory } from '../src/state/history.ts';

/** Undo, redo and the History panel (M3-T6): the pure parts. */

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

describe('undo and redo keys (ux.md §4)', () => {
  it('⌘Z undoes and ⌘⇧Z redoes on a Mac', () => {
    expect(resolveEditKey(keys('z', { meta: true }), 'mac')).toBe('undo');
    // With Shift held, the key arrives as "Z".
    expect(resolveEditKey(keys('Z', { meta: true, shift: true }), 'mac')).toBe('redo');
    expect(resolveEditKey(keys('y', { meta: true }), 'mac')).toBeNull();
  });

  it('Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y elsewhere', () => {
    expect(resolveEditKey(keys('z', { ctrl: true }), 'other')).toBe('undo');
    expect(resolveEditKey(keys('Z', { ctrl: true, shift: true }), 'other')).toBe('redo');
    expect(resolveEditKey(keys('y', { ctrl: true }), 'other')).toBe('redo');
  });

  it('Shift changes the shortcut: ⌘⇧A selects nothing', () => {
    expect(resolveEditKey(keys('A', { meta: true, shift: true }), 'mac')).toBeNull();
  });
});

describe('the undo stacks', () => {
  beforeEach(() => {
    useHistory.setState({ scope: null, stacksFor: null, undo: [], redo: [], changes: 0 });
  });

  it('records edits only where a universe is open', () => {
    useHistory.getState().record('lost');
    expect(useHistory.getState().undo).toEqual([]);
    useHistory.getState().setScope('u1');
    useHistory.getState().record('b1');
    useHistory.getState().record('b2');
    expect(useHistory.getState().undo).toEqual(['b1', 'b2']);
  });

  it('a new edit clears what could be redone', () => {
    useHistory.getState().setScope('u1');
    useHistory.getState().set({ undo: ['b1'], redo: ['r2'] });
    useHistory.getState().record('b3');
    expect(useHistory.getState()).toMatchObject({ undo: ['b1', 'b3'], redo: [] });
  });

  it('keeps the stacks while away, and starts afresh in another universe', () => {
    useHistory.getState().setScope('u1');
    useHistory.getState().record('b1');
    useHistory.getState().setScope(null);
    useHistory.getState().setScope('u1');
    expect(useHistory.getState().undo).toEqual(['b1']);
    useHistory.getState().setScope('u2');
    expect(useHistory.getState().undo).toEqual([]);
  });
});

describe('after a revert', () => {
  const detail = {
    batch: {} as BatchDetail['batch'],
    rowCount: 4,
    entities: [
      {
        entityId: 'a',
        kind: 'celestial_object',
        name: 'A',
        change: 'created',
        fields: [],
        aspects: [],
        summary: '',
      },
      {
        entityId: 'b',
        kind: 'event',
        name: 'B',
        change: 'updated',
        fields: [],
        aspects: [],
        summary: '',
      },
      {
        entityId: 'c',
        kind: null,
        name: 'C',
        change: 'deleted',
        fields: [],
        aspects: [],
        summary: '',
      },
    ],
    other: [
      { table: 'object_subtypes', primaryKey: {}, change: 'updated', summary: '' },
      { table: 'maps', primaryKey: {}, change: 'updated', summary: '' },
      { table: 'change_log', primaryKey: {}, change: 'created', summary: '' },
    ],
  } as BatchDetail;

  it('refreshes the kinds, settings and containers it touched, the views and the history', () => {
    expect(affectedQueries(detail)).toEqual([
      ['view'],
      ['history'],
      ['celestial_object'],
      ['event'],
      ['object_subtypes'],
      ['map'],
    ]);
  });

  it('knows which entities the revert deletes: the ones the batch created', () => {
    expect(createdEntities(detail)).toEqual(['a']);
  });
});

describe('relativeTime', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const ago = (seconds: number) => new Date(now - seconds * 1_000).toISOString();

  it('reads like a person would say it', () => {
    expect(relativeTime(ago(3), now)).toBe('just now');
    expect(relativeTime(ago(45), now)).toBe('45 sec. ago');
    expect(relativeTime(ago(120), now)).toBe('2 min. ago');
    expect(relativeTime(ago(3 * 3_600), now)).toBe('3 hr. ago');
    expect(relativeTime(ago(26 * 3_600), now)).toBe('yesterday');
    expect(relativeTime(ago(400 * 86_400), now)).toBe('last yr.');
  });
});
