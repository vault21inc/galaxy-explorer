/**
 * Class names shared by the top bar's buttons (docs/plan/later/phone-usability.md, "Tiers").
 *
 * On the compact tier (768 to 1,279 px wide) a button shows its icon alone. Its text stays in
 * the page as `sr-only`, so it's still the button's accessible name and what speech input and
 * the tests find it by. The slim tier has its own bar (app/slim-bar.tsx) once it's built;
 * until then it shows the compact one.
 */

/** A button's text: shown on the full bar, kept for screen readers below it. */
export const BAR_TEXT = 'compact:sr-only slim:sr-only';

/**
 * A top-bar button: it takes clicks through the bar's pass-through header, and on a touch
 * screen at the compact tier it grows to 40 px, since a finger is bigger than a pointer.
 */
export const BAR_BUTTON = 'pointer-events-auto compact:coarse:h-10 compact:coarse:min-w-10';
