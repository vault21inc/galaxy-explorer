import type { EntityKind } from './entity-kinds.ts';

/**
 * How entities relate (architecture.md §3.4). `from` and `to` list the kinds allowed at each
 * end, or '*' for any kind.
 */
export interface RelationTypeDef {
  from: readonly EntityKind[] | '*';
  to: readonly EntityKind[] | '*';
  /** Shown on the `from` entity. */
  label: string;
  /** Shown on the `to` entity; symmetric relations use `label` both ways. */
  inverseLabel?: string;
  symmetric?: true;
}

export function defineRelationTypes<const T extends Record<string, RelationTypeDef>>(types: T): T {
  return types;
}

export const relationTypes = defineRelationTypes({
  participant: {
    from: ['character'],
    to: ['event'],
    label: 'Involved in',
    inverseLabel: 'People involved',
  },
  related: { from: '*', to: '*', label: 'Related to', symmetric: true },
});

export type RelationType = keyof typeof relationTypes;
export const RELATION_TYPES = Object.keys(relationTypes) as [RelationType, ...RelationType[]];
