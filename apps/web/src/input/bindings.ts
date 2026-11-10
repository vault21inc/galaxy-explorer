import type { Platform } from './platform.ts';

/**
 * The input bindings (ux.md §3, D-12) as data, and `resolveBinding`, the pure function that
 * reads them. Nothing else in the app decides what a gesture does, so changing a binding, or a
 * user-facing keymap editor later, touches only this table.
 */

export type Gesture =
  | 'left-drag'
  | 'middle-drag'
  | 'right-drag'
  | 'wheel'
  | 'left-click'
  | 'right-click'
  | 'double-click'
  | 'touch-drag'
  | 'touch-two-finger-drag'
  | 'pinch'
  | 'tap'
  | 'double-tap';

export type Action =
  | 'rotate'
  | 'pan'
  | 'zoom'
  | 'select'
  | 'toggle-select'
  | 'box-select'
  | 'box-select-add'
  | 'move'
  | 'enter'
  | 'context-menu'
  | 'none';

export type Mode = 'view' | 'edit';

/** What the press started on: empty space, an object, or an object that's already selected. */
export type Target = 'empty' | 'object' | 'selected';

/**
 * Modifiers as the binding table names them. `primary` is Cmd on macOS and Ctrl elsewhere;
 * `ctrl` is the physical Ctrl key, which only matters on macOS, where Ctrl-click means
 * right-click.
 */
export type Modifier = 'shift' | 'alt' | 'primary' | 'ctrl';

