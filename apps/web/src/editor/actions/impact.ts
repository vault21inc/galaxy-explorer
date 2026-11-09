/**
 * The delete confirmation's summary (ux.md §5): "7 child objects, 3 group memberships; 4 events
 * become unplaced". It's read from a dry-run batch's `impact`, the rows each table would lose
 * or change (M1-T7), so it counts exactly what the real delete would do, cascades included.
 */

/** Rows touched per table, as the batch API reports them (snake_case table names). */
export type Impact = Readonly<
  Record<string, { readonly insert: number; readonly update: number; readonly delete: number }>
>;

/** What goes with the deleted objects: the database tables, in plain words. */
const DELETED: readonly { table: string; one: string; many: string }[] = [
  { table: 'group_members', one: 'group membership', many: 'group memberships' },
  { table: 'field_values', one: 'fact', many: 'facts' },
  { table: 'entity_links', one: 'link', many: 'links' },
  { table: 'entity_images', one: 'image', many: 'images' },
  { table: 'entity_relations', one: 'relation', many: 'relations' },
];

export interface ImpactSummary {
  /** Objects below the deleted ones, deleted with them. */
  childObjects: number;
  /** Everything else deleted with them, in words: "3 group memberships". */
  alsoDeleted: string[];
  /** Places and events located at a deleted object, which stay but lose their location. */
  unplaced: number;
}

const count = (n: number, one: string, many: string) => `${n.toString()} ${n === 1 ? one : many}`;

/** Sums up an impact for deleting `deletedCount` objects. */
export function summarizeImpact(impact: Impact, deletedCount: number): ImpactSummary {
  const deleted = (table: string) => impact[table]?.delete ?? 0;
  return {
    childObjects: Math.max(0, deleted('celestial_objects') - deletedCount),
    alsoDeleted: DELETED.flatMap(({ table, one, many }) =>
      deleted(table) > 0 ? [count(deleted(table), one, many)] : [],
    ),
    unplaced: deleted('entity_locations'),
  };
}

/** The summary as one line, or null when nothing else is affected. */
export function describeImpact(summary: ImpactSummary): string | null {
  const parts = [
    ...(summary.childObjects > 0
      ? [count(summary.childObjects, 'child object', 'child objects')]
      : []),
    ...summary.alsoDeleted,
  ];
  const unplaced =
    summary.unplaced > 0
      ? `${count(summary.unplaced, 'place or event becomes', 'places or events become')} unplaced`
      : null;
  if (parts.length === 0) return unplaced;
  return unplaced ? `${parts.join(', ')}; ${unplaced}` : parts.join(', ');
}
