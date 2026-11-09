import type { ConfigReadOf, EntityKind, FormFieldDef } from '@ge/domain';
import type { PanelEntity } from '../types.ts';

/** Saves some fields of the entity as one change; resolves with the saved entity, or null. */
export type SaveFields = (
  changes: Record<string, unknown>,
  description: string,
) => Promise<PanelEntity | null>;

/** What every form widget gets (widgets.ts). */
export interface FieldProps<F extends FormFieldDef = FormFieldDef> {
  field: F;
  kind: EntityKind;
  entity: PanelEntity;
  subtypes: readonly ConfigReadOf<'object_subtypes'>[];
  /** Bumped when the form throws away local edits: after a failed save or a conflict reload. */
  revision: number;
  save: SaveFields;
}

/** A field with a path: every widget but the position. */
export type PathFieldDef = Extract<FormFieldDef, { path: string }>;

/** The batch description for a change to one field ("Edit color of “Gudrun”"). */
export function editDescription(entity: PanelEntity, label: string): string {
  return `Edit ${label.toLowerCase()} of “${entity.namePlain}”`;
}
