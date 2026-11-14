import { REDACTION_CHAR } from '../richtext/redaction-bar.ts';
import type { RichText } from '../richtext/schema.ts';
import { toPlainText } from '../richtext/plain-text.ts';
import { HIDE_SPOILERS } from '../spoilers/policy.ts';
import { redactEntity } from '../spoilers/redact-entity.ts';

/**
 * What search finds an entity by (M7-T6, data-model §12). The database keeps two indexes per
 * entity, both built from the text these functions give:
 * - `search_all`: its name, summary and description, its text facts and its relations' roles;
 * - `search_public`: the same after `redactEntity` with spoilers hidden, so a reader who hides
 *   spoilers can't find an entry by a word only a spoiler holds. A hidden entry has none.
 */

export interface SearchSource {
  id: string;
  isSpoiler: boolean;
  name: RichText;
  summary: RichText | null;
  description: RichText | null;
  facts: { fieldDefinitionId: string; value: unknown; isSpoiler: boolean }[];
  relations: { id: string; relationType: string; role: RichText | null; isSpoiler: boolean }[];
}

/** An entity's searchable text in pieces, its name first: as stored, and as the public sees it. */
export interface SearchText {
  all: string[];
  public: string[];
}

const REDACTED = new RegExp(`${REDACTION_CHAR}+`, 'g');

function pieces(source: SearchSource, redact: boolean): string[] {
  const plain = (text: RichText | null | undefined) =>
    text ? toPlainText(text, { redactSpoilers: redact }).replace(REDACTED, ' ').trim() : '';
  const facts = source.facts.flatMap((fact) => {
    const value = (fact as { value?: { type?: unknown; text?: RichText } }).value;
    return value?.type === 'text' && value.text ? [plain(value.text)] : [];
  });
  const roles = source.relations.flatMap((relation) =>
    'role' in relation ? [plain(relation.role)] : [],
  );
  return [plain(source.name), plain(source.summary), plain(source.description), ...facts, ...roles];
}

export function searchText(source: SearchSource): SearchText {
  const redacted = redactEntity(source, HIDE_SPOILERS) as unknown as SearchSource;
  return { all: pieces(source, false), public: pieces(redacted, true) };
}

/** Lower case without accents: "Gudrún" matches "gudrun". */
function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** The words of a query, folded, at most eight: each matches words that start with it. */
export function searchTerms(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term !== '')
    .slice(0, 8);
}

/** About how long a snippet is, in characters. */
const SNIPPET_LENGTH = 140;

/**
 * A short excerpt around the first word that starts with one of the terms, with "…" where
 * it's cut; or, without a match, the text's start. Used for the text after an entity's name,
 * so a result shows why it matched.
 */
export function searchSnippet(text: string, terms: readonly string[]): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  if (flat === '') return '';
  // Folding keeps a string's length for most scripts; where it doesn't, the excerpt is only
  // a little off.
  const folded = fold(flat);
  let at = -1;
  for (const term of terms) {
    const match = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(term)}`, 'u').exec(folded);
    if (match && (at < 0 || match.index < at)) at = match.index + (match[1]?.length ?? 0);
  }
  if (flat.length <= SNIPPET_LENGTH) return flat;
  const start = at < 0 ? 0 : Math.max(0, at - Math.floor(SNIPPET_LENGTH / 3));
  const end = Math.min(flat.length, start + SNIPPET_LENGTH);
  return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
