import { refFieldOf, type References, type ReferenceTarget } from '@ge/domain';

/** Helpers shared by export and import (M7-T4). */

type Row = Record<string, unknown>;

/** Each record's reference, by its database id, per kind of target. */
export interface RefLookup {
  entity: Map<string, string>;
  /** Settings rows of every resource: ids are unique across tables. */
  config: Map<string, string>;
  /** An asset's sha256. */
  asset: Map<string, string>;
}

export function lookupRef(lookup: RefLookup, target: ReferenceTarget, id: string): string {
  const table =
    target === 'entity' ? lookup.entity : target === 'asset' ? lookup.asset : lookup.config;
  const ref = table.get(id);
  // Every row the export points at is in it: a miss is a bug, not bad data.
  if (ref === undefined) throw new Error(`The export has no ${target} with id ${id}.`);
  return ref;
}

export interface RecordOptions {
  /** The row's id fields and what they point at. */
  references?: References;
  /** Renames, where dropping "Id" reads badly (a fact's `fieldDefinitionId` is `field`). */
  names?: Readonly<Record<string, string>>;
  lookup?: RefLookup;
  /** Values for fields the row doesn't have: aspects, and the record's own `ref`. */
  extra?: Row;
}

/**
 * A row as an export record: the record schema's fields in their order, ids swapped for
 * references, and nulls and empty lists left out (an import reads a missing field as its
 * default).
 */
export function recordOf(
  schema: { shape: Readonly<Record<string, unknown>> },
  row: Row,
  options: RecordOptions = {},
): Row {
  const { references = {}, names = {}, lookup, extra = {} } = options;
  const idFields = new Map(
    Object.entries(references).map(([field, target]) => [
      names[field] ?? refFieldOf(field),
      { field, target },
    ]),
  );
  const record: Row = {};
  for (const field of Object.keys(schema.shape)) {
    let value: unknown;
    const id = idFields.get(field);
    if (field in extra) value = extra[field];
    else if (id) {
      const raw = row[id.field];
      value = typeof raw === 'string' && lookup ? lookupRef(lookup, id.target, raw) : raw;
    } else value = row[field];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    record[field] = value;
  }
  return record;
}

/**
 * Items with the ones they depend on first (a planet after its system, a group after its
 * parent group), otherwise in their given order. Applied to a list already in that order it
 * changes nothing, which keeps an export, its import and the next export in the same order.
 * A cycle can't happen (the services refuse one); were it to, it's broken where it closes.
 */
export function topoOrder<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  dependsOn: (item: T) => readonly unknown[],
): T[] {
  const byKey = new Map(items.map((item) => [keyOf(item), item]));
  const ordered: T[] = [];
  const seen = new Set<string>();
  const visit = (item: T) => {
    const key = keyOf(item);
    if (seen.has(key)) return;
    seen.add(key);
    for (const dependency of dependsOn(item)) {
      const before = typeof dependency === 'string' ? byKey.get(dependency) : undefined;
      if (before !== undefined && before !== item) visit(before);
    }
    ordered.push(item);
  };
  items.forEach(visit);
  return ordered;
}

/** Location fields in one order for every mode. */
export const LOCATION_RECORD = {
  shape: {
    mode: 1,
    object: 1,
    place: 1,
    latDeg: 1,
    lonDeg: 1,
    x: 1,
    y: 1,
    z: 1,
    isSpoiler: 1,
  },
};
