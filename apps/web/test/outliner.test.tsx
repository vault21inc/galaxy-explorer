import { HIDE_SPOILERS, rt, type ViewObject } from '@ge/domain';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { outlinerKey } from '../src/panels/outliner/outliner-keys.ts';
import { Outliner } from '../src/panels/outliner/outliner.tsx';

/** The outliner (M3-T9): keyboard navigation of the ARIA tree, and what it shows. */

const ROWS = ['a', 'b', 'c', 'd'];
const key = (name: string, held: { shift?: boolean; primary?: boolean } = {}) => ({
  key: name,
  shift: held.shift ?? false,
  primary: held.primary ?? false,
});

describe('outliner keyboard (ux.md §10)', () => {
  it('arrows move focus, stopping at the ends', () => {
    expect(outlinerKey(ROWS, 'b', key('ArrowDown'))).toEqual({ focus: 'c' });
    expect(outlinerKey(ROWS, 'b', key('ArrowUp'))).toEqual({ focus: 'a' });
    expect(outlinerKey(ROWS, 'd', key('ArrowDown'))).toEqual({ focus: 'd' });
    expect(outlinerKey(ROWS, 'a', key('ArrowUp'))).toEqual({ focus: 'a' });
  });

  it('Home and End jump to the first and last rows', () => {
    expect(outlinerKey(ROWS, 'c', key('Home'))).toEqual({ focus: 'a' });
    expect(outlinerKey(ROWS, 'a', key('End'))).toEqual({ focus: 'd' });
  });

  it('with nothing focused, the first key lands on the first row', () => {
    expect(outlinerKey(ROWS, null, key('ArrowDown'))).toEqual({ focus: 'a' });
    expect(outlinerKey(ROWS, null, key(' '))).toEqual({ focus: 'a', select: { ids: ['a'] } });
  });

  it('Space selects the focused row, replacing the selection', () => {
    expect(outlinerKey(ROWS, 'c', key(' '))).toEqual({ focus: 'c', select: { ids: ['c'] } });
  });

  it('Shift extends: Shift + arrow adds the next row, Shift + Space adds this one', () => {
    expect(outlinerKey(ROWS, 'b', key('ArrowDown', { shift: true }))).toEqual({
      focus: 'c',
      select: { ids: ['c'], add: true },
    });
    expect(outlinerKey(ROWS, 'b', key(' ', { shift: true }))).toEqual({
      focus: 'b',
      select: { ids: ['b'], add: true },
    });
  });

  it('Cmd/Ctrl + Space toggles a row', () => {
    expect(outlinerKey(ROWS, 'b', key(' ', { primary: true }))).toEqual({
      focus: 'b',
      select: { ids: ['b'], toggle: true },
    });
  });

  it('Enter selects until entering arrives (M5); Escape clears', () => {
    expect(outlinerKey(ROWS, 'd', key('Enter'))).toEqual({ focus: 'd', select: { ids: ['d'] } });
    expect(outlinerKey(ROWS, 'd', key('Escape'))).toEqual({ focus: 'd', select: { ids: [] } });
  });

  it('leaves other keys, and an empty tree, alone', () => {
    expect(outlinerKey(ROWS, 'a', key('x'))).toBeNull();
    expect(outlinerKey([], null, key('ArrowDown'))).toBeNull();
  });
});

const ID = (n: number) => `019a5b3c-7d2e-7f00-8a1b-2c3d4e5f6a7${n.toString()}`;
function object(n: number, name: string, extra: Partial<ViewObject> = {}): ViewObject {
  return {
    id: ID(n),
    baseType: 'system',
    subtypeId: null,
    name: rt.plain(name),
    namePlain: name,
    nameRedacted: name,
    nameSpoiler: false,
    isSpoiler: false,
    status: 'published',
    version: 1,
    explorable: true,
    position: [0, 0, 0],
    appearance: { color: '#ffffff' },
    size: 120,
    ...extra,
  } as unknown as ViewObject;
}

describe('the outliner tree', () => {
  const html = renderToStaticMarkup(
    <Outliner
      objects={[
        object(1, 'Cadia'),
        object(2, 'Armageddon', { status: 'draft' }),
        object(3, 'The Maw', { isSpoiler: true }),
      ]}
    />,
  );

  it('is an ARIA tree of the view’s objects, sorted, one row reachable by Tab', () => {
    expect(html).toContain('role="tree"');
    expect(html).toContain('aria-multiselectable="true"');
    expect(html.match(/role="treeitem"/g)).toHaveLength(3);
    expect(html.indexOf('Armageddon')).toBeLessThan(html.indexOf('Cadia'));
    expect(html.match(/tabindex="0"/gi)).toHaveLength(1);
  });

  it('marks drafts, and hides a hidden spoiler’s name (as its 3D label does)', () => {
    expect(html).toContain('>Draft<');
    expect(HIDE_SPOILERS.showAll).toBe(false);
    expect(html).not.toContain('The Maw');
    expect(html).toContain('aria-label="Hidden potential spoiler, System"');
  });
});
