import {
  PLANET_PRESETS,
  planetDefaults,
  resolveAppearance,
  type BaseType,
  type ConfigReadOf,
  type PlanetPresetName,
} from '@ge/domain';
import type { FormRecord } from './field-props.ts';
import { valueAt } from './field-path.ts';

/**
 * The value an appearance field falls back to when the object doesn't override it: the
 * subtype's default, then the base type's (data-model §6), then for a planet's look its
 * preset's (`planetDefaults`, M6-T2). Shown dimmed, with "reset to default" once overridden
 * (ux.md §5). Undefined for fields that inherit nothing.
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
  const value = valueAt(appearance, rest.join('.'));
  if (value !== undefined || rest[0] !== 'planet' || rest.length < 2) return value;
  // The preset the record uses, its own or inherited.
  const preset =
    valueAt(record, 'appearance.planet.preset') ?? valueAt(appearance, 'planet.preset');
  if (!isPreset(preset)) return undefined;
  return valueAt(planetDefaults(preset), rest.slice(1).join('.'));
}

function isPreset(value: unknown): value is PlanetPresetName {
  return typeof value === 'string' && (PLANET_PRESETS as readonly string[]).includes(value);
}
