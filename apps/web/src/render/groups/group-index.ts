import { useSyncExternalStore } from 'react';
import type { GroupShape } from './group-shapes.ts';

/**
 * The groups drawn now (M4-T3), like the objects' scene index: `GroupOutlines` publishes its
 * shapes; the label layer reads their anchors after each frame, the selection rings ring a
 * selected group's members (M4-T4), and the test hooks report them.
 */
let drawn: readonly GroupShape[] = [];
let byId = new Map<string, GroupShape>();
const listeners = new Set<() => void>();

export function publishGroups(shapes: readonly GroupShape[]): void {
  drawn = shapes;
  byId = new Map(shapes.map((shape) => [shape.id, shape]));
  for (const listener of listeners) listener();
}

export function drawnGroups(): readonly GroupShape[] {
  return drawn;
}

export function drawnGroup(id: string): GroupShape | undefined {
  return byId.get(id);
}

/** Calls `listener` whenever the drawn groups change; returns the unsubscribe. */
export function onGroupsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The drawn groups, as React state: components re-render when they change. */
export function useDrawnGroups(): readonly GroupShape[] {
  return useSyncExternalStore(onGroupsChange, drawnGroups);
}
