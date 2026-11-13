/**
 * What an id field points at (M7-T4), declared next to each kind's and settings resource's
 * fields in the registries. Import and export swap these ids for readable references (an
 * entity's key or a settings row's name), and the config service checks settings references
 * by them.
 *
 * - `entity`: another entity, in the same map or (characters) the same universe;
 * - `asset`: an uploaded image of the same universe;
 * - a config resource: a universe settings row, such as a group type.
 */
export type ReferenceTarget = 'entity' | 'asset' | SettingsTarget;

/**
 * The config resources by name. They're listed here rather than imported because the config
 * registry uses `References` itself, which would make the types circular; a test checks the
 * list matches the registry.
 */
export const SETTINGS_TARGETS = [
  'group_types',
  'event_categories',
  'object_subtypes',
  'field_definitions',
] as const;
export type SettingsTarget = (typeof SETTINGS_TARGETS)[number];

export type References = Readonly<Record<string, ReferenceTarget>>;

/** The field an export writes for an id field: `parentId` becomes `parent`. */
export function refFieldOf(idField: string): string {
  return idField.endsWith('Id') ? idField.slice(0, -2) : idField;
}
