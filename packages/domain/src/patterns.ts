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
