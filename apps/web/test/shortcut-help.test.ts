import { describe, expect, it } from 'vitest';
import {
  ACTION_DESCRIPTIONS,
  BINDINGS,
  EDIT_ACTION_DESCRIPTIONS,
  EDIT_KEY_BINDINGS,
  KEY_ACTION_HELP,
  KEY_BINDINGS,
} from '../src/input/bindings.ts';
import { formatKeys, helpSections } from '../src/panels/shortcut-help/help-sections.ts';

/** The shortcut help (M4-T9): generated from the binding tables. */

const rowsOf = (platform: 'mac' | 'other', editing = false, canEdit = true) =>
  helpSections({ platform, editing, canEdit });
const row = (platform: 'mac' | 'other', description: string, section?: string) =>
  rowsOf(platform)
    .filter((item) => section === undefined || item.id === section)
    .flatMap((item) => item.rows)
    .find((item) => item.description === description);

describe('binding descriptions', () => {
  it('every bound action has one; only `none` has none', () => {
    for (const binding of BINDINGS) {
      if (binding.action === 'none') expect(ACTION_DESCRIPTIONS.none).toBeNull();
      else expect(ACTION_DESCRIPTIONS[binding.action], binding.action).toBeTruthy();
    }
    for (const action of Object.values(KEY_BINDINGS)) {
      expect(KEY_ACTION_HELP[action].description, action).toBeTruthy();
    }
    for (const binding of EDIT_KEY_BINDINGS) {
      expect(EDIT_ACTION_DESCRIPTIONS[binding.action], binding.action).toBeTruthy();
    }
  });
});

describe('the help panel', () => {
  it('merges keys that share a description', () => {
    expect(row('other', 'Pan the view', 'everywhere')?.keys).toEqual(['↑', '↓', '←', '→']);
    expect(row('other', 'Pan the view', 'pointer')?.keys).toEqual([
      'Ctrl + drag',
      'Right-drag',
      'Drag with two fingers',
    ]);
    expect(row('other', 'Zoom in')?.keys).toEqual(['+', '=']);
    expect(row('other', 'Zoom out')?.keys).toEqual(['−']);
    expect(row('other', 'Reset the camera')?.keys).toEqual(['H', 'Home']);
  });

  it('leaves out rows that only swallow a gesture, and other platforms’ rows', () => {
    const mac = JSON.stringify(rowsOf('mac'));
    // Ctrl-click and Ctrl-drag on a Mac are bound to `none`; Ctrl + Y is for Windows and Linux.
    expect(mac).not.toContain('⌃ drag');
    expect(mac).not.toContain('Y');
    expect(row('mac', 'Open the menu for the selection')?.keys).toEqual(['⌃ click', 'Right-click']);
  });

  it('writes keys for macOS and for other platforms', () => {
    expect(row('mac', 'Group the selection')?.keys).toEqual(['⌘G']);
    expect(row('other', 'Group the selection')?.keys).toEqual(['Ctrl + G']);
    expect(row('mac', 'Redo')?.keys).toEqual(['⇧⌘Z']);
    expect(row('other', 'Redo')?.keys).toEqual(['Ctrl + Shift + Z', 'Ctrl + Y']);
    expect(row('mac', 'Show or hide potential spoilers')?.keys).toEqual(['⇧S']);
    expect(row('mac', 'Delete the selection, after asking')?.keys).toEqual(['Delete', '⌫']);
    expect(row('mac', 'Orbit the camera')?.keys).toContain('⌥ drag');
    expect(formatKeys('a', ['primary', 'shift', 'alt'], 'mac')).toBe('⌥⇧⌘A');
  });

  it('shows the edit section only to a reader who may edit, first while editing', () => {
    expect(rowsOf('mac', false, false).map((section) => section.id)).toEqual([
      'everywhere',
      'pointer',
    ]);
    expect(rowsOf('mac', false).map((section) => section.id)).toEqual([
      'everywhere',
      'edit',
      'pointer',
    ]);
    expect(rowsOf('mac', true).map((section) => section.id)).toEqual([
      'edit',
      'everywhere',
      'pointer',
    ]);
  });

  it('lists ? itself', () => {
    expect(row('other', 'Show these shortcuts')?.keys).toEqual(['?']);
  });
});
