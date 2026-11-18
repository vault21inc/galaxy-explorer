import { HIDE_SPOILERS, SHOW_SPOILERS } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { groupShapes } from '../src/render/groups/group-shapes.ts';
import { buildFillBuffers, buildLineBuffers } from '../src/render/groups/outline-buffers.ts';
import {
  GROUP_FILL_OPACITY,
  GROUP_LINE_WIDTH_PX,
  GROUP_OUTLINE_NESTING_SHARE,
  GROUP_OUTLINE_PADDING_SHARE,
  REDACTION_COLOR,
} from '../src/render/tuning.ts';

/** Turning the galaxy view's groups into outlines (rendering.md §6, M4-T3). */

const RADIUS_LY = 50_000;
const object = (id: string, x: number, z: number, y = 0) => ({ id, position: [x, y, z] }) as never;
const objects = [
  object('a', 0, 0),
  object('b', 4_000, 0),
  object('c', 20_000, 0, 300),
  object('d', 24_000, 2_000, 100),
];
const group = (
  id: string,
  members: string[],
  extra: Partial<{
    parentGroupId: string;
    isSpoiler: boolean;
    spoilerMember: string;
    style: object;
  }> = {},
) =>
  ({
    id,
    parentGroupId: extra.parentGroupId ?? null,
    members: members.map((objectId) => ({ objectId, isSpoiler: objectId === extra.spoilerMember })),
    outlineColor: '#c8a24a',
    style: extra.style ?? {},
    isSpoiler: extra.isSpoiler ?? false,
    namePlain: id,
    nameSpoiler: false,
    nameRedacted: id,
  }) as never;

/** The smallest distance from a point to the outline's points: about the padding. */
const clearance = (points: readonly (readonly [number, number])[], x: number, z: number) =>
  Math.min(...points.map(([px, pz]) => Math.hypot(px - x, pz - z)));

describe('groupShapes', () => {
  it('outlines a group around its members, at their mean height, with the defaults', () => {
    const [shape] = groupShapes([group('east', ['c', 'd'])], objects, SHOW_SPOILERS, RADIUS_LY);
    expect(shape).toMatchObject({
      id: 'east',
      y: 200,
      color: '#c8a24a',
      dashed: false,
      widthPx: GROUP_LINE_WIDTH_PX,
      fillOpacity: GROUP_FILL_OPACITY,
      label: 'east',
      memberCount: 2,
      redacted: false,
    });
    const padding = RADIUS_LY * GROUP_OUTLINE_PADDING_SHARE;
    expect(clearance(shape?.loops[0] ?? [], 20_000, 0)).toBeGreaterThanOrEqual(padding);
  });

  it('encloses nested groups, with more padding for each level below', () => {
    const shapes = groupShapes(
      [group('sector', []), group('west', ['a', 'b'], { parentGroupId: 'sector' })],
      objects,
      SHOW_SPOILERS,
      RADIUS_LY,
    );
    const sector = shapes.find((shape) => shape.id === 'sector');
    expect(sector?.memberCount).toBe(2);
    const padding = RADIUS_LY * (GROUP_OUTLINE_PADDING_SHARE + GROUP_OUTLINE_NESTING_SHARE);
    expect(clearance(sector?.loops[0] ?? [], 0, 0)).toBeGreaterThanOrEqual(padding);
  });

  it('while spoilers are hidden, leaves out spoiler memberships and greys spoiler groups', () => {
    const groups = [
      group('west', ['a', 'b'], { spoilerMember: 'b' }),
      group('secret', ['c'], { isSpoiler: true }),
    ];
    const hidden = groupShapes(groups, objects, HIDE_SPOILERS, RADIUS_LY);
    expect(hidden.find((shape) => shape.id === 'west')?.memberCount).toBe(1);
    expect(hidden.find((shape) => shape.id === 'secret')).toMatchObject({
      color: REDACTION_COLOR,
      redacted: true,
    });
    expect(hidden.find((shape) => shape.id === 'secret')?.label).not.toBe('secret');
    const shown = groupShapes(groups, objects, SHOW_SPOILERS, RADIUS_LY);
    expect(shown.find((shape) => shape.id === 'west')?.memberCount).toBe(2);
  });

  it('skips groups with nothing to enclose, and survives a cycle of parents', () => {
    expect(groupShapes([group('empty', [])], objects, SHOW_SPOILERS, RADIUS_LY)).toEqual([]);
    const cycle = groupShapes(
      [group('x', ['a'], { parentGroupId: 'y' }), group('y', ['c'], { parentGroupId: 'x' })],
      objects,
      SHOW_SPOILERS,
      RADIUS_LY,
    );
    expect(cycle.map((shape) => shape.memberCount)).toEqual([2, 2]);
  });
});

