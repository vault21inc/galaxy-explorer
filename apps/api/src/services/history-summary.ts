import { SEARCH_COLUMNS } from '@ge/db';
import { toCamelCase } from 'drizzle-orm/casing';

/**
 * Turns a batch's change-log rows into a readable summary per entity (M1-T8): "Gudrun: x
 * 120→140, name changed". Pure, so it's unit-tested without a database.
 */

export interface LogRow {
  tableName: string;
  op: 'INSERT' | 'UPDATE' | 'DELETE';
  pk: Record<string, unknown>;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
}

/** Extension tables: their columns read as the entity's own fields. */
const EXTENSION_TABLES = new Set(['celestial_objects', 'object_groups', 'events']);

/** Aspect tables: shown as "link added" on the entity they belong to. */
const ASPECTS: Record<string, { label: string; owner: string }> = {
  entity_links: { label: 'link', owner: 'entity_id' },
  entity_images: { label: 'image', owner: 'entity_id' },
  field_values: { label: 'fact', owner: 'entity_id' },
  relations: { label: 'relation', owner: 'from_entity_id' },
  entity_locations: { label: 'location', owner: 'entity_id' },
  group_members: { label: 'member', owner: 'group_id' },
};

/** Bookkeeping columns that never count as a change worth showing. */
const IGNORED = new Set([
  'updated_at',
  'version',
  'created_at',
  'name_plain',
  'entity_id',
  'map_id',
  // Derived for search (M7-T6), never edited.
  ...SEARCH_COLUMNS,
]);

/** The entity a log row is about, if it's about one. */
export function entityIdOf(row: LogRow): string | undefined {
  const data = row.after ?? row.before ?? {};
  if (row.tableName === 'entities') return row.pk.id as string;
  if (EXTENSION_TABLES.has(row.tableName)) return row.pk.entity_id as string;
  const aspect = ASPECTS[row.tableName];
  return aspect ? (data[aspect.owner] as string | undefined) : undefined;
}

export interface FieldChange {
  field: string;
  /** Present for simple values (numbers, short text, flags); absent for rich text and documents. */
  from?: unknown;
  to?: unknown;
}

export interface EntityChange {
  entityId: string;
  kind: string | null;
  name: string;
  change: 'created' | 'updated' | 'deleted';
  fields: FieldChange[];
  /** Aspect changes, such as "link added" or "2 members removed". */
  aspects: string[];
  summary: string;
}

const ASPECT_VERBS = { INSERT: 'added', UPDATE: 'changed', DELETE: 'removed' } as const;
const LOCATION_VERBS = { INSERT: 'set', UPDATE: 'changed', DELETE: 'removed' } as const;

function isSimple(value: unknown): boolean {
  return (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    (typeof value === 'string' && value.length <= 40)
  );
}

/** A simple value (see isSimple) as text. */
function show(value: unknown): string {
  if (value === null) return 'none';
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : '…';
}

/** The columns an update changed, with old and new values where they're simple. */
export function changedFields(row: LogRow): FieldChange[] {
  if (row.op !== 'UPDATE' || !row.before || !row.after) return [];
  const changes: FieldChange[] = [];
  for (const [column, to] of Object.entries(row.after)) {
    const from = row.before[column];
    if (IGNORED.has(column) || JSON.stringify(from) === JSON.stringify(to)) continue;
    const field = toCamelCase(column);
    changes.push(isSimple(from) && isSimple(to) ? { field, from, to } : { field });
  }
  return changes;
}

/**
 * Groups the rows by entity. `names` holds current names and kinds; for entities deleted since,
 * the name comes from the log itself.
 */
export function summarizeEntities(
  rows: readonly LogRow[],
  names: ReadonlyMap<string, { name: string; kind: string }>,
): EntityChange[] {
  const byEntity = new Map<
    string,
    {
      change: EntityChange['change'];
      fields: FieldChange[];
      aspects: Map<string, number>;
      logName?: string;
      logKind?: string;
    }
  >();
  for (const row of rows) {
    const entityId = entityIdOf(row);
    if (!entityId) continue;
    const entry = byEntity.get(entityId) ?? {
      change: 'updated' as EntityChange['change'],
      fields: [],
      aspects: new Map<string, number>(),
    };
    byEntity.set(entityId, entry);
    if (row.tableName === 'entities') {
      const data = row.after ?? row.before ?? {};
      entry.logName = data.name_plain as string;
      entry.logKind = data.kind as string;
      if (row.op === 'INSERT') entry.change = 'created';
      if (row.op === 'DELETE') entry.change = 'deleted';
    }
    if (row.tableName === 'entities' || EXTENSION_TABLES.has(row.tableName)) {
      entry.fields.push(...changedFields(row));
      continue;
    }
    const aspect = ASPECTS[row.tableName];
    if (aspect) {
      const verbs = row.tableName === 'entity_locations' ? LOCATION_VERBS : ASPECT_VERBS;
      const key = `${aspect.label} ${verbs[row.op]}`;
      entry.aspects.set(key, (entry.aspects.get(key) ?? 0) + 1);
    }
  }

  return [...byEntity.entries()].map(([entityId, entry]) => {
    const known = names.get(entityId);
    const name = known?.name ?? entry.logName ?? 'Unknown entity';
    const aspects = [...entry.aspects.entries()].map(([text, count]) =>
      count > 1 ? `${String(count)} ${text.replace(/^(\w+)/, '$1s')}` : text,
    );
    const parts =
      entry.change === 'updated'
        ? [
            ...entry.fields.map((field) =>
              'from' in field
                ? `${field.field} ${show(field.from)}→${show(field.to)}`
                : `${field.field} changed`,
            ),
            ...aspects,
          ]
        : [entry.change, ...aspects];
    return {
      entityId,
      kind: known?.kind ?? entry.logKind ?? null,
      name,
      change: entry.change,
      fields: entry.fields,
      aspects,
      summary: `${name}: ${parts.length > 0 ? parts.join(', ') : 'no visible change'}`,
    };
  });
}

export interface OtherChange {
  table: string;
  primaryKey: Record<string, unknown>;
  change: 'created' | 'updated' | 'deleted';
  summary: string;
}

const OTHER_LABELS: Record<string, string> = {
  universes: 'Universe',
  maps: 'Map',
  group_types: 'Group type',
  event_categories: 'Event category',
  object_subtypes: 'Object subtype',
  field_definitions: 'Field definition',
  assets: 'Asset',
};

/** Changes to rows that aren't about an entity: universes, maps, settings, assets. */
export function summarizeOthers(rows: readonly LogRow[]): OtherChange[] {
  return rows
    .filter((row) => entityIdOf(row) === undefined)
    .map((row) => {
      const data = row.after ?? row.before ?? {};
      const label = OTHER_LABELS[row.tableName] ?? row.tableName;
      const name = (data.name_plain ??
        data.name ??
        data.label ??
        data.original_filename ??
        data.slug ??
        '') as string;
      const change = row.op === 'INSERT' ? 'created' : row.op === 'DELETE' ? 'deleted' : 'updated';
      const fields = changedFields(row).map((field) =>
        'from' in field
          ? `${field.field} ${show(field.from)}→${show(field.to)}`
          : `${field.field} changed`,
      );
      return {
        table: row.tableName,
        primaryKey: row.pk,
        change,
        summary: `${label}${typeof name === 'string' && name ? ` "${name}"` : ''}: ${change === 'updated' && fields.length > 0 ? fields.join(', ') : change}`,
      };
    });
}
