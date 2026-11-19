import {
  entityKinds,
  fieldPaths,
  planetPresets,
  schemasFor,
  type PlanetPresetName,
} from '@ge/domain';
import { useState } from 'react';
import { Button } from '@/components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.tsx';
import type { FieldProps, FormRecord, PathFieldDef, SaveFields } from '../field-props.ts';
import { valueAt } from '../field-path.ts';
import { shows } from '../form-conditions.ts';
import { widgetFor } from '../widgets.ts';
import { FieldRow } from './field-row.tsx';
import { RichTextField } from './rich-text-field.tsx';

/** The subtype's description, edited in the dialog beside its look. */
const DESCRIPTION: PathFieldDef = { path: 'description', widget: 'richText', label: 'Description' };

/**
 * The appearance fields a subtype's default look offers: the object form's own (entity-kinds
 * registry), less those that belong to one object rather than a kind of them: its uploaded
 * surface map and its random seed.
 */
const LOOK_FIELDS = entityKinds.celestial_object.form.appearance.filter(
  (field) => field.widget !== 'imageRole' && field.widget !== 'seed',
);

/** The object schema the appearance fields validate against (`appearance.*`). */
const OBJECT_SCHEMA = schemasFor('celestial_object').update;

/**
 * The `defaultLook` widget (M7-T2): a subtype's description and default appearance, edited in a
 * dialog opened from its settings row, with the same appearance fields as an object's form.
 *
 * The fields are handed a stand-in object of the subtype's base type whose `appearance` is the
 * subtype's `defaultAppearance`. Its fields' conditions (planet fields for planets, region
 * fields for nebulae) and the dimmed defaults (the base type's, and a preset's) then work as
 * on an object, with no widget knowing about subtypes; each save is written back as
 * `defaultAppearance`. In a new row it saves into the row's draft like any other cell.
 */
export function DefaultLookField(props: FieldProps<PathFieldDef>) {
  const { field, record, title, save, compact } = props;
  const [open, setOpen] = useState(false);
  const color = valueAt(record, `${field.path}.color`);
  const preset = valueAt(record, `${field.path}.planet.preset`);
  const summary = [
    typeof preset === 'string' && preset in planetPresets
      ? planetPresets[preset as PlanetPresetName].label
      : null,
    typeof color === 'string' ? color : null,
  ]
    .filter((part) => part !== null)
    .join(', ');

  return (
    <FieldRow label={field.label} hint={field.hint} compact={compact}>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="justify-start gap-2"
        aria-label={`${field.label} of ${title}`}
        onClick={() => {
          setOpen(true);
        }}
      >
        {typeof color === 'string' && (
          <span
            aria-hidden
            className="size-3 shrink-0 rounded-full border"
            style={{ backgroundColor: color }}
          />
        )}
        <span className="truncate">{summary || 'Base type’s'}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              What every object of this subtype starts with. An object’s own settings still win.
            </DialogDescription>
          </DialogHeader>
          <LookFields {...props} save={save} />
        </DialogContent>
      </Dialog>
    </FieldRow>
  );
}

function LookFields(props: FieldProps<PathFieldDef> & { save: SaveFields }) {
  const { field, record, schema, universeId, title, revision, save } = props;
  // The stand-in object: of the subtype's base type, with no subtype of its own, so the
  // defaults shown dimmed are the base type's.
  const standIn: FormRecord = {
    id: record.id,
    baseType: record.baseType,
    subtypeId: null,
    parentId: null,
    namePlain: title,
    appearance: valueAt(record, field.path) ?? {},
  };
  const saveLook: SaveFields = async (changes, description) => {
    if (!('appearance' in changes)) return standIn;
    const saved = await save({ [field.path]: changes.appearance ?? {} }, description);
    return saved ? { ...standIn, appearance: valueAt(saved, field.path) ?? {} } : null;
  };
  const fields = LOOK_FIELDS.filter((item) =>
    shows(item, standIn, { subtypes: [], inSystem: false }),
  );
  return (
    <div className="flex flex-col gap-3">
      <RichTextField
        field={DESCRIPTION}
        schema={schema}
        record={record}
        universeId={universeId}
        title={title}
        subtypes={[]}
        revision={revision}
        save={save}
      />
      <h3 className="mt-2 text-xs text-muted-foreground label-caps">Default look</h3>
      {fields.map((item) => {
        const Widget = widgetFor(item);
        return (
          <Widget
            key={fieldPaths(item).join(',')}
            field={item}
            schema={OBJECT_SCHEMA}
            record={standIn}
            universeId={universeId}
            title={title}
            subtypes={[]}
            revision={revision}
            save={saveLook}
          />
        );
      })}
    </div>
  );
}
