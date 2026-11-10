import { describe, expect, it } from 'vitest';
import { dropIndex, reorderUpdates } from '../src/panels/config-table/reorder.ts';

const rows = (...keys: number[]) =>
  keys.map((sortKey, index) => ({ id: `r${index.toString()}`, sortKey }));

describe('reorderUpdates (M4-T1)', () => {
  it('moves a row between two others to their midpoint', () => {
    expect(reorderUpdates(rows(0, 1, 2), 2, 1)).toEqual([{ id: 'r2', sortKey: 0.5 }]);
    expect(reorderUpdates(rows(0, 1, 2), 0, 1)).toEqual([{ id: 'r0', sortKey: 1.5 }]);
  });

  it('moves a row to either end', () => {
    expect(reorderUpdates(rows(0, 1, 2), 2, 0)).toEqual([{ id: 'r2', sortKey: -1 }]);
    expect(reorderUpdates(rows(0, 1, 2), 0, 2)).toEqual([{ id: 'r0', sortKey: 3 }]);
  });

  it('renumbers only the rows that change when the neighbours share a key', () => {
    expect(reorderUpdates(rows(0, 0, 0), 2, 1)).toEqual([
      { id: 'r2', sortKey: 1 },
      { id: 'r1', sortKey: 2 },
    ]);
  });

  it('does nothing for a move to the same place or out of range', () => {
    expect(reorderUpdates(rows(0, 1), 1, 1)).toEqual([]);
    expect(reorderUpdates(rows(0, 1), 0, 5)).toEqual([]);
  });
});

describe('dropIndex', () => {
  const middles = [10, 30, 50];
  it('lands above the first row whose middle is below the pointer', () => {
    expect(dropIndex(middles, 5, 2)).toBe(0);
    expect(dropIndex(middles, 40, 0)).toBe(1);
    expect(dropIndex(middles, 60, 0)).toBe(2);
    expect(dropIndex(middles, 20, 1)).toBe(1);
  });
});
