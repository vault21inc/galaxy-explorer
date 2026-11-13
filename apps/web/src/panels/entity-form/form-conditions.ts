import {
  isPlanetType,
  isRegionType,
  objectTypes,
  type BaseType,
  type ConfigReadOf,
  type FormCondition,
  type FormFieldDef,
} from '@ge/domain';
import type { FormRecord } from './field-props.ts';
import { valueAt } from './field-path.ts';
import { inheritedValue } from './inherited.ts';

/**
 * Whether a form field shows for a record (its `showWhen`, entity-forms.ts): the entity form's
 * fields, and the same appearance fields for a subtype's default look (M7-T2).
 */

/** What field conditions need beyond the record itself. */
export interface FormContext {
  subtypes: readonly ConfigReadOf<'object_subtypes'>[];
  /** The object's parent is a system. */
  inSystem: boolean;
}

/** Whether a field's `showWhen` conditions all hold (entity-forms.ts). */
export function shows(field: FormFieldDef, entity: FormRecord, context: FormContext): boolean {
  const { showWhen } = field;
  if (showWhen === undefined) return true;
  const conditions: readonly FormCondition[] =
    typeof showWhen === 'string' || !('length' in showWhen) ? [showWhen] : showWhen;
  return conditions.every((condition) => holds(condition, entity, context));
}

function holds(
  condition: FormCondition,
  entity: FormRecord,
  { subtypes, inSystem }: FormContext,
): boolean {
  const baseType = (entity as { baseType?: BaseType }).baseType;
  if (condition === 'explorableType') {
    return baseType !== undefined && objectTypes[baseType].explorableAs !== null;
  }
  if (condition === 'regionType') return baseType !== undefined && isRegionType(baseType);
  if (condition === 'systemChild') return inSystem;
  if (condition === 'planetType') return baseType !== undefined && isPlanetType(baseType);
  // A value the entity doesn't set falls back to its default, as the field itself shows it.
  const value = valueAt(entity, condition.path) ?? inheritedValue(entity, condition.path, subtypes);
  const matches = (values: readonly (string | boolean)[]) =>
    (typeof value === 'string' || typeof value === 'boolean') && values.includes(value);
  if ('notIn' in condition) return !matches(condition.notIn);
  return matches(condition.in);
}
