import { entityKinds, objectTypes, type BaseType } from '@ge/domain';
import type { SectionProps } from '../types.ts';

/** What the entity is: base type and subtype for objects, the kind otherwise, and "Draft". */
export function KindLine({ kind, entity, subtypes }: Omit<SectionProps, 'fieldDefinitions'>) {
  const fields = entity as typeof entity & { baseType?: BaseType; subtypeId?: string | null };
  const typeLabel = fields.baseType
    ? objectTypes[fields.baseType].label
    : entityKinds[kind].label.one;
  const subtype = subtypes.find((item) => item.id === fields.subtypeId);
  return (
    <p className="text-xs text-muted-foreground label-caps">
      {typeLabel}
      {subtype && <> · {subtype.name}</>}
      {entity.status === 'draft' && (
        <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-foreground normal-case tracking-normal">
          Draft
        </span>
      )}
    </p>
  );
}
