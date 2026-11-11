import type { Appearance } from '@ge/domain';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';

/** Unsaved appearance values by form path (`appearance.planet.seaLevel`), for one object. */
export type PreviewValues = Readonly<Record<string, unknown>>;

interface AppearancePreviewState {
  /** By object id. */
  values: ReadonlyMap<string, PreviewValues>;
  /** Shows `value` at `path` until it's cleared: while a slider is dragged or a color picked. */
  show: (id: string, path: string, value: unknown) => void;
  /** Ends the preview of one path, once its saved value has arrived (or the edit failed). */
  clear: (id: string, path: string) => void;
}

/**
 * Appearance values being edited but not yet saved (M6-T2): the form's sliders and color
 * pickers write here on every move, and the renderers draw them as if they were saved, so the
 * globe follows the slider. Saving clears them once the saved view has arrived, so nothing
 * jumps back in between.
 */
export const useAppearancePreview = create<AppearancePreviewState>()((set) => ({
  values: new Map(),
  show: (id, path, value) => {
    set(({ values }) => {
      const next = new Map(values);
      next.set(id, { ...values.get(id), [path]: value });
      return { values: next };
    });
  },
  clear: (id, path) => {
    set(({ values }) => {
      const current = values.get(id);
      if (!current || !(path in current)) return {};
      const next = new Map(values);
      const remaining = Object.fromEntries(Object.entries(current).filter(([key]) => key !== path));
      if (Object.keys(remaining).length === 0) next.delete(id);
      else next.set(id, remaining);
      return { values: next };
    });
  },
}));

/**
 * An object's resolved appearance with its previewed values applied. Paths outside
 * `appearance` are ignored.
 */
export function withPreview(appearance: Appearance, values: PreviewValues | undefined): Appearance {
  if (!values) return appearance;
  let result: Record<string, unknown> = appearance;
  for (const [path, value] of Object.entries(values)) {
    const [top, ...keys] = path.split('.');
    if (top !== 'appearance' || keys.length === 0) continue;
    result = setPath(result, keys, value);
  }
  return result;
}

function setPath(
  doc: Record<string, unknown>,
  keys: readonly string[],
  value: unknown,
): Record<string, unknown> {
  const [key = '', ...rest] = keys;
  const child = doc[key];
  const inner =
    typeof child === 'object' && child !== null && !Array.isArray(child)
      ? (child as Record<string, unknown>)
      : {};
  return { ...doc, [key]: rest.length === 0 ? value : setPath(inner, rest, value) };
}

/**
 * `value`, but changing at most once every `intervalMs`: the first change shows at once, and
 * a stream of changes (a slider being dragged) shows the latest one every `intervalMs`. The
 * planets re-bake at this pace (rendering.md §9), so a drag stays smooth.
 */
export function useRateLimited<T>(value: T, intervalMs: number): T {
  const [shown, setShown] = useState(value);
  const lastMs = useRef(Number.NEGATIVE_INFINITY);
  useEffect(() => {
    const waitMs = Math.max(0, lastMs.current + intervalMs - performance.now());
    const timer = setTimeout(() => {
      lastMs.current = performance.now();
      setShown(() => value);
    }, waitMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, intervalMs]);
  return shown;
}
