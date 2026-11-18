import { CONFIG_RESOURCES, fieldSchemaIn, unwrapField, type ConfigResource } from '@ge/domain';
import { useId, useState } from 'react';
import { useConfigList, useViewPayload } from '@/api/hooks.ts';
import { useReadOptions } from '@/api/read-options.ts';
import { parentChoices } from '@/editor/actions/group.ts';
import { editDescription, type FieldProps } from '../field-props.ts';
import { changesFor, valueAt } from '../field-path.ts';
import { inheritedValue } from '../inherited.ts';
import type { FormFieldDef } from '@ge/domain';
import { FieldRow, INPUT_CLASS } from './field-row.tsx';

type SelectFieldDef = Extract<FormFieldDef, { widget: 'select' }>;

/** The empty choice of a nullable reference. */
const NONE = '';

/**
 * A choice from fixed values (status), from a universe setting (subtypes, group types, event
 * categories), of a parent group (M4-T4), or of a sibling such as the star a planet orbits
 * (M5-T4), saved as soon as it changes. Nullable fields offer "None", or the source's own name
 * for it.
 */
export function SelectField({
  field,
  schema: recordSchema,
  record,
  universeId,
  title,
  subtypes,
  save,
  compact,
}: FieldProps<SelectFieldDef>) {
  const id = useId();
  const { options } = field;
  const resource =
    options.from === 'config' && (CONFIG_RESOURCES as readonly string[]).includes(options.resource)
      ? (options.resource as ConfigResource)
      : undefined;
  const items = useConfigList(resource ?? 'object_subtypes', resource ? universeId : undefined);
  // Parent groups come from the galaxy view already loaded for the group's map.
  const mapId = options.from === 'parentGroups' ? (record.mapId as string | undefined) : undefined;
  const readOptions = useReadOptions();
  const view = useViewPayload('galaxy', mapId, readOptions);
  // Siblings come from the parent system's view, which is open while its children are edited.
  const parentId =
    options.from === 'siblings'
      ? ((record.parentId as string | null | undefined) ?? undefined)
      : undefined;
  const parentView = useViewPayload('system', parentId, readOptions);
  const schema = fieldSchemaIn(recordSchema, field.path);
  const nullable = schema ? unwrapField(schema).nullable : false;
  const saved = valueAt(record, field.path);
  // A value the record doesn't set shows its default, dimmed (a planet's preset, M6-T2).
  const inherited = inheritedValue(record, field.path, subtypes);
  // Or the default the form names for it (a group's shape, D-53).
  const named = options.from === 'values' ? options.default : undefined;
  const fallback =
    saved === undefined ? (typeof inherited === 'string' ? inherited : named) : undefined;
  const [pending, setPending] = useState<string | null>(null);

  let choices: { value: string; label: string }[];
  if (options.from === 'values') {
    choices = options.values.map((value) => ({ value, label: options.labels?.[value] ?? value }));
  } else if (options.from === 'siblings') {
    choices = (parentView.data?.children ?? [])
      .filter((child) => child.baseType === options.baseType && child.id !== record.id)
      .map((child) => ({ value: child.id, label: child.namePlain }));
  } else if (options.from === 'parentGroups') {
    const groups = view.data?.groups ?? [];
    const below = descendantsOf(record.id, groups);
    choices = parentChoices(String(record.groupTypeId), groups, view.data?.groupTypes ?? [])
      .filter((group) => group.id !== record.id && !below.has(group.id))
      .map((group) => ({ value: group.id, label: group.namePlain }));
  } else {
    const match = options.matchField;
    const against = match === undefined ? undefined : valueAt(record, options.matchOn ?? match);
    choices = (items.data ?? [])
      .filter((item) => !match || (item as Record<string, unknown>)[match] === against)
      .map((item) => {
        const record = item as Record<string, unknown>;
        return {
          value: String(record.id),
          label: String(record.name ?? record.label ?? record.id),
        };
      });
  }

  return (
    <FieldRow
      label={field.label}
      htmlFor={id}
      hint={field.hint}
      inherited={fallback !== undefined && pending === null}
      compact={compact}
    >
      <select
        id={id}
        className={INPUT_CLASS}
        value={pending ?? (typeof saved === 'string' ? saved : (fallback ?? NONE))}
        onChange={(event) => {
          const value = event.currentTarget.value;
          setPending(value);
          void save(
            changesFor(record, field.path, value === NONE ? null : value),
            editDescription(title, field.label),
          ).finally(() => {
            setPending(null);
          });
        }}
      >
        {(nullable || (saved == null && fallback === undefined)) && (
          <option value={NONE}>{options.from === 'siblings' ? options.noneLabel : 'None'}</option>
        )}
        {choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

/** Every group nested inside this one, at any depth: none may become its parent. */
function descendantsOf(
  id: string,
  groups: readonly { id: string; parentGroupId: string | null }[],
): Set<string> {
  const found = new Set<string>();
  const visit = (parent: string) => {
    for (const group of groups) {
      if (group.parentGroupId === parent && !found.has(group.id)) {
        found.add(group.id);
        visit(group.id);
      }
    }
  };
  visit(id);
  return found;
}
