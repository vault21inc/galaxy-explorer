import { describe, expect, it } from 'vitest';
import { changesFor, valueAt, valueKey } from '../src/panels/entity-form/field-path.ts';
import { removedMarkup } from '../src/richtext/editor/removed-markup.ts';
import { markSpoiler } from '../src/richtext/editor/spoiler-wrap.ts';

/** The pure parts of the editor (M3-T4): Mark as spoiler, the removed-markup notice, paths. */

describe('Mark as spoiler (ux.md §8)', () => {
  const text = 'A forge world. It burns.';
  const phrase = { from: text.indexOf('It'), to: text.length };

  it('wraps the selection in Markdown, selecting the hidden text', () => {
    const edit = markSpoiler(text, phrase, 'markdown');
    expect(edit.source).toBe('A forge world. ||It burns.||');
    expect(edit.source.slice(edit.selection.from, edit.selection.to)).toBe('It burns.');
  });

  it('wraps the selection in HTML', () => {
    const edit = markSpoiler(text, phrase, 'html');
    expect(edit.source).toBe('A forge world. <span data-spoiler>It burns.</span>');
    expect(edit.source.slice(edit.selection.from, edit.selection.to)).toBe('It burns.');
  });

  it('keeps whitespace at the edges outside the markers (`|| x ||` is not a spoiler)', () => {
    const from = text.indexOf(' It');
    const edit = markSpoiler(`${text} `, { from, to: text.length + 1 }, 'markdown');
    expect(edit.source).toBe('A forge world. ||It burns.|| ');
  });

  it('works on a backwards selection', () => {
    expect(markSpoiler(text, { from: phrase.to, to: phrase.from }, 'markdown').source).toBe(
      'A forge world. ||It burns.||',
    );
  });

  it('an empty selection inserts an empty spoiler with the cursor inside', () => {
    const edit = markSpoiler('Ab', { from: 1, to: 1 }, 'markdown');
    expect(edit.source).toBe('A||||b');
    expect(edit.selection).toEqual({ from: 3, to: 3 });
  });

  it.each(['markdown', 'html'] as const)('pressed again, unwraps (%s)', (format) => {
    const wrapped = markSpoiler(text, phrase, format);
    const unwrapped = markSpoiler(wrapped.source, wrapped.selection, format);
    expect(unwrapped.source).toBe(text);
    expect(unwrapped.source.slice(unwrapped.selection.from, unwrapped.selection.to)).toBe(
      'It burns.',
    );
  });
});

describe('removedMarkup', () => {
  it('names removed tags once, without their attributes', () => {
    expect(
      removedMarkup(
        '<p>Hi</p><script src="x.js">alert(1)</script><iframe></iframe><script></script>',
        '<p>Hi</p>',
      ),
    ).toEqual(['<script>', '<iframe>']);
  });

  it('names removed attributes on kept tags', () => {
    expect(removedMarkup('<p onclick="steal()" class=a>Hi</p>', '<p>Hi</p>')).toEqual([
      'onclick on <p>',
      'class on <p>',
    ]);
  });

  it('is empty when nothing changed', () => {
    const html = '<p><strong>Hi</strong> <span data-spoiler>there</span></p>';
    expect(removedMarkup(html, html)).toEqual([]);
  });
});

describe('field paths', () => {
  const entity = { name: 'X', appearance: { color: '#ff0000', scale: { galaxy: 2 } } };

  it('reads top-level and nested values', () => {
    expect(valueAt(entity, 'name')).toBe('X');
    expect(valueAt(entity, 'appearance.scale.galaxy')).toBe(2);
    expect(valueAt(entity, 'appearance.labelPriority')).toBeUndefined();
  });

  it('writes a nested value as the whole document, keeping the rest', () => {
    expect(changesFor(entity, 'appearance.color', '#00ff00')).toEqual({
      appearance: { color: '#00ff00', scale: { galaxy: 2 } },
    });
    expect(changesFor(entity, 'appearance.scale.system', 0.5)).toEqual({
      appearance: { color: '#ff0000', scale: { galaxy: 2, system: 0.5 } },
    });
  });

  it('undefined removes the override, and empty documents with it', () => {
    expect(changesFor(entity, 'appearance.scale.galaxy', undefined)).toEqual({
      appearance: { color: '#ff0000' },
    });
    expect(changesFor({ appearance: {} }, 'appearance.color', undefined)).toEqual({
      appearance: {},
    });
  });

  it('top-level fields are set directly, null included', () => {
    expect(changesFor(entity, 'summary', null)).toEqual({ summary: null });
  });

  it('value keys change with the value or the revision', () => {
    expect(valueKey({ a: 1 }, 0)).toBe(valueKey({ a: 1 }, 0));
    expect(valueKey({ a: 1 }, 0)).not.toBe(valueKey({ a: 2 }, 0));
    expect(valueKey({ a: 1 }, 0)).not.toBe(valueKey({ a: 1 }, 1));
  });
});
