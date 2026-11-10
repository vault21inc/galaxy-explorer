/**
 * Which labels to show, and where (rendering.md §11). Pure: it gets candidates already projected
 * to the screen and returns placed rectangles, so it's unit-tested without a browser.
 *
 * Greedy placement: candidates are sorted by priority, and each takes its spot to the right of
 * its body unless that rectangle overlaps one already placed. A grid of cells remembers which
 * placed labels touch each cell, so the overlap check only looks at nearby labels.
 */

export type LabelKind = 'object' | 'group';

export interface LabelCandidate {
  id: string;
  text: string;
  kind: LabelKind;
  /** Where the body's center is on screen, in CSS pixels. */
  x: number;
  y: number;
  /** The body's on-screen radius: the label starts this far right of the center, plus a gap. */
  radiusPx: number;
  selected: boolean;
  hovered: boolean;
  /** 0–10 from the object's appearance; for groups, unused. */
  labelPriority: number;
  /** For groups: how many members, larger groups first. */
  groupSize: number;
  /** For groups: the label's color, the group's (rendering.md §11). Objects are white. */
  color?: string;
}

export interface PlacedLabel {
  id: string;
  text: string;
  kind: LabelKind;
  /** The label's top-left corner and size, in CSS pixels. */
  left: number;
  top: number;
  width: number;
  height: number;
  color?: string;
}

export interface LabelViewport {
  widthPx: number;
  heightPx: number;
}

export interface LabelMetrics {
  /** The text's rendered width in CSS pixels. */
  measure: (text: string, kind: LabelKind) => number;
  /** Line height per kind, in CSS pixels. */
  heightPx: Record<LabelKind, number>;
  /** Space between the body's edge and the label. */
  gapPx: number;
  /** At most this many labels. */
  max: number;
}

/**
 * A candidate's rank as one number, higher first: selected > hovered > groups (larger first) >
 * objects by label priority, then by on-screen size (in half pixels, so near-equal sizes tie).
 */
export function candidateRank(c: LabelCandidate): number {
  const tier = c.selected ? 3 : c.hovered ? 2 : c.kind === 'group' ? 1 : 0;
  const group = Math.min(Math.max(c.groupSize, 0), 9_999);
  const priority = Math.min(Math.max(Math.round(c.labelPriority), 0), 10);
  const size = Math.min(Math.max(Math.floor(c.radiusPx * 2), 0), 999);
  return ((tier * 10_000 + group) * 11 + priority) * 1_000 + size;
}

/** The order labels are considered in: by rank, ties in input order. */
export function compareCandidates(a: LabelCandidate, b: LabelCandidate): number {
  return candidateRank(b) - candidateRank(a);
}

/**
 * Sorting thousands of candidates every frame with a comparison function is slow, so each one's
 * rank and position are packed into one number and a typed array is sorted natively. Ranks are
 * below 2^29 and positions below 2^16, so the product stays exact in a double. Negated, so the
 * natural ascending sort gives the highest rank first; equal ranks keep input order.
 */
const MAX_PACKED = 1 << 16;
let sortKeys = new Float64Array(0);

function rankOrder(candidates: readonly LabelCandidate[], count: number): number[] {
  const rankAt = (i: number) => {
    const candidate = candidates[i];
    return candidate ? candidateRank(candidate) : -1;
  };
  if (count > MAX_PACKED) {
    return Array.from({ length: count }, (_, i) => i).sort(
      (a, b) => rankAt(b) - rankAt(a) || a - b,
    );
  }
  if (sortKeys.length < count) sortKeys = new Float64Array(Math.max(count, sortKeys.length * 2));
  const keys = sortKeys.subarray(0, count);
  for (let i = 0; i < count; i++) keys[i] = -(rankAt(i) * MAX_PACKED + (MAX_PACKED - 1 - i));
  keys.sort();
  const order: number[] = new Array<number>(count);
  for (let i = 0; i < count; i++) order[i] = MAX_PACKED - 1 - (-(keys[i] ?? 0) % MAX_PACKED);
  return order;
}

const CELL_PX = 64;

/**
 * `count` lets callers reuse one candidate array across frames: only the first `count` are
 * considered.
 */
export function solveLabels(
  candidates: readonly LabelCandidate[],
  viewport: LabelViewport,
  metrics: LabelMetrics,
  count = candidates.length,
): PlacedLabel[] {
  const placed: PlacedLabel[] = [];
  const columns = Math.max(1, Math.ceil(viewport.widthPx / CELL_PX));
  const rows = Math.max(1, Math.ceil(viewport.heightPx / CELL_PX));
  const cells = new Map<number, PlacedLabel[]>();

  const cellRange = (label: PlacedLabel) => ({
    firstColumn: Math.max(0, Math.floor(label.left / CELL_PX)),
    lastColumn: Math.min(columns - 1, Math.floor((label.left + label.width) / CELL_PX)),
    firstRow: Math.max(0, Math.floor(label.top / CELL_PX)),
    lastRow: Math.min(rows - 1, Math.floor((label.top + label.height) / CELL_PX)),
  });

  const overlapsPlaced = (label: PlacedLabel) => {
    const range = cellRange(label);
    for (let row = range.firstRow; row <= range.lastRow; row++) {
      for (let column = range.firstColumn; column <= range.lastColumn; column++) {
        for (const other of cells.get(row * columns + column) ?? []) {
          if (
            label.left < other.left + other.width &&
            other.left < label.left + label.width &&
            label.top < other.top + other.height &&
            other.top < label.top + label.height
          ) {
            return true;
          }
        }
      }
    }
    return false;
  };

  for (const index of rankOrder(candidates, count)) {
    if (placed.length >= metrics.max) break;
    const candidate = candidates[index];
    if (!candidate) continue;
    const height = metrics.heightPx[candidate.kind];
    const isGroup = candidate.kind === 'group';
    // A group's label is centred on its outline's centroid (M4-T3); an object's starts to the
    // right of its body. Only a group needs its width to know where it starts.
    const width = isGroup ? metrics.measure(candidate.text, candidate.kind) : 0;
    const left = isGroup
      ? candidate.x - width / 2
      : candidate.x + candidate.radiusPx + metrics.gapPx;
    const top = candidate.y - height / 2;
    // Entirely inside the canvas, so no label is cut off at the edge. The cheap checks come
    // before measuring an object's text.
    if (left < 0 || top < 0 || left >= viewport.widthPx || top + height > viewport.heightPx)
      continue;
    const label: PlacedLabel = {
      id: candidate.id,
      text: candidate.text,
      kind: candidate.kind,
      left,
      top,
      width: isGroup ? width : metrics.measure(candidate.text, candidate.kind),
      height,
      ...(candidate.color === undefined ? {} : { color: candidate.color }),
    };
    if (
      label.left + label.width > viewport.widthPx ||
      label.top + label.height > viewport.heightPx
    ) {
      continue;
    }
    if (overlapsPlaced(label)) continue;
    placed.push(label);
    const range = cellRange(label);
    for (let row = range.firstRow; row <= range.lastRow; row++) {
      for (let column = range.firstColumn; column <= range.lastColumn; column++) {
        const key = row * columns + column;
        const list = cells.get(key);
        if (list) list.push(label);
        else cells.set(key, [label]);
      }
    }
  }
  return placed;
}
