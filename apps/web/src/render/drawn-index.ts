import { useSyncExternalStore } from 'react';

/**
 * A list of things a renderer has drawn, by id, that other parts of the canvas read without
 * React props: the label layer after each frame, the selection rings and the test hooks. The
 * renderer publishes its whole list when it rebuilds (never per frame); readers either ask for
 * it or subscribe. Group outlines (M4-T3) and routes (M4-T7) each have one.
 */
export interface DrawnIndex<T extends { id: string }> {
  // Properties holding functions, not methods: each is used on its own, with no `this`.
  publish: (items: readonly T[]) => void;
  all: () => readonly T[];
  get: (id: string) => T | undefined;
  /** Calls `listener` whenever the list changes; returns the unsubscribe. */
  onChange: (listener: () => void) => () => void;
  /** The list, as React state: components re-render when it changes. */
  useAll: () => readonly T[];
}

export function createDrawnIndex<T extends { id: string }>(): DrawnIndex<T> {
  let drawn: readonly T[] = [];
  let byId = new Map<string, T>();
  const listeners = new Set<() => void>();
  const onChange = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  const all = () => drawn;
  return {
    publish: (items) => {
      drawn = items;
      byId = new Map(items.map((item) => [item.id, item]));
      for (const listener of listeners) listener();
    },
    all,
    get: (id) => byId.get(id),
    onChange,
    useAll: () => useSyncExternalStore(onChange, all),
  };
}
