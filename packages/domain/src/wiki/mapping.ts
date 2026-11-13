import type { FieldValue } from '../schemas/field-value.ts';
import { rt } from '../richtext/schema.ts';

/**
 * Mapping a wiki info box onto a universe's facts (M7-T3). Pure, so it's unit-tested, and the
 * dialog runs it again as soon as an alias is added.
 */

/** What mapping needs of a field definition. */
export interface MappableField {
  id: string;
  key: string;
  label: string;
  valueType: FieldValue['type'];
  unit?: string | null;
  wikiAliases?: readonly string[];
}

export interface MappedParam {
  param: string;
  text: string;
  field: MappableField;
  /** The value the field would get, or null when the text has none ("Unknown"). */
  value: FieldValue | null;
}

/**
 * A parameter's or field's name, compared loosely: lower case, letters and digits only, so
 * `sub-sector`, `subsector`, `Sub_sector` and `Sub-sector` are the same name.
 */
export function normalizeWikiName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Which field a parameter fills: one whose wiki aliases name it, or failing that whose key or
 * label does (so "Population" needs no alias for `population`). The first match wins, in the
 * order the fields are given (the settings' order).
 */
export function fieldForParam<F extends MappableField>(
  param: string,
  fields: readonly F[],
): F | undefined {
  const name = normalizeWikiName(param);
  if (name === '') return undefined;
  return (
    fields.find((field) =>
      (field.wikiAliases ?? []).some((alias) => normalizeWikiName(alias) === name),
    ) ??
    fields.find(
      (field) => normalizeWikiName(field.key) === name || normalizeWikiName(field.label) === name,
    )
  );
}

/** Info-box filler that says there's nothing: "Unknown", "N/A", "?". */
const NO_VALUE = /^(unknown|n\/?a|none|tbd|tba|-+|—|\?+)$/i;

/** Scale words, as a number's text or a field's unit may use them. */
const SCALES: Readonly<Record<string, number>> = {
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

/**
 * The first number in a text, with its scale word if it has one: "5,000,000,000" is 5e9,
 * "4.2 billion" is 4.2e9, "c. 12 million (est.)" is 1.2e7. Null when there's none.
 */
export function numberIn(text: string): number | null {
  const match = /(-?\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|trillion)?/i.exec(text);
  if (!match?.[1]) return null;
  const value = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const scale = match[2] ? (SCALES[match[2].toLowerCase()] ?? 1) : 1;
  return value * scale;
}

/**
 * What a parameter's text becomes as a field's value, or null when it says nothing:
 * - **number:** the first number in it, in the field's unit when that's a scale word
 *   (5,000,000,000 people in a field of billions is 5);
 * - **text:** the text itself;
 * - **date:** the text as the universe writes dates, up to 200 characters;
 * - **link:** the first http(s) address in it.
 */
export function wikiValue(text: string, field: MappableField): FieldValue | null {
  const trimmed = text.trim();
  if (trimmed === '' || NO_VALUE.test(trimmed)) return null;
  switch (field.valueType) {
    case 'number': {
      const number = numberIn(trimmed);
      if (number === null) return null;
      const scale = SCALES[(field.unit ?? '').trim().toLowerCase()] ?? 1;
      // toPrecision drops the binary noise of the division (5e9 / 1e9 is exactly 5, but
      // 4.2e9 / 1e9 isn't 4.2 in floating point without it).
      return { type: 'number', number: Number((number / scale).toPrecision(12)) };
    }
    case 'text':
      return { type: 'text', text: rt.plain(trimmed.slice(0, 2_000)) };
    case 'date_text':
      return { type: 'date_text', text: trimmed.slice(0, 200) };
    case 'url': {
      const url = /https?:\/\/[^\s<>"]+/.exec(trimmed)?.[0];
      return url ? { type: 'url', url } : null;
    }
  }
}

/**
 * A template's parameters split into those that fill a field (with the value they'd give) and
 * those that fill none, which the dialog offers as new aliases. A field is filled once, by the
 * first parameter that maps to it.
 */
export function mapWikiParams<F extends MappableField>(
  params: readonly { name: string; text: string }[],
  fields: readonly F[],
): { mapped: (MappedParam & { field: F })[]; unmapped: { name: string; text: string }[] } {
  const mapped: (MappedParam & { field: F })[] = [];
  const unmapped: { name: string; text: string }[] = [];
  const filled = new Set<string>();
  for (const param of params) {
    const field = fieldForParam(param.name, fields);
    if (!field || filled.has(field.id)) {
      if (!field) unmapped.push(param);
      continue;
    }
    filled.add(field.id);
    mapped.push({
      param: param.name,
      text: param.text,
      field,
      value: wikiValue(param.text, field),
    });
  }
  return { mapped, unmapped };
}
