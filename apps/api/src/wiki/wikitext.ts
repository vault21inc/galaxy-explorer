import type { WikiTemplate } from '@ge/domain';

/**
 * The little of MediaWiki's markup "Fill from wiki" needs (M7-T3): a page's templates with
 * named parameters (its info box), and its lead section as Markdown. Hand-written rather than a
 * parser library: the subset is small, and the tests run it on real pages (test/fixtures/wiki).
 *
 * Markup handled:
 * - templates `{{Name|param=value|…}}`, nested to any depth;
 * - internal links `[[Target]]`, `[[Target|label]]`, and files and categories, which are dropped;
 * - external links `[https://… label]`;
 * - `'''bold'''` and `''italic''`;
 * - `<ref>…</ref>`, `<ref/>`, comments, `<br>` and other HTML tags, and common entities.
 */

/** The end of a balanced `open … close` run starting at `start`, or -1 if it never closes. */
function balancedEnd(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let i = start; i < text.length;) {
    if (text.startsWith(open, i)) {
      depth++;
      i += open.length;
    } else if (text.startsWith(close, i)) {
      depth--;
      i += close.length;
      if (depth === 0) return i;
    } else {
      i++;
    }
  }
  return -1;
}

/** Splits a template's body on the `|`s that aren't inside a nested template or link. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (let i = 0; i < body.length; i++) {
    const two = body.slice(i, i + 2);
    if (two === '{{' || two === '[[') {
      depth++;
      current += two;
      i++;
    } else if ((two === '}}' || two === ']]') && depth > 0) {
      depth--;
      current += two;
      i++;
    } else if (body[i] === '|' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += body[i] ?? '';
    }
  }
  parts.push(current);
  return parts;
}

/** Comments and references: never part of the text. */
function stripNotes(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*\/>/gi, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
}

/** Every template at the top level of `text`: its start and end. */
function topLevelTemplates(text: string): { start: number; end: number }[] {
  const found: { start: number; end: number }[] = [];
  for (let i = 0; i < text.length;) {
    if (text.startsWith('{{', i)) {
      const end = balancedEnd(text, i, '{{', '}}');
      if (end < 0) break;
      found.push({ start: i, end });
      i = end;
    } else {
      i++;
    }
  }
  return found;
}

/**
 * The page's top-level templates that have named parameters, in page order, each parameter's
 * value as plain text ("[[Helican Sub-sector]]" is "Helican Sub-sector"). The first is
 * usually the info box; the dialog lets the reader pick another.
 */
export function wikiTemplates(wikitext: string): WikiTemplate[] {
  const text = stripNotes(wikitext);
  const templates: WikiTemplate[] = [];
  for (const { start, end } of topLevelTemplates(text)) {
    const [head = '', ...parts] = splitTopLevel(text.slice(start + 2, end - 2));
    const params = parts.flatMap((part) => {
      const equals = part.indexOf('=');
      if (equals <= 0) return [];
      const name = part.slice(0, equals).trim();
      if (name === '') return [];
      return [{ name, text: plainText(part.slice(equals + 1)) }];
    });
    if (params.length > 0) templates.push({ name: head.trim(), params });
  }
  return templates;
}

/** Links, files and categories as their visible text, `transform` applied to each piece. */
function resolveLinks(text: string, label: (shown: string) => string): string {
  let result = '';
  for (let i = 0; i < text.length;) {
    if (text.startsWith('[[', i)) {
      const end = balancedEnd(text, i, '[[', ']]');
      if (end < 0) {
        result += text.slice(i);
        break;
      }
      const inner = text.slice(i + 2, end - 2);
      const [target = '', ...rest] = splitTopLevel(inner);
      // Files, images and categories show nothing in running text worth keeping.
      if (!/^\s*(file|image|category|media)\s*:/i.test(target)) {
        const shown = rest.length > 0 ? (rest[rest.length - 1] ?? '') : target.replace(/^:/, '');
        result += label(resolveLinks(shown, label).trim());
      }
      i = end;
    } else {
      result += text[i] ?? '';
      i++;
    }
  }
  // External links: [https://example.org label] shows its label, a bare one nothing.
  return result.replace(/\[(https?:\/\/[^\s\]]+)(?:\s+([^\]]*))?\]/g, (_, _url, shown?: string) =>
    shown ? label(shown) : '',
  );
}

/** Templates inside running text (citations, notes) carry no prose. */
function stripTemplates(text: string): string {
  let result = '';
  let last = 0;
  for (const { start, end } of topLevelTemplates(text)) {
    result += text.slice(last, start);
    last = end;
  }
  return result + text.slice(last);
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&nbsp;': ' ',
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&ndash;': '–',
  '&mdash;': '—',
};

function decodeEntities(text: string): string {
  return text.replace(
    /&(?:nbsp|amp|lt|gt|quot|#39|ndash|mdash);/g,
    (entity) => ENTITIES[entity] ?? entity,
  );
}

/** Marks a line break in a value until the spacing around it is tidied. */
const BREAK = '\u0001';

/** A parameter's value as plain text: links as their labels, line breaks as commas. */
export function plainText(wikitext: string): string {
  const text = resolveLinks(stripTemplates(stripNotes(wikitext)), (shown) => shown)
    .replace(/<br\s*\/?>/gi, BREAK)
    .replace(/<[^>]+>/g, '')
    .replace(/'''|''/g, '');
  return decodeEntities(text)
    .replace(/\s+/g, ' ')
    .split(BREAK)
    .map((piece) => piece.trim())
    .filter((piece) => piece !== '')
    .join(', ')
    .trim();
}

/** Characters Markdown would read as markup, escaped so the text shows as written. */
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_[\]<>|~]/g, '\\$&').replace(/^(\s*)([#>+-]|\d+\.)(\s)/gm, '$1\\$2$3');
}

/**
 * The lead section, before the first heading, as Markdown: paragraphs kept, bold and italic as
 * `**` and `*`, links as plain text, and templates, tables, files and references left out.
 */
export function leadMarkdown(wikitext: string): string {
  const heading = /^==.*==\s*$/m.exec(wikitext);
  const lead = heading ? wikitext.slice(0, heading.index) : wikitext;
  const text = resolveLinks(stripTemplates(stripNotes(lead)), (shown) => shown)
    // Tables ({| … |}) and list or indent lines aren't prose.
    .replace(/^\{\|[\s\S]*?^\|\}\s*$/gm, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '');
  const paragraphs = decodeEntities(text)
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '' && !/^[*#:;]/.test(line))
        .join(' '),
    )
    .filter((paragraph) => paragraph !== '');
  return paragraphs
    .map((paragraph) =>
      escapeMarkdown(paragraph)
        // '''bold''' and ''italic'', after escaping, so the stars added aren't escaped.
        .replace(/'''(.+?)'''/g, '**$1**')
        .replace(/''(.+?)''/g, '*$1*'),
    )
    .join('\n\n');
}
