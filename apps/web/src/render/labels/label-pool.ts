import {
  GROUP_LABEL_HEIGHT_PX,
  GROUP_LABEL_LETTER_SPACING_EM,
  LABEL_MAX,
  LABEL_OUTLINE_COLOR,
  LABEL_OUTLINE_PX,
  LABEL_SHADOW,
  OBJECT_LABEL_COLOR,
  OBJECT_LABEL_HEIGHT_PX,
} from '../tuning.ts';
import { isPrimaryModifier } from '@/input/bindings.ts';
import { detectPlatform } from '@/input/platform.ts';
import { useSelection } from '@/state/selection.ts';
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
  /** A group label's color; objects use their kind's. */
  color: string | null;
  visible: boolean;
  /** Where it's placed, in whole CSS pixels from the canvas's top left. */
  left: number;
  top: number;
}

/** Styles per kind. Labels get a dark outline so they read on any background (ux.md §10). */
const KIND_STYLES: Record<LabelKind, Partial<CSSStyleDeclaration>> = {
  object: {
    font: LABEL_FONTS.object,
    lineHeight: `${OBJECT_LABEL_HEIGHT_PX.toString()}px`,
    color: OBJECT_LABEL_COLOR,
    textTransform: 'none',
    letterSpacing: 'normal',
    // Object labels let clicks through to the canvas, which picks the body beneath.
    pointerEvents: 'none',
    cursor: 'default',
  },
  group: {
    font: LABEL_FONTS.group,
    lineHeight: `${GROUP_LABEL_HEIGHT_PX.toString()}px`,
    color: '#ffffff',
    textTransform: 'uppercase',
    letterSpacing: `${GROUP_LABEL_LETTER_SPACING_EM.toString()}em`,
    // A group is picked through its label (rendering.md §10, M4-T4); clicks inside its outline
    // still pick objects.
    pointerEvents: 'auto',
    cursor: 'pointer',
  },
};

let slots: Slot[] = [];

/** Creates the pool inside `container`; returns the cleanup. Called by `<LabelLayer>`. */
export function mountLabelPool(container: HTMLElement): () => void {
  slots = Array.from({ length: LABEL_MAX }, () => {
    const element = document.createElement('div');
    element.style.cssText =
      'position:absolute;left:0;top:0;white-space:nowrap;display:none;will-change:transform;' +
      // The outline (tuning.ts): a stroke painted before the fill, so it sits under the text.
      `-webkit-text-stroke:${LABEL_OUTLINE_PX.toString()}px ${LABEL_OUTLINE_COLOR};` +
      `paint-order:stroke fill;text-shadow:${LABEL_SHADOW};`;
    container.appendChild(element);
    return {
      element,
      id: null,
      text: '',
      kind: null,
      color: null,
      visible: false,
      left: 0,
      top: 0,
    };
  });
  container.addEventListener('click', onLabelClick);
  return () => {
    container.removeEventListener('click', onLabelClick);
    for (const slot of slots) slot.element.remove();
    slots = [];
  };
}

/**
 * A click on a group label selects the group, with the canvas's modifiers: the primary key
 * toggles it in the selection, Shift adds it (ux.md §3). One listener for the whole pool.
 */
function onLabelClick(event: MouseEvent): void {
  const target = event.target instanceof Element ? event.target.closest('[data-label-id]') : null;
  if (!(target instanceof HTMLElement) || target.dataset.labelKind !== 'group') return;
  const id = target.dataset.labelId;
  if (!id) return;
  const primary = isPrimaryModifier(event, detectPlatform());
  useSelection
    .getState()
    .select([id], primary ? { toggle: true } : event.shiftKey ? { add: true } : {});
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
    slot.color = null;
  }
  const color = label.color ?? null;
  if (color !== null && slot.color !== color) {
    element.style.color = color;
    slot.color = color;
  }
  if (slot.text !== label.text) {
    element.textContent = label.text;
    slot.text = label.text;
  }
  slot.id = label.id;
  element.dataset.labelId = label.id;
  element.dataset.labelKind = label.kind;
  // Whole pixels keep text crisp; translate3d keeps the move on the compositor.
  slot.left = Math.round(label.left);
  slot.top = Math.round(label.top);
  element.style.transform = `translate3d(${slot.left.toString()}px, ${slot.top.toString()}px, 0)`;
  if (!slot.visible) {
    element.style.display = 'block';
    slot.visible = true;
  }
}

/** A label on screen now, as a recorded clip paints it (render/capture/paint-labels.ts). */
export interface ShownLabel {
  text: string;
  kind: LabelKind;
  /** Its color: a group's own, or the kind's. */
  color: string;
  left: number;
  top: number;
}

/** The labels shown after the last frame, read from the pool rather than the page. */
export function shownLabels(): ShownLabel[] {
  const shown: ShownLabel[] = [];
  for (const slot of slots) {
    if (!slot.visible || slot.kind === null) continue;
    shown.push({
      text: slot.text,
      kind: slot.kind,
      color: slot.color ?? (slot.kind === 'object' ? OBJECT_LABEL_COLOR : '#ffffff'),
      left: slot.left,
      top: slot.top,
    });
  }
  return shown;
}