describe('outline buffers', () => {
  it('merges every hull outline into one batch of segments and one fan of triangles', () => {
    const shapes = groupShapes(
      [group('west', ['a', 'b']), group('east', ['c'], { style: { lineWidthPx: 4 } })],
      objects,
      SHOW_SPOILERS,
      RADIUS_LY,
    );
    const pointCount = shapes.reduce((sum, shape) => sum + (shape.loops[0]?.length ?? 0), 0);
    const lines = buildLineBuffers(shapes);
    expect(lines.segmentCount).toBe(pointCount);
    expect(lines.positions).toHaveLength(pointCount * 6);
    // Each group's segments carry its own width.
    expect(lines.widths.at(-1)).toBe(4);
    expect(lines.widths[0]).toBe(GROUP_LINE_WIDTH_PX);
    const fill = buildFillBuffers(shapes);
    expect(fill.index).toHaveLength(pointCount * 3);
    expect(fill.colors[3]).toBeCloseTo(GROUP_FILL_OPACITY);
  });

  it('merges rings into the same batches: two loops each, and a strip of quads', () => {
    const shapes = groupShapes(
      [group('hull', ['a']), group('ring', ['c', 'd'], { style: { shape: 'ring' } })],
      objects,
      SHOW_SPOILERS,
      RADIUS_LY,
    );
    const [hull, ring] = shapes;
    expect(ring?.loops).toHaveLength(2);
    const ringPoints = (ring?.loops[0]?.length ?? 0) + (ring?.loops[1]?.length ?? 0);
    const lines = buildLineBuffers(shapes);
    expect(lines.segmentCount).toBe((hull?.loops[0]?.length ?? 0) + ringPoints);
    const fill = buildFillBuffers(shapes);
    // The hull's fan, one triangle per point; the ring's strip, two per step.
    expect(fill.index).toHaveLength(((hull?.loops[0]?.length ?? 0) + ringPoints) * 3);
    // The ring's indices point past the hull's vertices.
    expect(Math.min(...fill.index.slice((hull?.loops[0]?.length ?? 0) * 3))).toBe(
      hull?.fill.vertices.length,
    );
  });
});

describe('ring groups (D-53)', () => {
  const padding = RADIUS_LY * GROUP_OUTLINE_PADDING_SHARE;

  it('draws a ring around the galaxy centre, through its members, with the label on the band', () => {
    const [ring] = groupShapes(
      [group('rim', ['b', 'c'], { style: { shape: 'ring' } })],
      objects,
      SHOW_SPOILERS,
      RADIUS_LY,
    );
    expect(ring).toMatchObject({
      kind: 'ring',
      ring: { center: [0, 0], innerRadiusLy: 4_000 - padding, outerRadiusLy: 20_000 + padding },
      y: 150,
    });
    const [x = 0, , z = 0] = ring?.labelAnchor ?? [];
    expect(Math.hypot(x, z)).toBeCloseTo(12_000);
    // GROUP_RING_LABEL_DEG: above the centre, toward −z.
    expect(z).toBeLessThan(0);
  });

  it('draws a pinned ring with no members, at height 0', () => {
    const [ring] = groupShapes(
      [group('core', [], { style: { shape: 'ring', ring: { outerRadiusLy: 3_000 } } })],
      objects,
      SHOW_SPOILERS,
      RADIUS_LY,
    );
    expect(ring).toMatchObject({
      kind: 'ring',
      y: 0,
      memberCount: 0,
      ring: { innerRadiusLy: 0, outerRadiusLy: 3_000 },
    });
    expect(ring?.loops).toHaveLength(1);
  });

  it('leaves hidden spoiler memberships out of the radii', () => {
    const groups = [group('rim', ['b', 'd'], { style: { shape: 'ring' }, spoilerMember: 'd' })];
    const [hidden] = groupShapes(groups, objects, HIDE_SPOILERS, RADIUS_LY);
    expect(hidden?.ring?.outerRadiusLy).toBe(4_000 + padding);
    const [shown] = groupShapes(groups, objects, SHOW_SPOILERS, RADIUS_LY);
    expect(shown?.ring?.outerRadiusLy).toBeCloseTo(Math.hypot(24_000, 2_000) + padding);
  });
});
