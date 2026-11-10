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
  /** Per vertex: x, y, z. Each group is its centroid then its outline points. */
  positions: Float32Array;
  /** Per vertex: linear r, g, b and the fill's alpha. */
  colors: Float32Array;
  /** Triangles: a fan from each group's centroid. */
  index: Uint32Array;
}

/** One group's outline as line segments, appended at `offset` (in segments). */
function writeSegments(shape: GroupShape, buffers: LineBuffers, offset: number): void {
  const [r, g, b] = hexToLinear(shape.color);
  const { points, y } = shape;
  for (let index = 0; index < points.length; index++) {
    const from = points[index];
    const to = points[(index + 1) % points.length];
    if (!from || !to) continue;
    const segment = offset + index;
    buffers.positions.set([from[0], y, from[1], to[0], y, to[1]], segment * 6);
    buffers.colors.set([r, g, b, r, g, b], segment * 6);
    buffers.widths[segment] = shape.widthPx;
  }
}

/** Every outline of these shapes merged into one batch: one draw call however many groups. */
export function buildLineBuffers(shapes: readonly GroupShape[]): LineBuffers {
  const segmentCount = shapes.reduce((sum, shape) => sum + shape.points.length, 0);
  const buffers: LineBuffers = {
    positions: new Float32Array(segmentCount * 6),
    colors: new Float32Array(segmentCount * 6),
    widths: new Float32Array(segmentCount),
    segmentCount,
  };
  let offset = 0;
  for (const shape of shapes) {
    writeSegments(shape, buffers, offset);
    offset += shape.points.length;
  }
  return buffers;
}

/**
 * Every group's fill merged into one mesh. An outline is convex (a padded convex hull, smoothed),
 * so a fan of triangles from its centroid covers it exactly.
 */
export function buildFillBuffers(shapes: readonly GroupShape[]): FillBuffers {
  const vertexCount = shapes.reduce((sum, shape) => sum + shape.points.length + 1, 0);
  const triangleCount = shapes.reduce((sum, shape) => sum + shape.points.length, 0);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 4);
  const index = new Uint32Array(triangleCount * 3);
  let vertex = 0;
  let triangle = 0;
  for (const shape of shapes) {
    const [r, g, b] = hexToLinear(shape.color);
    const center = vertex;
    const write = (x: number, z: number) => {
      positions.set([x, shape.y, z], vertex * 3);
      colors.set([r, g, b, shape.fillOpacity], vertex * 4);
      vertex++;
    };
    write(shape.centroid[0], shape.centroid[2]);
    for (const [x, z] of shape.points) write(x, z);
    const count = shape.points.length;
    for (let i = 0; i < count; i++) {
      index.set([center, center + 1 + i, center + 1 + ((i + 1) % count)], triangle * 3);
      triangle++;
    }
  }
  return { positions, colors, index };
}
