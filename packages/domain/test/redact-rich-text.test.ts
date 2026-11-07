import { describe, expect, it } from 'vitest';
import { rt } from '../src/richtext/index.ts';
import {
  HIDE_SPOILERS,
  redactRichText,
  SHOW_SPOILERS,
  spoilerKeys,
  type SpoilerPolicy,
} from '../src/spoilers/index.ts';

const revealing = (...keys: string[]): SpoilerPolicy => ({
  showAll: false,
  revealed: new Set(keys),
});
const FIELD = 'e1/description';

describe('redactRichText', () => {
  it('blacks out a hidden whole-field spoiler, keeping nothing of the original', () => {
    const result = redactRichText(
      rt.md('**Eisenhorn** did it', { spoiler: true }),
      HIDE_SPOILERS,
      FIELD,
    );
    expect(result).toEqual({ format: 'plain', source: '▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇▇', spoiler: true });
  });

  it('returns the same value when the reader shows spoilers or nothing is flagged', () => {
    const flagged = rt.md('a ||b||', { spoiler: true });
    expect(redactRichText(flagged, SHOW_SPOILERS, FIELD)).toBe(flagged);
    const plain = rt.md('nothing to hide');
    expect(redactRichText(plain, HIDE_SPOILERS, FIELD)).toBe(plain);
  });

  it('reveals a whole field by its key', () => {
    const text = rt.plain('Gudrun', { spoiler: true });
    expect(redactRichText(text, revealing(FIELD), FIELD)).toBe(text);
  });

  it('redacts each Markdown inline spoiler, keeping its markers and the rest of the source', () => {
    const text = rt.md('**A** ||one|| and ||two words||.');
    expect(redactRichText(text, HIDE_SPOILERS, FIELD).source).toBe(
      '**A** ||▇▇▇|| and ||▇▇▇▇▇▇▇▇▇||.',
    );
  });

  it('reveals one inline spoiler at a time by its index', () => {
    const text = rt.md('||one|| and ||two||');
    const policy = revealing(spoilerKeys.inline(FIELD, 1));
    expect(redactRichText(text, policy, FIELD).source).toBe('||▇▇▇|| and ||two||');
  });

  it('redacts HTML spoiler spans, nested ones included, keeping the spans', () => {
    const text = rt.html('<p>x <span data-spoiler>a <span data-spoiler>b</span></span> y</p>');
    expect(redactRichText(text, HIDE_SPOILERS, FIELD).source).toBe(
      '<p>x <span data-spoiler>▇▇▇</span> y</p>',
    );
  });

  it('leaves escaped and unclosed Markdown markers alone', () => {
    const text = rt.md('\\|\\|a\\|\\| and ||b');
    expect(redactRichText(text, HIDE_SPOILERS, FIELD)).toBe(text);
  });
});
