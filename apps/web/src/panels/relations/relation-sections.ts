import { relationTypes, RELATION_TYPES, type RelationTypeDef } from '@ge/domain';
import type { SectionDef } from '../sections.ts';
import { relationSection } from './relation-section.tsx';

/**
 * A panel section for each end of each typed relation (M6-T6), from the relation-types
 * registry: `participant` (a character → an event) gives an event "People involved" and a
 * character "Involved in". A relation open to any kind ('*', like `related`) stays in the
 * generic Relations section instead.
 */
export function typedRelationSections(): SectionDef[] {
  return RELATION_TYPES.flatMap((type) => {
    // Widened: the registry's literal types make '*' checks look impossible for some types.
    const { from, to }: RelationTypeDef = relationTypes[type];
    if (from === '*' || to === '*') return [];
    // The other end's kind: one per end, as every typed relation has today.
    const [fromKind] = from;
    const [toKind] = to;
    if (!fromKind || !toKind) return [];
    return [
      {
        id: `relation-${type}-to`,
        component: relationSection(type, 'to', fromKind),
        include: 'relations' as const,
        appliesTo: (def, kind) => def.aspects.relations && to.includes(kind),
      },
      {
        id: `relation-${type}-from`,
        component: relationSection(type, 'from', toKind),
        include: 'relations' as const,
        appliesTo: (def, kind) => def.aspects.relations && from.includes(kind),
      },
    ];
  });
}

/** The relation types the generic Relations section shows: those open to any kind. */
export const UNTYPED_RELATIONS: ReadonlySet<string> = new Set(
  RELATION_TYPES.filter((type) => {
    const def: RelationTypeDef = relationTypes[type];
    return def.from === '*' || def.to === '*';
  }),
);
