import { entityKinds, objectTypes, spoilerKeys, type BaseType } from '@ge/domain';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import { useEditor } from '@/state/editor.ts';
import { NameField } from './name-field.tsx';
import type { SectionProps } from '../types.ts';

/** The entity's name, then what it is: base type and subtype for objects, the kind otherwise. */
export function HeaderSection({ kind, entity, subtypes }: SectionProps) {
  const fields = entity as typeof entity & { baseType?: BaseType; subtypeId?: string | null };
  const typeLabel = fields.baseType
    ? objectTypes[fields.baseType].label
    : entityKinds[kind].label.one;
  const subtype = subtypes.find((item) => item.id === fields.subtypeId);
  const editing = useEditor((state) => state.editing);
  return (
    <header className="flex flex-col gap-1">
      {/* Plain names are editable here; formatted ones wait for M3-T4's rich-text field. */}
      {editing && entity.name.format === 'plain' ? (
        <NameField key={entity.version} kind={kind} entity={entity} />
      ) : (
        <h2 className="text-lg leading-tight font-semibold">
          <RichTextView
            value={entity.name}
            fieldKey={spoilerKeys.field(spoilerKeys.record(entity.id), 'name')}
            inline
          />
        </h2>
      )}
      <p className="text-xs text-muted-foreground label-caps">
        {typeLabel}
        {subtype && <> · {subtype.name}</>}
        {entity.status === 'draft' && (
          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-foreground normal-case tracking-normal">
            Draft
          </span>
        )}
      </p>
    </header>
  );
}
