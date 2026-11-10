import { HIDE_SPOILERS, SHOW_SPOILERS } from '@ge/domain';
import { describe, expect, it } from 'vitest';
import { deleteDescription } from '../src/editor/actions/delete.ts';
import { addWaypoint, createRouteRequest, routeName } from '../src/editor/actions/route.ts';
import { movedWaypoints, withoutWaypoint } from '../src/panels/sections/waypoints-section.tsx';
import { outlinerRows } from '../src/panels/outliner/outliner-tree.ts';
import {
  buildRouteBuffers,
  routeLabelAnchor,
  routeShapes,
  shiftRouteEnds,
} from '../src/render/routes/route-shapes.ts';
import { REDACTION_COLOR, ROUTE_COLOR, ROUTE_LINE_WIDTH_PX } from '../src/render/tuning.ts';

/** Routes (M4-T7): their shapes and buffers, the Route tool's helpers and the panel's edits. */

const object = (id: string, x: number, z: number) =>
  ({ id, position: [x, 0, z], namePlain: id, baseType: 'system' }) as never;
const objects = [object('a', 0, 0), object('b', 10, 0), object('c', 10, 10), object('d', 0, 10)];
const route = (id: string, waypoints: string[], extra: object = {}) =>
  ({
    id,
    waypoints,
    style: {},
    status: 'published',
    isSpoiler: false,
    namePlain: id,
    nameSpoiler: false,
    nameRedacted: id,
    ...extra,
  }) as never;

describe('routeShapes', () => {
  it('runs through the waypoints in order, with the default look', () => {
    const [shape] = routeShapes([route('r', ['a', 'b', 'c'])], objects, SHOW_SPOILERS);
    expect(shape).toMatchObject({
      waypointIds: ['a', 'b', 'c'],
      points: [
        [0, 0, 0],
        [10, 0, 0],
        [10, 0, 10],
      ],
      color: ROUTE_COLOR,
      widthPx: ROUTE_LINE_WIDTH_PX,
      dashed: false,
      label: 'r',
    });
  });

  it('skips waypoints not drawn, and leaves out routes left with fewer than two', () => {
    const shapes = routeShapes(
      [route('long', ['a', 'gone', 'c']), route('short', ['a', 'gone'])],
      objects,
      SHOW_SPOILERS,
    );
    expect(shapes.map((shape) => [shape.id, shape.waypointIds])).toEqual([['long', ['a', 'c']]]);
  });

  it('draws a hidden spoiler route grey, with a redacted label', () => {
    const spoiler = route('secret', ['a', 'b'], { isSpoiler: true, style: { color: '#ff0000' } });
    const [hidden] = routeShapes([spoiler], objects, HIDE_SPOILERS);
    expect(hidden?.color).toBe(REDACTION_COLOR);
    expect(hidden?.label).not.toContain('secret');
    expect(routeShapes([spoiler], objects, SHOW_SPOILERS)[0]?.color).toBe('#ff0000');
  });
});

describe('routeLabelAnchor', () => {
  it('is the middle of the middle segment', () => {
    expect(
      routeLabelAnchor([
        [0, 0, 0],
        [10, 0, 0],
      ]),
    ).toEqual([5, 0, 0]);
    // Three segments: the second.
    expect(
      routeLabelAnchor([
        [0, 0, 0],
        [10, 0, 0],
        [10, 0, 10],
        [0, 0, 10],
      ]),
    ).toEqual([10, 0, 5]);
    // Two segments: the first, just before the middle point.
    expect(
      routeLabelAnchor([
        [0, 0, 0],
        [10, 0, 0],
        [10, 0, 10],
      ]),
    ).toEqual([5, 0, 0]);
    expect(routeLabelAnchor([[0, 0, 0]])).toBeNull();
  });
});

describe('route buffers', () => {
  const shapes = routeShapes(
    [route('r', ['a', 'b', 'c']), route('s', ['c', 'd'], { style: { widthPx: 4 } })],
    objects,
    SHOW_SPOILERS,
  );
  const buffers = buildRouteBuffers(shapes);

  it('has n − 1 segments per route, and routes don’t join', () => {
    expect(buffers.segmentCount).toBe(3);
    expect([...buffers.positions.slice(12, 18)]).toEqual([10, 0, 10, 0, 0, 10]);
    expect([...buffers.widths]).toEqual([2, 2, 4]);
    expect(buffers.ends).toEqual(['a', 'b', 'b', 'c', 'c', 'd']);
  });

  it('shifts only the ends at moving objects, and puts them back', () => {
    const live = buffers.positions.slice();
    shiftRouteEnds(buffers.positions, live, buffers.ends, new Set(['b']), [1, 2, 3]);
    // Segment 0 ends at b, segment 1 starts there.
    expect([...live.slice(0, 12)]).toEqual([0, 0, 0, 11, 2, 3, 11, 2, 3, 10, 0, 10]);
    expect([...live.slice(12)]).toEqual([...buffers.positions.slice(12)]);
    shiftRouteEnds(buffers.positions, live, buffers.ends, null, [0, 0, 0]);
    expect(live).toEqual(buffers.positions);
  });
});

describe('making routes', () => {
  it('the Route tool adds a click unless it repeats the last waypoint', () => {
    expect(addWaypoint([], 'a')).toEqual(['a']);
    expect(addWaypoint(['a'], 'a')).toEqual(['a']);
    expect(addWaypoint(['a', 'b'], 'a')).toEqual(['a', 'b', 'a']);
  });

  it('names a route after its ends', () => {
    expect(routeName('Aster', 'Corvid')).toBe('Aster to Corvid');
    expect(routeName('Aster', 'Aster')).toBe('Aster round trip');
  });

  it('creates the route and its waypoints in one batch', () => {
    expect(createRouteRequest('m', ['a', 'b', 'b', 'c'], 'Run')).toEqual({
      description: 'Create route “Run”',
      operations: [
        { op: 'create', kind: 'route', mapId: 'm', data: { name: expect.anything() as never } },
        { op: 'setWaypoints', id: '$op:0', data: ['a', 'b', 'c'] },
      ],
    });
    expect(createRouteRequest('m', ['a', 'a'], 'Run')).toBeNull();
  });

  it('the panel moves and removes waypoints, merging neighbours that meet', () => {
    expect(movedWaypoints(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
    expect(withoutWaypoint(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
    expect(withoutWaypoint(['a', 'b', 'a', 'c'], 1)).toEqual(['a', 'c']);
  });

  it('a delete of routes says so', () => {
    expect(
      deleteDescription([
        { namePlain: 'x', kind: 'route' },
        { namePlain: 'y', kind: 'route' },
      ]),
    ).toBe('Delete 2 routes');
    expect(
      deleteDescription([
        { namePlain: 'x', kind: 'route' },
        { namePlain: 'y', kind: 'group' },
      ]),
    ).toBe('Delete 2 items');
  });
});

describe('the outliner lists routes (M4-T7)', () => {
  it('under a Routes row, by name, with their waypoint counts', () => {
    const rows = outlinerRows(objects, [], [], SHOW_SPOILERS, [
      route('Zed Run', ['a', 'b']),
      route('Alpha Run', ['a', 'b', 'c']),
    ]);
    const routeRows = rows.filter((row) => row.parentKey === 'routes');
    expect(rows.find((row) => row.key === 'routes')).toMatchObject({ text: 'Routes', level: 1 });
    expect(routeRows.map((row) => [row.text, row.kind, row.badge])).toEqual([
      ['Alpha Run', 'route', '3'],
      ['Zed Run', 'route', '2'],
    ]);
  });
});
