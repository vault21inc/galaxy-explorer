import type { RichText } from '../richtext/schema.ts';
import { isHidden, spoilerKeys, type SpoilerPolicy } from './policy.ts';
import { blackedOut, redactOptionalRichText, syncPlainName } from './redact-rich-text.ts';

/** A map: `isSpoiler` hides all of it; its text fields can be spoilers on their own. */
export interface RedactableMap {
  id: string;
  isSpoiler: boolean;
  name: RichText;
  description?: RichText | null;
}

/** A universe has no whole-universe flag (data-model §7), only spoilers in its texts. */
export interface RedactableUniverse {
  id: string;
  name: RichText;
  description?: RichText | null;
  dateFormatNotes?: RichText | null;
}

export function redactMap<M extends RedactableMap>(map: M, policy: SpoilerPolicy): M {
  const whole = isHidden(map.isSpoiler, spoilerKeys.record(map.id), policy);
  return redactTextFields(map, ['name', 'description'], policy, whole);
}

export function redactUniverse<U extends RedactableUniverse>(
  universe: U,
  policy: SpoilerPolicy,
): U {
  return redactTextFields(universe, ['name', 'description', 'dateFormatNotes'], policy, false);
}

function redactTextFields<T extends { id: string }>(
  record: T,
  fields: readonly (keyof T & string)[],
  policy: SpoilerPolicy,
  whole: boolean,
): T {
  const result: Record<string, unknown> = { ...record };
  for (const field of fields) {
    const value = record[field] as RichText | null | undefined;
    if (value === undefined) continue;
    result[field] =
      whole && value
        ? blackedOut(value)
        : redactOptionalRichText(value, policy, spoilerKeys.field(record.id, field));
  }
  syncPlainName(result, (record as { name?: RichText }).name);
  return result as T;
}
