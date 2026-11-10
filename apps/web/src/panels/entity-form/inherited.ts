import { resolveAppearance, type BaseType, type ConfigReadOf } from '@ge/domain';
import type { FormRecord } from './field-props.ts';
import { valueAt } from './field-path.ts';

/**
 * The value an appearance field falls back to when the object doesn't override it: the
 * subtype's default, then the base type's (data-model §6). Shown dimmed, with "reset to
 * default" once overridden (ux.md §5). Undefined for fields that inherit nothing.
 */
export function inheritedValue(
  record: FormRecord,
  path: string,
  subtypes: readonly ConfigReadOf<'object_subtypes'>[],
): unknown {
  const [top, ...rest] = path.split('.');
  const fields = record as FormRecord & { baseType?: BaseType; subtypeId?: string | null };
  if (top !== 'appearance' || !fields.baseType || rest.length === 0) return undefined;
  const subtype = subtypes.find((item) => item.id === fields.subtypeId);
  const { appearance } = resolveAppearance({
    baseType: fields.baseType,
    subtypeDefaults: subtype?.defaultAppearance ?? null,
    overrides: null,
    view: 'galaxy',
  });
  return valueAt(appearance, rest.join('.'));
}
