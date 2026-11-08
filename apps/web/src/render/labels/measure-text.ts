import {
  GROUP_LABEL_FONT_PX,
  GROUP_LABEL_LETTER_SPACING_EM,
  LABEL_FONT_FAMILY,
  OBJECT_LABEL_FONT_PX,
} from '../tuning.ts';
import type { LabelKind } from './solve-labels.ts';

export const LABEL_FONTS: Record<LabelKind, string> = {
  object: `500 ${OBJECT_LABEL_FONT_PX.toString()}px ${LABEL_FONT_FAMILY}`,
  group: `600 ${GROUP_LABEL_FONT_PX.toString()}px ${LABEL_FONT_FAMILY}`,
};

let context: CanvasRenderingContext2D | null = null;
/** Cached widths, one map per kind, keyed by the text itself (no string building per lookup). */
const widths: Record<LabelKind, Map<string, number>> = { object: new Map(), group: new Map() };

/**
 * A label's width in CSS pixels, measured once per text and kind with a 2D canvas, then cached
 * (rendering.md §11). Group labels are uppercase with letter spacing, added per character.
 */
export function measureLabel(text: string, kind: LabelKind): number {
  const cache = widths[kind];
  const cached = cache.get(text);
  if (cached !== undefined) return cached;
  context ??= document.createElement('canvas').getContext('2d');
  let width = text.length * OBJECT_LABEL_FONT_PX * 0.6; // a fallback if there's no 2D canvas
  if (context) {
    context.font = LABEL_FONTS[kind];
    const shown = kind === 'group' ? text.toUpperCase() : text;
    width = context.measureText(shown).width;
    if (kind === 'group')
      width += shown.length * GROUP_LABEL_LETTER_SPACING_EM * GROUP_LABEL_FONT_PX;
  }
  width = Math.ceil(width);
  cache.set(text, width);
  return width;
}
