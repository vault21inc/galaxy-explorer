import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown';
import { splice } from 'micromark-util-chunked';
import { classifyCharacter } from 'micromark-util-classify-character';
import { resolveAll } from 'micromark-util-resolve-all';
import type {
  Code,
  Event,
  Extension,
  Resolver,
  State,
  Token,
  TokenizeContext,
  Tokenizer,
} from 'micromark-util-types';
import type { Processor } from 'unified';

/**
 * Inline spoilers in Markdown: `||hidden text||` (data-model §7, ux.md §8).
 *
 * Markdown is parsed by micromark, which turns text into "tokens", and mdast, which turns
 * tokens into a syntax tree. This file adds the `||…||` syntax to both, modelled on GFM's
 * `~~strikethrough~~` (micromark-extension-gfm-strikethrough):
 *
 * - A marker is exactly two pipes. One pipe or three are plain text.
 * - Escaped pipes (`\|\|`) are plain text: micromark handles the backslash before we see it.
 * - A marker opens if text follows it and closes if text precedes it, using the same
 *   "flanking" rules as `**bold**`. `|| x ||`, with spaces inside, is not a spoiler.
 * - An opener with no closer stays plain text, so a stray `||` never hides the rest of a field.
 * - Code spans win: `` `a || b` `` is code, not a spoiler.
 * - Inside GFM table rows, pipes separate cells, so a spoiler there needs HTML instead.
 *
 * The result is an mdast node `{ type: 'spoiler', children }`. `remarkSpoiler` is a unified
 * plugin, so the web app can pass it to react-markdown as well.
 */

const PIPE = 124; // the character code of `|`
const PUNCTUATION = 2; // classifyCharacter's group for punctuation (1 is whitespace)

declare module 'micromark-util-types' {
  interface TokenTypeMap {
    spoiler: 'spoiler';
    spoilerSequence: 'spoilerSequence';
    spoilerSequenceTemporary: 'spoilerSequenceTemporary';
    spoilerText: 'spoilerText';
  }
}

declare module 'mdast' {
  interface Spoiler extends Parent {
    type: 'spoiler';
    children: PhrasingContent[];
  }
  interface PhrasingContentMap {
    spoiler: Spoiler;
  }
  interface RootContentMap {
    spoiler: Spoiler;
  }
}

/** The micromark syntax extension. */
export function spoilerSyntax(): Extension {
  const tokenizer = {
    name: 'spoiler',
    tokenize: tokenizeSpoiler,
    resolveAll: resolveAllSpoilers,
  };
  return {
    text: { [PIPE]: tokenizer },
    insideSpan: { null: [tokenizer] },
    attentionMarkers: { null: [PIPE] },
  };
}

/** Builds the mdast `spoiler` node from the tokens. */
export const spoilerFromMarkdown: FromMarkdownExtension = {
  canContainEols: ['spoiler'],
  enter: {
    spoiler(token) {
      this.enter({ type: 'spoiler', children: [] }, token);
    },
  },
  exit: {
    spoiler(token) {
      this.exit(token);
    },
  },
};

/** The unified (remark) plugin: `unified().use(remarkParse).use(remarkSpoiler)`. */
export function remarkSpoiler(this: Processor): void {
  const data = this.data();
  (data.micromarkExtensions ??= []).push(spoilerSyntax());
  (data.fromMarkdownExtensions ??= []).push(spoilerFromMarkdown);
}

/**
 * Pairs up the `||` markers found in a paragraph. Each closer is matched with the nearest
 * opener before it, so nested spoilers resolve inside-out. Unmatched markers become plain text.
 */
const resolveAllSpoilers: Resolver = (events, context) => {
  let index = -1;
  while (++index < events.length) {
    const closer = events[index];
    if (!closer) continue;
    const [kind, token] = closer;
    if (kind !== 'enter' || token.type !== 'spoilerSequenceTemporary' || !token._close) continue;

    let open = index;
    while (open--) {
      const opener = events[open];
      if (
        opener?.[0] !== 'exit' ||
        opener[1].type !== 'spoilerSequenceTemporary' ||
        !opener[1]._open
      ) {
        continue;
      }
      const openToken = opener[1];
      openToken.type = 'spoilerSequence';
      token.type = 'spoilerSequence';

      const spoiler: Token = {
        type: 'spoiler',
        start: { ...openToken.start },
        end: { ...token.end },
      };
      const text: Token = {
        type: 'spoilerText',
        start: { ...openToken.end },
        end: { ...token.start },
      };
      const nextEvents: Event[] = [
        ['enter', spoiler, context],
        ['enter', openToken, context],
        ['exit', openToken, context],
        ['enter', text, context],
      ];
      // Resolve emphasis and other spans between the markers, as strikethrough does.
      const insideSpan = context.parser.constructs.insideSpan.null;
      if (insideSpan) {
        splice(
          nextEvents,
          nextEvents.length,
          0,
          resolveAll(insideSpan, events.slice(open + 1, index), context),
        );
      }
      splice(nextEvents, nextEvents.length, 0, [
        ['exit', text, context],
        ['enter', token, context],
        ['exit', token, context],
        ['exit', spoiler, context],
      ]);
      splice(events, open - 1, index - open + 3, nextEvents);
      index = open + nextEvents.length - 2;
      break;
    }
  }

  // Markers that found no partner are ordinary text.
  for (const [, token] of events) {
    if (token.type === 'spoilerSequenceTemporary') token.type = 'data';
  }
  return events;
};

/** Reads one `||` marker and notes whether it can open, close, or both. */
function tokenizeSpoiler(
  this: TokenizeContext,
  effects: Parameters<Tokenizer>[0],
  ok: State,
  nok: State,
): State {
  const previous = this.previous;
  const lastEvent = this.events.at(-1);
  let size = 0;

  const start: State = (code) => {
    // A pipe right after another pipe is part of a longer run, unless that pipe was escaped.
    if (previous === PIPE && lastEvent?.[1].type !== 'characterEscape') return nok(code);
    effects.enter('spoilerSequenceTemporary');
    return more(code);
  };

  const more: State = (code: Code) => {
    if (code === PIPE) {
      if (size > 1) return nok(code); // three or more pipes: not a marker
      effects.consume(code);
      size++;
      return more;
    }
    if (size < 2) return nok(code); // a single pipe: not a marker

    const token = effects.exit('spoilerSequenceTemporary');
    const before = classifyCharacter(previous);
    const after = classifyCharacter(code);
    // "Left-flanking" (can open): followed by a non-space character, and if that character is
    // punctuation, preceded by space or punctuation. "Right-flanking" (can close) mirrors it.
    token._open = !after || (after === PUNCTUATION && before !== undefined);
    token._close = !before || (before === PUNCTUATION && after !== undefined);
    return ok(code);
  };

  return start;
}
