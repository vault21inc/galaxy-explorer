import {
  entityKinds,
  fieldPaths,
  formGroups,
  objectTypes,
  schemasFor,
  type BaseType,
  type FormFieldDef,
} from '@ge/domain';
import type { SectionProps } from '../types.ts';
import { KindLine } from '../sections/kind-line.tsx';
import { SectionHeading } from '../sections/section-heading.tsx';
import { ConflictDialog } from './conflict-dialog.tsx';
import { useEntitySave } from './use-entity-save.ts';
import { widgetFor } from './widgets.ts';

/**
 * The edit form (M3-T4, ux.md §5), generated from the kind's form metadata in the entity-kinds
 * registry: the shared fields (name, summary, description, status, spoiler flag) around the
 * kind's own, each drawn by its widget (widgets.ts) and checked against the kind's Zod schema.
 * No kind has a form file. Each field saves on its own, on blur; a conflict opens the
 * "Changed elsewhere" dialog.
 */
export function EntityForm(props: SectionProps) {
  const { kind, entity, subtypes } = props;
  const { save, conflict, revision } = useEntitySave(kind, entity);
  const groups = formGroups(entityKinds[kind].form);
  const schema = schemasFor(kind).update;

  return (
    <form
      aria-label={`Edit ${entity.namePlain}`}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      {groups.map((group, index) => {
        const fields = group.fields.filter((field) => shows(field, entity));
        if (fields.length === 0) return null;
        return (
          <section key={group.heading ?? index} className="flex flex-col gap-2">
            {group.heading && <SectionHeading>{group.heading}</SectionHeading>}
            {fields.map((field, fieldIndex) => {
              const Widget = widgetFor(field);
              return (
                <div key={fieldPaths(field).join(',')} className="contents">
                  <Widget
                    field={field}
                    schema={schema}
                    record={entity}
                    universeId={entity.universeId}
                    title={entity.namePlain}
                    subtypes={subtypes}
                    revision={revision}
                    save={save}
                  />
                  {/* What the entity is, under its name. */}
                  {index === 0 && fieldIndex === 0 && <KindLine {...props} />}
                </div>
              );
            })}
          </section>
        );
      })}
      <ConflictDialog conflict={conflict} />
    </form>
  );
}

/** A field's `showWhen` condition (entity-forms.ts). */
function shows(field: FormFieldDef, entity: SectionProps['entity']): boolean {
  if (field.showWhen === 'explorableType') {
    const baseType = (entity as { baseType?: BaseType }).baseType;
    return baseType !== undefined && objectTypes[baseType].explorableAs !== null;
  }
  return true;
}
