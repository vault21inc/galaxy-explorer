import { useSyncExternalStore } from 'react';

/**
 * The three widths the app lays itself out for (docs/plan/later/phone-usability.md, "Tiers"):
 *
 * - **slim:** phones, upright or on their side: narrower than 768 px, or shorter than 500 px.
 *   The top bar becomes the mark, a location chip, Search and More, and panels open as sheets.
 * - **compact:** tablets and smaller laptop windows, 768 to 1,279 px wide: today's bar with
 *   the app's name reduced to its mark and the buttons to their icons.
 * - **full:** 1,280 px and wider: the bar with every button's text.
 *
 * These are the only definitions. `index.css` declares the same queries as Tailwind variants
 * (`slim:`, `compact:`, `full:`, `short:`, `coarse:`), since CSS can't import them, and a unit
 * test fails if the two disagree. Use the variants where the markup is the same at every width
 * and only its look changes; use the hooks where different markup is rendered.
 */
export const LAYOUT_QUERIES = {
  // "Narrower than 768 or shorter than 500", as one query: `not` applies to the whole of it.
  // A comma list would read the same in a browser, but Tailwind's @custom-variant splits a
  // comma into two selectors.
  slim: 'not all and (min-width: 768px) and (min-height: 500px)',
  compact: '(min-width: 768px) and (max-width: 1279.98px) and (min-height: 500px)',
  full: '(min-width: 1280px) and (min-height: 500px)',
  /** A phone on its side: sheets and the info panel come from the right, not the bottom. */
  short: '(max-height: 499.98px)',
  /** The main pointer is a finger: controls grow to be tapped. */
  coarse: '(pointer: coarse)',
} as const;

/**
 * Whether any pointer on the device can point precisely (a mouse or trackpad). Phones and
 * tablets without one report false. Not a variant: it decides what's offered, not how it looks.
 */
export const FINE_POINTER_QUERY = '(any-pointer: fine)';

export type LayoutTier = 'slim' | 'compact' | 'full';

/** Whether a media query matches now; false where there's no `matchMedia` (unit tests). */
export function matches(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false;
}

/** The tier now, read from the media queries. Slim wins, so a short wide window is slim. */
export function currentTier(): LayoutTier {
  if (matches(LAYOUT_QUERIES.slim)) return 'slim';
  return matches(LAYOUT_QUERIES.compact) ? 'compact' : 'full';
}

/** Follows a media query, re-rendering when it starts or stops matching (a rotation, a resize). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => undefined;
      }
      const list = window.matchMedia(query);
      list.addEventListener('change', onChange);
      return () => {
        list.removeEventListener('change', onChange);
      };
    },
    () => matches(query),
  );
}

/** The layout tier, following the window as it's resized or turned. */
export function useLayoutTier(): LayoutTier {
  const slim = useMediaQuery(LAYOUT_QUERIES.slim);
  const compact = useMediaQuery(LAYOUT_QUERIES.compact);
  if (slim) return 'slim';
  return compact ? 'compact' : 'full';
}

/** A window under 500 px high: a phone on its side. */
export function useShort(): boolean {
  return useMediaQuery(LAYOUT_QUERIES.short);
}
