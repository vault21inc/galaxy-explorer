import { describe, expect, it } from 'vitest';
import {
  BINDINGS,
  KEY_BINDINGS,
  resolveBinding,
  type Action,
  type Gesture,
  type HeldKeys,
  type Mode,
  type Target,
} from '../src/input/bindings.ts';
import { detectPlatform, type Platform } from '../src/input/platform.ts';

const none: HeldKeys = { shiftKey: false, altKey: false, ctrlKey: false, metaKey: false };
const shift = { ...none, shiftKey: true };
const alt = { ...none, altKey: true };
const ctrl = { ...none, ctrlKey: true };
const meta = { ...none, metaKey: true };
/** The primary modifier: Cmd on macOS, Ctrl elsewhere (ux.md §3). */
const primaryFor = (platform: Platform) => (platform === 'mac' ? meta : ctrl);

type Case = [description: string, Gesture, HeldKeys, Mode, Target, Action];

/** Every row of ux.md §3, as it must behave on both platforms. */
function tableFor(platform: Platform): Case[] {
  const primary = primaryFor(platform);
  return [
    ['rotate: left-drag (view)', 'left-drag', none, 'view', 'empty', 'rotate'],
    ['rotate: left-drag on an object (view)', 'left-drag', none, 'view', 'object', 'rotate'],
    ['rotate: middle-drag (view)', 'middle-drag', none, 'view', 'empty', 'rotate'],
    ['rotate: middle-drag (edit)', 'middle-drag', none, 'edit', 'empty', 'rotate'],
    ['rotate: Option/Alt + left-drag (view)', 'left-drag', alt, 'view', 'empty', 'rotate'],
    ['rotate: Option/Alt + left-drag (edit)', 'left-drag', alt, 'edit', 'selected', 'rotate'],
    ['pan: right-drag (view)', 'right-drag', none, 'view', 'empty', 'pan'],
    ['pan: right-drag (edit)', 'right-drag', none, 'edit', 'object', 'pan'],
    ['pan: primary + left-drag (view)', 'left-drag', primary, 'view', 'empty', 'pan'],
    ['pan: primary + left-drag (edit)', 'left-drag', primary, 'edit', 'empty', 'pan'],
    ['zoom: wheel (view)', 'wheel', none, 'view', 'empty', 'zoom'],
    ['zoom: wheel (edit)', 'wheel', none, 'edit', 'object', 'zoom'],
    ['select: click', 'left-click', none, 'view', 'object', 'select'],
    ['toggle: Shift + click', 'left-click', shift, 'view', 'object', 'toggle-select'],
    ['toggle: primary + click', 'left-click', primary, 'view', 'object', 'toggle-select'],
    ['toggle: primary + click (edit)', 'left-click', primary, 'edit', 'object', 'toggle-select'],
    [
      'box select: left-drag on empty space (edit)',
      'left-drag',
      none,
      'edit',
      'empty',
      'box-select',
    ],
    ['box select: Shift + drag adds (edit)', 'left-drag', shift, 'edit', 'empty', 'box-select-add'],
    ['move: drag a selected object (edit)', 'left-drag', none, 'edit', 'selected', 'move'],
    ['move: drag an unselected object (edit)', 'left-drag', none, 'edit', 'object', 'move'],
    ['enter: double-click', 'double-click', none, 'view', 'object', 'enter'],
    ['context menu: right-click (edit)', 'right-click', none, 'edit', 'empty', 'context-menu'],
    ['no context menu: right-click (view)', 'right-click', none, 'view', 'empty', 'none'],
    ['touch: one-finger drag rotates', 'touch-drag', none, 'view', 'empty', 'rotate'],
    ['touch: two-finger drag pans', 'touch-two-finger-drag', none, 'view', 'empty', 'pan'],
    ['touch: pinch zooms', 'pinch', none, 'view', 'empty', 'zoom'],
    ['touch: tap selects', 'tap', none, 'view', 'object', 'select'],
    ['touch: double-tap enters', 'double-tap', none, 'view', 'object', 'enter'],
  ];
}

describe.each<Platform>(['mac', 'other'])('resolveBinding on %s', (platform) => {
  it.each(tableFor(platform))('%s', (_description, gesture, keys, mode, target, action) => {
    expect(resolveBinding(gesture, keys, mode, target, platform)).toBe(action);
  });
});

describe('Cmd and Ctrl swap between platforms', () => {
  it('pans with Cmd-drag on a Mac and Ctrl-drag elsewhere', () => {
    expect(resolveBinding('left-drag', meta, 'view', 'empty', 'mac')).toBe('pan');
    expect(resolveBinding('left-drag', ctrl, 'view', 'empty', 'other')).toBe('pan');
  });

  it("doesn't treat the other platform's key as primary", () => {
    // The Windows key isn't a modifier for us: a plain rotate.
    expect(resolveBinding('left-drag', meta, 'view', 'empty', 'other')).toBe('rotate');
    expect(resolveBinding('left-click', meta, 'view', 'object', 'other')).toBe('select');
  });

  it('never treats Ctrl-click on a Mac as multi-select', () => {
    for (const mode of ['view', 'edit'] as const) {
      for (const target of ['empty', 'object', 'selected'] as const) {
        expect(resolveBinding('left-click', ctrl, mode, target, 'mac')).not.toBe('toggle-select');
        expect(
          resolveBinding('left-click', { ...ctrl, shiftKey: true }, mode, target, 'mac'),
        ).not.toBe('toggle-select');
      }
    }
    // It's the Mac's right-click: the context menu in edit mode.
    expect(resolveBinding('left-click', ctrl, 'edit', 'object', 'mac')).toBe('context-menu');
  });

  it('treats Ctrl-click elsewhere as multi-select', () => {
    expect(resolveBinding('left-click', ctrl, 'view', 'object', 'other')).toBe('toggle-select');
  });
});

describe('the bindings table', () => {
  it('gives every gesture a row', () => {
    const gestures = new Set(BINDINGS.map((binding) => binding.gesture));
    expect(gestures.size).toBe(12);
  });

  it('maps the camera keys of ux.md §4', () => {
    expect(KEY_BINDINGS.ArrowUp).toBe('pan-up');
    expect(KEY_BINDINGS['+']).toBe('zoom-in');
    expect(KEY_BINDINGS['-']).toBe('zoom-out');
    expect(KEY_BINDINGS.Home).toBe('reset-view');
    expect(KEY_BINDINGS.h).toBe('reset-view');
  });
});

describe('detectPlatform', () => {
  it.each([
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 15_6) AppleWebKit/605.1.15 Safari/605.1.15', 'mac'],
    ['Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', 'mac'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0', 'other'],
    ['Mozilla/5.0 (X11; Linux x86_64) Firefox/140.0', 'other'],
  ])('%s → %s', (userAgent, platform) => {
    expect(detectPlatform({ userAgent })).toBe(platform);
  });

  it('prefers the client hint where the browser has one', () => {
    const nav = { userAgent: 'Windows', userAgentData: { platform: 'macOS' } };
    expect(detectPlatform(nav)).toBe('mac');
  });
});
