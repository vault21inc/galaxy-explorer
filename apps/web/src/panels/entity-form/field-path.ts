/**
 * Form fields name what they edit by path: a writable field (`name`) or a key inside a jsonb
 * document (`appearance.color`). Documents are written whole (the API replaces them), so a
 * nested change is the document with that one key changed.
 */

type Doc = Record<string, unknown>;

const isDoc = (value: unknown): value is Doc =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The value at a path, or undefined. */
export function valueAt(entity: object, path: string): unknown {
  let value: unknown = entity;
  for (const key of path.split('.')) value = isDoc(value) ? value[key] : undefined;
  return value;
}

/**
 * The PATCH body fields that set `path` to `value`. Undefined removes a document key: the
 * value falls back to its default again ("reset to default", ux.md §5).
 */
export function changesFor(entity: object, path: string, value: unknown): Doc {
  const [top = '', ...rest] = path.split('.');
  if (rest.length === 0) return { [top]: value };
  return { [top]: setIn(valueAt(entity, top), rest, value) };
}

function setIn(doc: unknown, keys: readonly string[], value: unknown): Doc {
  const [key = '', ...rest] = keys;
  const current: Doc = isDoc(doc) ? doc : {};
  const next = rest.length === 0 ? value : setIn(current[key], rest, value);
  // An emptied key is left out, so the document stays sparse (data-model §4).
  const others = Object.entries(current).filter(([name]) => name !== key);
  const keep = next !== undefined && !(isDoc(next) && Object.keys(next).length === 0);
  return Object.fromEntries(keep ? [...others, [key, next]] : others);
}

/**
 * A key for a field's editor that changes when its saved value does, or when the form
 * discards local edits (`revision`). Remounting on it replaces what's typed with what's saved.
 */
export function valueKey(value: unknown, revision: number): string {
  return `${revision.toString()}:${JSON.stringify(value ?? null)}`;
}
