import type { ShownLabel } from '../labels/label-pool.ts';
import { LABEL_FONTS } from '../labels/measure-text.ts';
import {
  GROUP_LABEL_FONT_PX,
  GROUP_LABEL_HEIGHT_PX,
  GROUP_LABEL_LETTER_SPACING_EM,
  LABEL_OUTLINE_COLOR,
  LABEL_OUTLINE_PX,
  OBJECT_LABEL_HEIGHT_PX,
} from '../tuning.ts';

/**
 * Paints the labels into a recorded clip's frame (D-56). On screen, labels are HTML over the
 * canvas (rendering.md §11), so the canvas's own pixels don't have them; a clip gets them drawn
 * here instead, in the same fonts, colors and dark outline, at the clip's scale.
 *
 * `scale` is the clip's pixels per CSS pixel of the frame on screen (1080 ÷ the frame's width).
 */
export function paintLabels(
  context: CanvasRenderingContext2D,
  labels: readonly ShownLabel[],
  scale: number,
): void {
  if (labels.length === 0) return;
  context.save();
  // Draw in CSS pixels, as the labels were placed; the transform scales them up.
  context.setTransform(scale, 0, 0, scale, 0, 0);
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.strokeStyle = LABEL_OUTLINE_COLOR;
  // CSS's text stroke is centred on each glyph's edge, as canvas strokes are.
  context.lineWidth = LABEL_OUTLINE_PX;
  for (const label of labels) {
    const group = label.kind === 'group';
    context.font = LABEL_FONTS[label.kind];
    // Group labels are spaced capitals (ux.md §11). Browsers without canvas letter spacing
    // draw them unspaced, a little narrower than on screen.
    if ('letterSpacing' in context) {
      context.letterSpacing = group
        ? `${String(GROUP_LABEL_LETTER_SPACING_EM * GROUP_LABEL_FONT_PX)}px`
        : '0px';
    }
    const text = group ? label.text.toUpperCase() : label.text;
    // The text sits in the middle of its line box, as the HTML label's line height puts it.
    const y = label.top + (group ? GROUP_LABEL_HEIGHT_PX : OBJECT_LABEL_HEIGHT_PX) / 2;
    context.strokeText(text, label.left, y);
    context.fillStyle = label.color;
    context.fillText(text, label.left, y);
  }
  context.restore();
}
