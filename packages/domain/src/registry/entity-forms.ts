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
  | 'number'
  /** A storm's rim gaps: up to four angle and width pairs (M4-T6). */
  | 'rimGaps'
  /** A rift's points: their count, and the switch for adding them on the map (M4-T6). */
  | 'riftPath'
  /** The one image an entity has in a role, such as a storm's `region_texture` (M4-T6). */
  | 'imageRole'
  /** A number between the schema's limits, dragged; the map previews it live (M6-T2). */
  | 'slider'
  /** A planet's random seed, with a dice button for a new one (M6-T2). */
  | 'seed'
  /** A planet's palette: 2–6 colors, previewed live while picked (M6-T2). */
  | 'palette'
  /** An icon from the bundled sets, searched and picked (an event category's, M6-T4). */
  | 'icon';

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
      /** The entity's field to compare with, when it has another name than `matchField`. */
      matchOn?: string;
    }
  /**
   * The map's groups that this group may sit in: those of its type's parent type, except
   * itself and its own descendants (M4-T4).
   */
  | { from: 'parentGroups' }
  /**
   * The objects of a base type beside this one, in the same parent, such as the stars a planet
   * may orbit (M5-T4, D-29). `noneLabel` names the empty choice ("The system's center").
   */
  | { from: 'siblings'; baseType: string; noneLabel: string };

/**
 * When a field shows:
 * - `explorableType`: only for base types that open a view of their own
 *   (`objectTypes[baseType].explorableAs`);
 * - `regionType`: only for base types drawn as a region (nebulae and anomalies, M4-T6);
 * - `systemChild`: only for an object inside a system (orbits, M5-T4);
 * - `planetType`: only for base types drawn as a globe (planets and moons, M6-T2);
 * - `{ path, in }`: only while the field at `path`, or its inherited default, is one of these
 *   values, such as the storm fields while `appearance.region.shape` is `storm`, or the cloud
 *   fields while `appearance.planet.clouds.enabled` is `true`;
 * - `{ path, notIn }`: only while it's none of them.
 */
export type FormCondition =
  | 'explorableType'
  | 'regionType'
  | 'systemChild'
  | 'planetType'
  | { path: string; in: readonly (string | boolean)[] }
  | { path: string; notIn: readonly (string | boolean)[] };

interface FieldBase {
  label: string;
  /** A short explanation under the field. */
  hint?: string;
  /**
   * The hint comes from the universe instead, when it has one: its date format notes for an
   * event's date (M6-T5). `hint` is the fallback.
   */
  hintFrom?: 'dateFormatNotes';
  /** Every condition must hold. */
  showWhen?: FormCondition | readonly FormCondition[];
}

export type FormFieldDef =
  | (FieldBase & {
      widget: Exclude<FormWidget, 'select' | 'position' | 'imageRole'>;
      /** The writable field, or a dotted path into a jsonb document: `appearance.color`. */
      path: string;
    })
  | (FieldBase & { widget: 'select'; path: string; options: FormOptions })
  /** Edits x, y and z together, in the parent frame's unit. */
  | (FieldBase & { widget: 'position' })
  /**
   * An image role. A string rather than `ImageRole`, which this file can't import without a
   * cycle; a test checks it's one of `IMAGE_ROLES`. `path` is the setting it goes with, set to
   * `value` when an image is chosen (the storm's `texture: 'upload'`).
   */
  | (FieldBase & { widget: 'imageRole'; role: string; path: string; value: string });

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
