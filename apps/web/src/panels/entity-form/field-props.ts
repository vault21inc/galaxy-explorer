import type { ConfigReadOf, fieldSchemaIn, FormFieldDef } from '@ge/domain';

/**
 * What a form edits: an entity (the panel's form), a universe (the settings page's details) or
 * a settings row (its tables, M4-T1). The widgets read values from it by path.
 */
export interface FormRecord {
  id: string;
  [field: string]: unknown;
}

/** An object schema the widgets validate against: the record's update schema. */
export type RecordSchema = Parameters<typeof fieldSchemaIn>[0];

/** Saves some fields of the record as one change; resolves with the saved record, or null. */
export type SaveFields = (
  changes: Record<string, unknown>,
  description: string,
) => Promise<FormRecord | null>;

/** What every form widget gets (widgets.ts). */
export interface FieldProps<F extends FormFieldDef = FormFieldDef> {
  field: F;
  /** The record's update schema: widgets validate with it and read their limits from it. */
  schema: RecordSchema;
  record: FormRecord;
  /** For choices from the universe's settings (subtypes, group types). */
  universeId: string;
  /** How a change's batch description names the record: “Gudrun”. */
  title: string;
  subtypes: readonly ConfigReadOf<'object_subtypes'>[];
  /** Bumped when the form throws away local edits: after a failed save or a conflict reload. */
  revision: number;
  save: SaveFields;
  /** In a table cell: the label is for screen readers only, and hints are left out. */
  compact?: boolean;
}

/** A field with a path: every widget but the position. */
export type PathFieldDef = Extract<FormFieldDef, { path: string }>;

/** The batch description for a change to one field ("Edit color of “Gudrun”"). */
export function editDescription(title: string, label: string): string {
  return `Edit ${label.toLowerCase()} of “${title}”`;
}
