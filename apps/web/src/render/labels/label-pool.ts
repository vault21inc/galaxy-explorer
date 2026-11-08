import {
  GROUP_LABEL_HEIGHT_PX,
  GROUP_LABEL_LETTER_SPACING_EM,
  LABEL_MAX,
  OBJECT_LABEL_HEIGHT_PX,
  OBJECT_LABEL_OPACITY,
} from '../tuning.ts';
import { LABEL_FONTS } from './measure-text.ts';
import type { LabelKind, PlacedLabel } from './solve-labels.ts';

/**
 * The label elements (rendering.md §11): LABEL_MAX absolutely positioned `<div>`s, created once
 * and reused. Showing a frame's labels moves each element with `transform` only. Its text and
 * style change only when the element is given to a different label, so the browser rarely has
 * to lay text out again.
 */
interface Slot {
  element: HTMLDivElement;
  id: string | null;
  text: string;
  kind: LabelKind | null;
  visible: boolean;
}

/** Styles per kind. Labels get a dark outline so they read on any background (ux.md §10). */
const KIND_STYLES: Record<LabelKind, Partial<CSSStyleDeclaration>> = {
  object: {
    font: LABEL_FONTS.object,
    lineHeight: `${OBJECT_LABEL_HEIGHT_PX.toString()}px`,
    color: `rgb(255 255 255 / ${OBJECT_LABEL_OPACITY.toString()})`,
    textTransform: 'none',
    letterSpacing: 'normal',
  },
  group: {
    font: LABEL_FONTS.group,
    lineHeight: `${GROUP_LABEL_HEIGHT_PX.toString()}px`,
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: `${GROUP_LABEL_LETTER_SPACING_EM.toString()}em`,
  },
};

let slots: Slot[] = [];

/** Creates the pool inside `container`; returns the cleanup. Called by `<LabelLayer>`. */
export function mountLabelPool(container: HTMLElement): () => void {
  slots = Array.from({ length: LABEL_MAX }, () => {
    const element = document.createElement('div');
    element.style.cssText =
      'position:absolute;left:0;top:0;white-space:nowrap;display:none;will-change:transform;' +
      'text-shadow:0 0 3px rgb(0 0 0 / 0.9),0 0 1px rgb(0 0 0);';
    container.appendChild(element);
    return { element, id: null, text: '', kind: null, visible: false };
  });
  return () => {
    for (const slot of slots) slot.element.remove();
    slots = [];
  };
}

/**
 * Shows exactly these labels. A label keeps the element it had last frame when possible, so
 * text is rewritten only for labels that newly appear.
 */
export function showLabels(labels: readonly PlacedLabel[]): void {
  if (slots.length === 0) return;
  const byId = new Map<string, Slot>();
  for (const slot of slots) if (slot.id !== null) byId.set(slot.id, slot);
  const used = new Set<Slot>();
  const unassigned: PlacedLabel[] = [];

  // Labels already on screen keep their element.
  for (const label of labels) {
    const slot = byId.get(label.id);
    if (slot && !used.has(slot)) {
      used.add(slot);
      place(slot, label);
    } else {
      unassigned.push(label);
    }
  }
  // New labels take free elements.
  const free = slots.filter((slot) => !used.has(slot));
  for (const label of unassigned) {
    const slot = free.pop();
    if (!slot) break;
    used.add(slot);
    place(slot, label);
  }
  // Everything else hides.
  for (const slot of slots) {
    if (used.has(slot) || !slot.visible) continue;
    slot.element.style.display = 'none';
    slot.visible = false;
    slot.id = null;
  }
}

function place(slot: Slot, label: PlacedLabel): void {
  const { element } = slot;
  if (slot.kind !== label.kind) {
    Object.assign(element.style, KIND_STYLES[label.kind]);
    slot.kind = label.kind;
  }
  if (slot.text !== label.text) {
    element.textContent = label.text;
    slot.text = label.text;
  }
  slot.id = label.id;
  element.dataset.labelId = label.id;
  // Whole pixels keep text crisp; translate3d keeps the move on the compositor.
  element.style.transform = `translate3d(${Math.round(label.left).toString()}px, ${Math.round(label.top).toString()}px, 0)`;
  if (!slot.visible) {
    element.style.display = 'block';
    slot.visible = true;
  }
}
