/**
 * Editor forms as data (architecture.md §3.1, ux.md §5): which fields a kind's form shows, in
 * what order, and with which widget. The web app maps each widget name to a component and
 * reads limits (min, max, nullable) from the kind's Zod update schema, so no kind has a form
 * file of its own.
 */

/** The widgets the web app knows. Each is one component in `apps/web/src/panels/entity-form/`. */
export type FormWidget =
  | 'name'
  | 'richText'
  | 'switch'
  | 'select'
  | 'color'
  | 'perViewScale'
  | 'position'
  | 'text'
  | 'number';

/** Where a select's choices come from. */
export type FormOptions =
  | { from: 'values'; values: readonly string[]; labels?: Readonly<Record<string, string>> }
  | {
      from: 'config';
      /**
       * A config resource's name, such as 'object_subtypes'. A string rather than
       * `ConfigResource`, whose type depends on the entity kinds (a test checks the names).
       */
      resource: string;
      /** Only items whose field of this name equals the entity's (subtypes match `baseType`). */
      matchField?: string;
    };

/**
 * When a field shows. `explorableType`: only for base types that open a view of their own
 * (`objectTypes[baseType].explorableAs`).
 */
export type FormCondition = 'explorableType';

interface FieldBase {
  label: string;
  /** A short explanation under the field. */
  hint?: string;
  showWhen?: FormCondition;
}

export type FormFieldDef =
  | (FieldBase & {
      widget: Exclude<FormWidget, 'select' | 'position'>;
      /** The writable field, or a dotted path into a jsonb document: `appearance.color`. */
      path: string;
    })
  | (FieldBase & { widget: 'select'; path: string; options: FormOptions })
  /** Edits x, y and z together, in the parent frame's unit. */
  | (FieldBase & { widget: 'position' });

/**
 * A kind's own part of the form. `formFor` wraps it in the fields every kind shares: name,
 * summary and description first, then these details, status and the spoiler flag, then
 * appearance (the order of ux.md §5).
 */
export interface EntityFormDef {
  details: readonly FormFieldDef[];
  appearance: readonly FormFieldDef[];
}

/** One titled group of fields in the form. */
export interface FormGroup {
  /** Null for the first group (name and text), which has no heading. */
  heading: string | null;
  fields: readonly FormFieldDef[];
}

export const STATUS_LABELS = { draft: 'Draft', published: 'Published' } as const;

const SHARED_TEXT: readonly FormFieldDef[] = [
  { path: 'name', widget: 'name', label: 'Name' },
  { path: 'summary', widget: 'richText', label: 'Summary', hint: 'One or two sentences.' },
  { path: 'description', widget: 'richText', label: 'Description' },
];

const SHARED_DETAILS: readonly FormFieldDef[] = [
  {
    path: 'status',
    widget: 'select',
    label: 'Status',
    options: { from: 'values', values: ['draft', 'published'], labels: STATUS_LABELS },
    hint: 'Drafts are visible only to editors.',
  },
  {
    path: 'isSpoiler',
    widget: 'switch',
    label: 'Whole entry is a spoiler',
    hint: 'Readers see a redacted title until they reveal it.',
  },
];

/** The form's groups for a kind's form definition, in order. Empty groups are left out. */
export function formGroups(form: EntityFormDef): FormGroup[] {
  const groups: FormGroup[] = [
    { heading: null, fields: SHARED_TEXT },
    { heading: 'Details', fields: [...form.details, ...SHARED_DETAILS] },
    { heading: 'Appearance', fields: form.appearance },
  ];
  return groups.filter((group) => group.fields.length > 0);
}

/** The paths a field writes: `x`, `y` and `z` for a position, otherwise its own path. */
export function fieldPaths(field: FormFieldDef): readonly string[] {
  return field.widget === 'position' ? ['x', 'y', 'z'] : [field.path];
}