/** The keys held during an event, as the browser reports them. */
export interface HeldKeys {
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

export interface Binding {
  gesture: Gesture;
  action: Action;
  /** All of these must be held. Rows without modifiers match whatever is held. */
  modifiers?: readonly Modifier[];
  /** Only in this mode; both if absent. */
  mode?: Mode;
  /** Only when the press starts on one of these; anywhere if absent. */
  targets?: readonly Target[];
  /** Only on this platform; both if absent. */
  platform?: Platform;
}

/**
 * The table. **The first matching row wins**, so specific rows (with modifiers) come before
 * general ones. Each row says which line of ux.md §3 it implements.
 */
export const BINDINGS: readonly Binding[] = [
  // Ctrl-click on a Mac is the system's right-click: never a multi-select (ux.md §3).
  {
    gesture: 'left-click',
    modifiers: ['ctrl'],
    platform: 'mac',
    mode: 'edit',
    action: 'context-menu',
  },
  { gesture: 'left-click', modifiers: ['ctrl'], platform: 'mac', action: 'none' },
  { gesture: 'left-drag', modifiers: ['ctrl'], platform: 'mac', action: 'none' },

  // Rotate: Option/Alt + left-drag in any mode, middle-drag, plain left-drag in view mode.
  { gesture: 'left-drag', modifiers: ['alt'], action: 'rotate' },
  // Pan: Cmd (Mac) / Ctrl (elsewhere) + left-drag, and right-drag.
  { gesture: 'left-drag', modifiers: ['primary'], action: 'pan' },
  { gesture: 'left-drag', mode: 'view', action: 'rotate' },
  // Edit mode takes over plain left-drag (D-12): move what's under the press, or box-select.
  { gesture: 'left-drag', mode: 'edit', targets: ['selected', 'object'], action: 'move' },
  { gesture: 'left-drag', mode: 'edit', modifiers: ['shift'], action: 'box-select-add' },
  { gesture: 'left-drag', mode: 'edit', action: 'box-select' },
  { gesture: 'middle-drag', action: 'rotate' },
  { gesture: 'right-drag', action: 'pan' },

  // Zoom toward the cursor: the wheel, two-finger scroll and pinch (which arrives as a wheel).
  { gesture: 'wheel', action: 'zoom' },

  // Select; Shift or Cmd/Ctrl adds to or removes from the selection.
  { gesture: 'left-click', modifiers: ['shift'], action: 'toggle-select' },
  { gesture: 'left-click', modifiers: ['primary'], action: 'toggle-select' },
  { gesture: 'left-click', action: 'select' },
  { gesture: 'double-click', action: 'enter' },
  // Right-click without dragging: the context menu in edit mode, nothing in view mode.
  { gesture: 'right-click', mode: 'edit', action: 'context-menu' },
  { gesture: 'right-click', action: 'none' },

  // Touch (viewing only).
  { gesture: 'touch-drag', action: 'rotate' },
  { gesture: 'touch-two-finger-drag', action: 'pan' },
  { gesture: 'pinch', action: 'zoom' },
  { gesture: 'tap', action: 'select' },
  { gesture: 'double-tap', action: 'enter' },
];

/**
 * What each pointer action does, in a line, for the shortcut help (M4-T9, D-30). Typed over
 * every action, so a new one without a description fails the typecheck. `none` rows only
 * swallow a gesture and aren't listed.
 */
export const ACTION_DESCRIPTIONS: Readonly<Record<Action, string | null>> = {
  rotate: 'Orbit the camera',
  pan: 'Pan the view',
  zoom: 'Zoom toward the pointer',
  select: 'Select',
  'toggle-select': 'Add to or take from the selection',
  'box-select': 'Select with a box, from empty space',
  'box-select-add': 'Add a box to the selection',
  move: 'Move the selection, from an object',
  // Entering a system's own view arrives in M5; until then it flies there.
  enter: 'Fly to an object',
  'context-menu': 'Open the menu for the selection',
  none: null,
};

export function isHeld(modifier: Modifier, keys: HeldKeys, platform: Platform): boolean {
  switch (modifier) {
    case 'shift':
      return keys.shiftKey;
    case 'alt':
      return keys.altKey;
    case 'ctrl':
      return keys.ctrlKey;
    case 'primary':
      return isPrimaryModifier(keys, platform);
  }
}

/** Cmd on macOS, Ctrl elsewhere (ux.md §3). */
export function isPrimaryModifier(keys: HeldKeys, platform: Platform): boolean {
  return platform === 'mac' ? keys.metaKey : keys.ctrlKey;
}

/** What a gesture does, given the held keys, the mode, where it started and the platform. */
export function resolveBinding(
  gesture: Gesture,
  keys: HeldKeys,
  mode: Mode,
  target: Target,
  platform: Platform,
): Action {
  const row = BINDINGS.find(
    (binding) =>
      binding.gesture === gesture &&
      (binding.mode === undefined || binding.mode === mode) &&
      (binding.platform === undefined || binding.platform === platform) &&
      (binding.targets === undefined || binding.targets.includes(target)) &&
      (binding.modifiers ?? []).every((modifier) => isHeld(modifier, keys, platform)),
  );
  return row?.action ?? 'none';
}

/** Keyboard shortcuts for the camera and the selection (ux.md §4). Keys are `KeyboardEvent.key` values. */
export type KeyAction =
  | 'pan-up'
  | 'pan-down'
  | 'pan-left'
  | 'pan-right'
  | 'zoom-in'
  | 'zoom-out'
  | 'reset-view'
  | 'frame-selection'
  | 'clear-selection'
  | 'cycle-labels'
  | 'show-all-labels'
  | 'toggle-spoilers'
  | 'toggle-edit'
  | 'add-object'
  | 'show-help';

export const KEY_BINDINGS: Readonly<Record<string, KeyAction>> = {
  ArrowUp: 'pan-up',
  ArrowDown: 'pan-down',
  ArrowLeft: 'pan-left',
  ArrowRight: 'pan-right',
  '+': 'zoom-in',
  '=': 'zoom-in', // the + key without Shift on most layouts
  '-': 'zoom-out',
  _: 'zoom-out',
  h: 'reset-view',
  H: 'reset-view',
  Home: 'reset-view',
  f: 'frame-selection',
  F: 'frame-selection',
  // Esc cancels placing an object, or clears the selection; with nothing selected it goes up
  // one view (M5-T1).
  Escape: 'clear-selection',
  // Labels (ux.md §7): L cycles hover → groups → all; Space shows all while held.
  l: 'cycle-labels',
  L: 'cycle-labels',
  ' ': 'show-all-labels',
  // Shift + S shows or hides potential spoilers (ux.md §6); with Shift held, the key is "S".
  S: 'toggle-spoilers',
  // E toggles edit mode where it's offered (ux.md §4).
  e: 'toggle-edit',
  E: 'toggle-edit',
  // N opens the Add menu in edit mode (ux.md §4).
  n: 'add-object',
  N: 'add-object',
  // ? opens the shortcut help (M4-T9); with Shift held, it's "?" on most layouts.
  '?': 'show-help',
};

/**
 * Each key action's line in the shortcut help, and where it's listed: everywhere, or in the
 * edit-mode section shown only to readers who may edit. Actions that share a description share
 * a row, so the four arrow keys are one "Pan the view". `shift` marks a key that needs Shift
 * (the table's "S" is Shift + S).
 */
export const KEY_ACTION_HELP: Readonly<
  Record<KeyAction, { description: string; section: 'everywhere' | 'edit'; shift?: boolean }>
> = {
  'pan-up': { description: 'Pan the view', section: 'everywhere' },
  'pan-down': { description: 'Pan the view', section: 'everywhere' },
  'pan-left': { description: 'Pan the view', section: 'everywhere' },
  'pan-right': { description: 'Pan the view', section: 'everywhere' },
  'zoom-in': { description: 'Zoom in', section: 'everywhere' },
  'zoom-out': { description: 'Zoom out', section: 'everywhere' },
  'reset-view': { description: 'Reset the camera', section: 'everywhere' },
  'frame-selection': { description: 'Fly to the selection', section: 'everywhere' },
  'clear-selection': {
    description: 'Clear the selection or stop placing an object; otherwise go up one view',
    section: 'everywhere',
  },
  'cycle-labels': { description: 'Labels: hover only, group names, all', section: 'everywhere' },
  'show-all-labels': { description: 'Show every label while held', section: 'everywhere' },
  'toggle-spoilers': {
    description: 'Show or hide potential spoilers',
    section: 'everywhere',
    shift: true,
  },
  'show-help': { description: 'Show these shortcuts', section: 'everywhere' },
  'toggle-edit': { description: 'Turn edit mode on or off', section: 'edit' },
  'add-object': { description: 'Add an object', section: 'edit' },
};

/** Edit-mode commands (ux.md §4), run by the editor actions (editor/actions/). */
export type EditKeyAction =
  'select-all' | 'duplicate' | 'delete' | 'undo' | 'redo' | 'group' | 'ungroup';

interface EditKeyBinding {
  /** `KeyboardEvent.key`, compared without case (Shift makes it "Z"). */
  key: string;
  /** Needs Cmd on macOS, Ctrl elsewhere. */
  primary: boolean;
  /** Needs Shift. */
  shift?: boolean;
  /** Only on this platform. */
  platform?: Platform;
  action: EditKeyAction;
}

/** Each edit command's line in the shortcut help (M4-T9), typed over every command. */
export const EDIT_ACTION_DESCRIPTIONS: Readonly<Record<EditKeyAction, string>> = {
  'select-all': 'Select everything in the view',
  duplicate: 'Duplicate the selection',
  delete: 'Delete the selection, after asking',
  undo: 'Undo',
  redo: 'Redo',
  group: 'Group the selection',
  ungroup: 'Take the selection out of its group in the active layer',
};

/** Edit-mode shortcuts with modifiers, which KEY_BINDINGS doesn't take. */
export const EDIT_KEY_BINDINGS: readonly EditKeyBinding[] = [
  { key: 'a', primary: true, action: 'select-all' },
  { key: 'd', primary: true, action: 'duplicate' },
  { key: 'Delete', primary: false, action: 'delete' },
  { key: 'Backspace', primary: false, action: 'delete' },
  { key: 'z', primary: true, action: 'undo' },
  { key: 'z', primary: true, shift: true, action: 'redo' },
  // Windows and Linux also redo with Ctrl + Y.
  { key: 'y', primary: true, platform: 'other', action: 'redo' },
  // Group the selection; with Shift, take it out of its group in the active layer (M4-T2).
  { key: 'g', primary: true, action: 'group' },
  { key: 'g', primary: true, shift: true, action: 'ungroup' },
];

/**
 * The edit-mode command for a key press, or null. The primary modifier and Shift must match
 * the row exactly and Alt must be up, so ⌘⇧D or Ctrl+Alt+A stay free for later shortcuts.
 */
export function resolveEditKey(
  event: HeldKeys & { key: string },
  platform: Platform,
): EditKeyAction | null {
  if (event.altKey) return null;
  // On a Mac, Ctrl isn't the primary key; held with a letter it's a different shortcut.
  if (platform === 'mac' && event.ctrlKey) return null;
  const primary = isPrimaryModifier(event, platform);
  const row = EDIT_KEY_BINDINGS.find(
    (binding) =>
      binding.key.toLowerCase() === event.key.toLowerCase() &&
      binding.primary === primary &&
      (binding.shift ?? false) === event.shiftKey &&
      (binding.platform === undefined || binding.platform === platform),
  );
  return row?.action ?? null;
}
