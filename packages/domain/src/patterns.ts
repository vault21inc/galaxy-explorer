/**
 * Format rules as regular-expression source text, shared by the Zod schemas and the database
 * check constraints (data-model §2), so both enforce exactly the same thing.
 */

/** Lower-case letters and digits in hyphen-separated words: `warhammer-40k`. */
export const SLUG_PATTERN = '^[a-z0-9]+(-[a-z0-9]+)*$';
/** Six lower-case hex digits: `#4fd1ff`. */
export const HEX_COLOR_PATTERN = '^#[0-9a-f]{6}$';
/** A field definition key: `population`, `tithe_grade`. */
export const FIELD_KEY_PATTERN = '^[a-z][a-z0-9_]*$';
/** How long a field definition key may be. */
export const FIELD_KEY_MAX_LENGTH = 64;

/**
 * A field definition key made from its label, for the settings page to fill in: "Tithe grade"
 * is `tithe_grade`, "Sub-sector" `sub_sector`, "Größe" `grosse`. Accents are dropped, anything
 * but letters and digits becomes one underscore, and a key that would start with a digit gets
 * `field_` in front, as `FIELD_KEY_PATTERN` asks. A label with no letters or digits gives ''.
 */
export function fieldKeyFrom(label: string): string {
  const words = label
    .replace(/ß/g, 'ss')
    .normalize('NFKD')
    // The accents NFKD splits off letters ("é" is "e" and a combining accent).
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const key = /^[0-9]/.test(words) ? `field_${words}` : words;
  return key.slice(0, FIELD_KEY_MAX_LENGTH).replace(/_+$/, '');
}

/**
 * What a citation is for (M7-T3, data-model §3.4): one of an entity's texts, or one of its facts
 * by its field's key (`field:population`).
 */
export const CITATION_TARGET_PATTERN = '^(name|summary|description|field:[a-z][a-z0-9_]*)$';
/** An absolute http or https URL. */
export const HTTP_URL_PATTERN = '^https?://';
/**
 * An account's username (M8-T1, data-model §3.8): 3 to 32 lower-case letters, digits, hyphens
 * or underscores, starting with a letter or digit.
 */
export const USERNAME_PATTERN = '^[a-z0-9][a-z0-9_-]{2,31}$';
