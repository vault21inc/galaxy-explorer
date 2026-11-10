import { fieldPaths, universeForm, UniverseUpdate } from '@ge/domain';
import type { Universe } from '@/api/containers.ts';
import { widgetFor } from '../entity-form/widgets.ts';
import { useUniverseSave } from './use-universe-save.ts';

/**
 * The universe's details on its settings page (M4-T1): name, description, date format notes,
 * accent color and distance unit labels. Generated from `universeForm` with the entity form's
 * widgets, each saving on its own like the entity form.
 */
export function UniverseDetails({ universe }: { universe: Universe }) {
  const { save, revision } = useUniverseSave(universe);
  return (
    <form
      aria-label="Universe details"
      className="flex max-w-xl flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
      }}
    >
      {universeForm.map((field) => {
        const Widget = widgetFor(field);
        return (
          <Widget
            key={fieldPaths(field).join(',')}
            field={field}
            schema={UniverseUpdate}
            record={universe}
            universeId={universe.id}
            title={universe.namePlain}
            subtypes={[]}
            revision={revision}
            save={save}
          />
        );
      })}
    </form>
  );
}
