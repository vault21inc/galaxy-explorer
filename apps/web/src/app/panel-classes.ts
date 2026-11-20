/**
 * Where panels sit under the top bar (docs/plan/later/phone-usability.md, L3-T4), whatever its
 * height: 3.25 rem below the bar's own top padding, which grows to clear a phone's notch
 * (`env(safe-area-inset-top)`, with `viewport-fit=cover`). On a laptop that's 64 px, as before.
 */
export const UNDER_BAR = 'top-[calc(max(0.75rem,env(safe-area-inset-top))+3.25rem)]';

/**
 * The height of a sheet that rises from the bottom of the window to just under the top bar:
 * the window less `UNDER_BAR`. A height, not a top edge, so the sheet stays hung from the
 * bottom while its height animates (the details sheet's `full` stop, L3-T8).
 */
export const UP_TO_BAR_HEIGHT =
  'h-[calc(100dvh_-_max(0.75rem,env(safe-area-inset-top))_-_3.25rem)]';

/**
 * A page's own panel, floating over the canvas at the top left (home, sign-in, account, the
 * About pages): its width, set by the page, never wider than the window less its margins. On a
 * phone (slim) it spans the window, clear of the notch at either side.
 */
export const PAGE_PANEL = [
  'absolute',
  UNDER_BAR,
  'left-[max(1rem,env(safe-area-inset-left))] max-w-[calc(100%-2rem)]',
  'slim:right-[max(0.5rem,env(safe-area-inset-right))] slim:left-[max(0.5rem,env(safe-area-inset-left))] slim:w-auto slim:max-w-none',
].join(' ');

/**
 * A page that fills the window under the bar (universe settings, admin), with its margins
 * narrower on a phone. Its tables scroll inside it, never the page.
 */
export const FULL_PAGE_PANEL = [
  'absolute',
  UNDER_BAR,
  'inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))]',
  'slim:right-[max(0.5rem,env(safe-area-inset-right))] slim:left-[max(0.5rem,env(safe-area-inset-left))] slim:p-3',
].join(' ');
