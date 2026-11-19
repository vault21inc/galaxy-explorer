import {
  ACTION_DESCRIPTIONS,
  BINDINGS,
  CAPTURE_ACTION_DESCRIPTIONS,
  CAPTURE_KEY_BINDINGS,
  EDIT_ACTION_DESCRIPTIONS,
  EDIT_KEY_BINDINGS,
  GLOBAL_ACTION_DESCRIPTIONS,
  GLOBAL_KEY_BINDINGS,
  KEY_ACTION_HELP,
  KEY_BINDINGS,
  type Gesture,
  type Modifier,
} from '@/input/bindings.ts';
import type { Platform } from '@/input/platform.ts';

/**
 * The shortcut help's contents (M4-T9, D-30), generated from the three binding tables in
 * input/bindings.ts, never typed by hand: what's listed is exactly what works. Pure, so it's
 * unit-tested for both platforms.
 */

export interface HelpRow {
  description: string;
  /** Each way to do it, written for this platform: "⇧⌘G" on a Mac, "Ctrl + Shift + G" elsewhere. */
  keys: string[];
}

export interface HelpSection {
  id: 'touch' | 'everywhere' | 'edit' | 'pointer' | 'capture';
  title: string;
  rows: HelpRow[];
}

/** Modifiers in each platform's usual order: ⌃⌥⇧⌘ on a Mac, Ctrl + Alt + Shift elsewhere. */
const MODIFIER_ORDER: Record<Platform, readonly Modifier[]> = {
  mac: ['ctrl', 'alt', 'shift', 'primary'],
  other: ['primary', 'ctrl', 'alt', 'shift'],
};
const MODIFIER_NAMES: Record<Platform, Record<Modifier, string>> = {
  mac: { ctrl: '⌃', alt: '⌥', shift: '⇧', primary: '⌘' },
  other: { ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', primary: 'Ctrl' },
};

/** `KeyboardEvent.key` values as a keycap shows them. */
function keyName(key: string, platform: Platform): string {
  switch (key) {
    case 'ArrowUp':
      return '↑';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    case 'ArrowRight':
      return '→';
    case ' ':
      return 'Space';
    case 'Escape':
      return 'Esc';
    case 'Backspace':
      return platform === 'mac' ? '⌫' : 'Backspace';
    // The minus key, with or without Shift.
    case '-':
    case '_':
      return '−';
    default:
      return key.length === 1 ? key.toUpperCase() : key;
  }
}

/** A key with its modifiers: "⇧⌘Z" on a Mac, "Ctrl + Shift + Z" elsewhere. */
export function formatKeys(
  key: string,
  modifiers: readonly Modifier[],
  platform: Platform,
): string {
  const names = MODIFIER_ORDER[platform]
    .filter((modifier) => modifiers.includes(modifier))
    .map((modifier) => MODIFIER_NAMES[platform][modifier]);
  const shown = keyName(key, platform);
  return platform === 'mac' ? [...names, shown].join('') : [...names, shown].join(' + ');
}

const GESTURE_NAMES: Record<Gesture, string> = {
  'left-drag': 'Drag',
  'middle-drag': 'Middle-drag',
  'right-drag': 'Right-drag',
  wheel: 'Scroll, or pinch on a trackpad',
  'left-click': 'Click',
  'right-click': 'Right-click',
  'double-click': 'Double-click',
  'touch-drag': 'Drag with one finger',
  'touch-two-finger-drag': 'Drag with two fingers',
  pinch: 'Pinch',
  tap: 'Tap',
  'double-tap': 'Double-tap',
};

/** A gesture with its modifiers: "⌥ drag" on a Mac, "Alt + drag" elsewhere. */
/** The touch gestures' names as the help shows them: what goes in the Touch section. */
const TOUCH_GESTURE_NAMES = new Set(
  (['touch-drag', 'touch-two-finger-drag', 'pinch', 'tap', 'double-tap'] as const).map(
    (gesture) => GESTURE_NAMES[gesture],
  ),
);

function formatGesture(gesture: Gesture, modifiers: readonly Modifier[], platform: Platform) {
  const name = GESTURE_NAMES[gesture];
  if (modifiers.length === 0) return name;
  const held = MODIFIER_ORDER[platform]
    .filter((modifier) => modifiers.includes(modifier))
    .map((modifier) => MODIFIER_NAMES[platform][modifier]);
  const lower = name.charAt(0).toLowerCase() + name.slice(1);
  return platform === 'mac' ? `${held.join('')} ${lower}` : [...held, lower].join(' + ');
}

/** Rows in first-seen order; entries that share a description share a row. */
class Rows {
  readonly #rows = new Map<string, Set<string>>();
  add(description: string, keys: string) {
    const set = this.#rows.get(description) ?? new Set<string>();
    set.add(keys);
    this.#rows.set(description, set);
  }
  list(): HelpRow[] {
    return [...this.#rows].map(([description, keys]) => ({ description, keys: [...keys] }));
  }
}

/**
 * The sections, current mode's first: everywhere (keys in both modes), edit mode (only for a
 * reader who may edit: E, N, the edit commands and edit-mode gestures), mouse, trackpad and
 * touch gestures, and capture mode's keys (D-55). Rows bound to `none`, or to another platform,
 * are left out. On a device with no mouse or trackpad (`touch`, L3-T3), the touch gestures
 * come first, in a section of their own, and the mouse's follow the keys.
 */
export function helpSections({
  platform,
  editing,
  canEdit,
  touch = false,
}: {
  platform: Platform;
  editing: boolean;
  canEdit: boolean;
  touch?: boolean;
}): HelpSection[] {
  const everywhere = new Rows();
  const edit = new Rows();
  const pointer = new Rows();

  for (const [key, action] of Object.entries(KEY_BINDINGS)) {
    const help = KEY_ACTION_HELP[action];
    const keys = formatKeys(key, help.shift ? ['shift'] : [], platform);
    (help.section === 'edit' ? edit : everywhere).add(help.description, keys);
  }
  for (const binding of GLOBAL_KEY_BINDINGS) {
    everywhere.add(
      GLOBAL_ACTION_DESCRIPTIONS[binding.action],
      formatKeys(binding.key, ['primary'], platform),
    );
  }
  for (const binding of EDIT_KEY_BINDINGS) {
    if (binding.platform !== undefined && binding.platform !== platform) continue;
    const modifiers: Modifier[] = [
      ...(binding.primary ? (['primary'] as const) : []),
      ...(binding.shift ? (['shift'] as const) : []),
    ];
    edit.add(
      EDIT_ACTION_DESCRIPTIONS[binding.action],
      formatKeys(binding.key, modifiers, platform),
    );
  }
  for (const binding of BINDINGS) {
    const description = ACTION_DESCRIPTIONS[binding.action];
    if (description === null) continue;
    if (binding.platform !== undefined && binding.platform !== platform) continue;
    const gesture = formatGesture(binding.gesture, binding.modifiers ?? [], platform);
    if (binding.mode === 'edit') edit.add(description, gesture);
    else pointer.add(description, binding.mode === 'view' ? `${gesture}, in view mode` : gesture);
  }

  if (touch) {
    const fingers = new Rows();
    const mouse = new Rows();
    for (const row of pointer.list()) {
      for (const keys of row.keys) {
        (TOUCH_GESTURE_NAMES.has(keys) ? fingers : mouse).add(row.description, keys);
      }
    }
    return [
      { id: 'touch', title: 'Touch', rows: fingers.list() },
      { id: 'everywhere', title: 'Keyboard', rows: everywhere.list() },
      { id: 'pointer', title: 'Mouse and trackpad', rows: mouse.list() },
      { id: 'capture', title: 'Capture mode', rows: captureRows(platform) },
    ];
  }
  const sections: HelpSection[] = [
    { id: 'everywhere', title: 'Everywhere', rows: everywhere.list() },
    ...(canEdit ? [{ id: 'edit' as const, title: 'Edit mode', rows: edit.list() }] : []),
    { id: 'pointer', title: 'Mouse, trackpad and touch', rows: pointer.list() },
    { id: 'capture', title: 'Capture mode', rows: captureRows(platform) },
  ];
  // The current mode's section first.
  return editing
    ? sections.toSorted((a, b) => Number(b.id === 'edit') - Number(a.id === 'edit'))
    : sections;
}

/** Capture mode's keys (D-55), in the order they're used: mark, play, adjust, leave. */
export function captureRows(platform: Platform): HelpRow[] {
  const rows = new Rows();
  const order = Object.keys(CAPTURE_ACTION_DESCRIPTIONS);
  const bindings = Object.entries(CAPTURE_KEY_BINDINGS).toSorted(
    ([, a], [, b]) => order.indexOf(a) - order.indexOf(b),
  );
  for (const [key, action] of bindings) {
    rows.add(CAPTURE_ACTION_DESCRIPTIONS[action], formatKeys(key, [], platform));
  }
  return rows.list();
}
