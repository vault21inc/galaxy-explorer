import { describe, expect, it } from 'vitest';
import { labelText } from '../src/render/labels/label-text.ts';
import {
  compareCandidates,
  solveLabels,
  type LabelCandidate,
  type PlacedLabel,
} from '../src/render/labels/solve-labels.ts';
import { effectiveLabelMode, useLabels } from '../src/state/labels.ts';

const viewport = { widthPx: 1_000, heightPx: 800 };
/** Every character is 6 px wide; labels are 16 px tall. */
const metrics = {
  measure: (text: string) => text.length * 6,
  heightPx: { object: 16, group: 14 },
  gapPx: 4,
  max: 200,
};

let next = 0;
function candidate(overrides: Partial<LabelCandidate> = {}): LabelCandidate {
  next++;
  return {
    id: `c${next.toString()}`,
    text: 'Aster',
    kind: 'object',
    x: 100,
    y: 100,
    radiusPx: 4,
    selected: false,
    hovered: false,
    labelPriority: 0,
    groupSize: 0,
    ...overrides,
  };
}

const overlaps = (a: PlacedLabel, b: PlacedLabel) =>
  a.left < b.left + b.width &&
  b.left < a.left + a.width &&
  a.top < b.top + b.height &&
  b.top < a.top + a.height;

describe('solveLabels', () => {
  it('places a label to the right of its body, vertically centered', () => {
    const [label] = solveLabels([candidate({ x: 100, y: 100, radiusPx: 4 })], viewport, metrics);
    expect(label).toMatchObject({ left: 108, top: 92, width: 30, height: 16 });
  });

  it('orders by priority: selected, hovered, groups (larger first), then label priority and size', () => {
    const ordered = [
      candidate({ id: 'small', radiusPx: 4 }),
      candidate({ id: 'big', radiusPx: 12 }),
      candidate({ id: 'priority', labelPriority: 8 }),
      candidate({ id: 'group-small', kind: 'group', groupSize: 3 }),
      candidate({ id: 'group-big', kind: 'group', groupSize: 30 }),
      candidate({ id: 'hovered', hovered: true }),
      candidate({ id: 'selected', selected: true }),
    ];
    expect([...ordered].sort(compareCandidates).map((c) => c.id)).toEqual([
      'selected',
      'hovered',
      'group-big',
      'group-small',
      'priority',
      'big',
      'small',
    ]);
  });

  it('drops the lower-priority label when two would overlap', () => {
    const placed = solveLabels(
      [
        candidate({ id: 'low', x: 100, y: 100 }),
        candidate({ id: 'high', x: 102, y: 104, labelPriority: 5 }),
        candidate({ id: 'apart', x: 500, y: 400 }),
      ],
      viewport,
      metrics,
    );
    expect(placed.map((label) => label.id).sort()).toEqual(['apart', 'high']);
  });

  it('keeps the selected label over any other', () => {
    const placed = solveLabels(
      [candidate({ id: 'other', labelPriority: 10 }), candidate({ id: 'chosen', selected: true })],
      viewport,
      metrics,
    );
    expect(placed.map((label) => label.id)).toEqual(['chosen']);
  });

  it('never places overlapping labels', () => {
    const random = (() => {
      let seed = 1;
      return () => (seed = (seed * 16_807) % 2_147_483_647) / 2_147_483_647;
    })();
    const crowd = Array.from({ length: 2_000 }, () =>
      candidate({
        x: random() * 900,
        y: random() * 780,
        text: 'System 0123'.slice(0, 4 + Math.floor(random() * 8)),
      }),
    );
    const placed = solveLabels(crowd, viewport, metrics);
    expect(placed.length).toBeGreaterThan(20);
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        expect(overlaps(placed[i]!, placed[j]!)).toBe(false);
      }
    }
  });

  it('shows at most 200 labels', () => {
    const grid = Array.from({ length: 1_000 }, (_, i) =>
      candidate({ x: (i % 20) * 50, y: Math.floor(i / 20) * 20 + 10, text: 'ab' }),
    );
    const placed = solveLabels(grid, { widthPx: 1_100, heightPx: 1_100 }, metrics);
    expect(placed.length).toBe(200);
  });

  it('leaves out labels that would cross the edge of the view', () => {
    expect(solveLabels([candidate({ x: 990, y: 100 })], viewport, metrics)).toEqual([]);
    expect(solveLabels([candidate({ x: 100, y: 2 })], viewport, metrics)).toEqual([]);
  });
});

describe('labelText', () => {
  const item = {
    id: 'maw',
    namePlain: 'The Maw',
    nameRedacted: '▇▇▇▇▇▇',
    isSpoiler: false,
    nameSpoiler: false,
  };
  const hidden = { showAll: false, revealed: new Set<string>() };

  it('shows the redacted name while spoilers are hidden', () => {
    expect(labelText(item, hidden)).toBe('▇▇▇▇▇▇');
  });

  it('shows the plain name once spoilers are shown', () => {
    expect(labelText(item, { showAll: true, revealed: new Set() })).toBe('The Maw');
  });

  it('shows a name revealed in the panel', () => {
    expect(labelText(item, { showAll: false, revealed: new Set(['maw/name']) })).toBe('The Maw');
  });

  it('turns a whole hidden item into a bar, never its name', () => {
    const text = labelText({ ...item, isSpoiler: true, nameRedacted: 'The Maw' }, hidden);
    expect(text).toMatch(/^▇+$/);
  });
});

describe('label modes', () => {
  it('cycles hover → groups → all → hover', () => {
    useLabels.setState({ mode: 'hover' });
    const seen = [];
    for (let i = 0; i < 4; i++) {
      seen.push(useLabels.getState().mode);
      useLabels.getState().cycle();
    }
    expect(seen).toEqual(['hover', 'groups', 'all', 'hover']);
  });

  it('shows all while Space is held, whatever the mode', () => {
    expect(effectiveLabelMode({ mode: 'hover', showAllHeld: true })).toBe('all');
    expect(effectiveLabelMode({ mode: 'groups', showAllHeld: false })).toBe('groups');
  });
});
