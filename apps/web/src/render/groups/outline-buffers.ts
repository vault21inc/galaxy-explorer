import { hexToLinear } from '../color.ts';
import type { GroupShape } from './group-shapes.ts';

/** The arrays for one merged batch of outline lines (`LineSegmentsGeometry`). */
export interface LineBuffers {
  /** Per segment: start x, y, z, then end x, y, z. */
  positions: Float32Array;
  /** Per segment: the start's linear r, g, b, then the end's (the same: one color per group). */
  colors: Float32Array;
  /** Per segment: the line width in CSS pixels (the `instanceWidth` attribute). */
  widths: Float32Array;
  /** For tests and the hooks: how many segments each group has, in order. */
  segmentCount: number;
}

export interface FillBuffers {
  /** Per vertex: x, y, z. Each group's fill points, in order. */
  positions: Float32Array;
  /** Per vertex: linear r, g, b and the fill's alpha. */
  colors: Float32Array;
  /** Triangles: each group's own (a fan for a hull or disc, a strip of quads for a ring). */
  index: Uint32Array;
}

/** How many segments a shape's lines take: one per point of each closed loop. */
const segmentsOf = (shape: GroupShape) => shape.loops.reduce((sum, loop) => sum + loop.length, 0);

/** One group's loops as line segments, appended at `offset` (in segments). */
function writeSegments(shape: GroupShape, buffers: LineBuffers, offset: number): void {
  const [r, g, b] = hexToLinear(shape.color);
  const { y } = shape;
  let segment = offset;
  for (const loop of shape.loops) {
    for (let index = 0; index < loop.length; index++) {
      const from = loop[index];
      const to = loop[(index + 1) % loop.length];
      if (!from || !to) continue;
      buffers.positions.set([from[0], y, from[1], to[0], y, to[1]], segment * 6);
      buffers.colors.set([r, g, b, r, g, b], segment * 6);
      buffers.widths[segment] = shape.widthPx;
      segment++;
    }
  }
}

/** Every outline of these shapes merged into one batch: one draw call however many groups. */
export function buildLineBuffers(shapes: readonly GroupShape[]): LineBuffers {
  const segmentCount = shapes.reduce((sum, shape) => sum + segmentsOf(shape), 0);
  const buffers: LineBuffers = {
    positions: new Float32Array(segmentCount * 6),
    colors: new Float32Array(segmentCount * 6),
    widths: new Float32Array(segmentCount),
    segmentCount,
  };
  let offset = 0;
  for (const shape of shapes) {
    writeSegments(shape, buffers, offset);
    offset += segmentsOf(shape);
  }
  return buffers;
}

/**
 * Every group's fill merged into one mesh. Each shape brings its own triangles (D-53): a hull's
 * fan from its centroid, or a ring's strip of quads between its circles. They're copied in with
 * their indices moved past the groups before them.
 */
export function buildFillBuffers(shapes: readonly GroupShape[]): FillBuffers {
  const vertexCount = shapes.reduce((sum, shape) => sum + shape.fill.vertices.length, 0);
  const indexCount = shapes.reduce((sum, shape) => sum + shape.fill.triangles.length, 0);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const index = new Uint32Array(indexCount);
  let vertex = 0;
  let written = 0;
  for (const shape of shapes) {
    const [r, g, b] = hexToLinear(shape.color);
    const first = vertex;
    for (const [x, z] of shape.fill.vertices) {
      positions.set([x, shape.y, z], vertex * 3);
      colors.set([r, g, b, shape.fillOpacity], vertex * 4);
      vertex++;
    }
    for (const corner of shape.fill.triangles) index[written++] = first + corner;
  }
  return { positions, colors, index };
}
