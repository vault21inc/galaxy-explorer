import type { GroupShape } from './group-shapes.ts';

/**
 * The groups drawn now (M4-T3), like the objects' scene index: `GroupOutlines` publishes its
 * shapes, the label layer reads their anchors after each frame, and the test hooks report them.
 */
let drawn: readonly GroupShape[] = [];
let byId = new Map<string, GroupShape>();

export function publishGroups(shapes: readonly GroupShape[]): void {
  drawn = shapes;
  byId = new Map(shapes.map((shape) => [shape.id, shape]));
}

export function drawnGroups(): readonly GroupShape[] {
  return drawn;
}

export function drawnGroup(id: string): GroupShape | undefined {
  return byId.get(id);
}
