/** The character used to black out hidden text (ux.md §6). */
export const REDACTION_CHAR = '▇';

/** Shortest and longest redaction bar, in characters. */
const MIN_BAR_LENGTH = 3;
const MAX_BAR_LENGTH = 40;
/** Bar lengths are rounded up to a multiple of this, so a bar doesn't reveal the exact length. */
const BAR_LENGTH_STEP = 3;

/** Counts what a reader sees as characters, so an emoji or accented letter counts once. */
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** A bar of `▇` about as long as `hiddenText`. */
export function redactionBar(hiddenText: string): string {
  const length = Array.from(graphemes.segment(hiddenText.trim())).length;
  const rounded = Math.ceil(length / BAR_LENGTH_STEP) * BAR_LENGTH_STEP;
  return REDACTION_CHAR.repeat(Math.min(Math.max(rounded, MIN_BAR_LENGTH), MAX_BAR_LENGTH));
}
