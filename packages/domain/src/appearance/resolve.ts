import type { HexColor } from '../colors.ts';
import { objectTypes, type BaseType } from '../registry/object-types.ts';
import type { ViewLevel } from '../registry/view-levels.ts';
import type { Appearance } from '../schemas/appearance.ts';

export interface ResolveAppearanceInput {
  baseType: BaseType;
  /** The subtype's `defaultAppearance`, if the object has a subtype. */
  subtypeDefaults?: Appearance | null;
  /** The object's own `appearance` overrides. */
  overrides?: Appearance | null;
  view: ViewLevel;
}

export interface ResolvedAppearance {
  /** The merged appearance; `color` is always set. */
  appearance: Appearance & { color: HexColor };
  /**
   * Displayed size in this view's unit: the type's default size × `scale[view]`. Null when the
   * type isn't drawn as a body in this view (regions, or a view the type has no size in).
   */
  size: number | null;
}

/**
 * How an object looks in a view (data-model §6). Three layers merge, later ones winning:
 * 1. the base type's defaults (`objectTypes`);
 * 2. the subtype's default appearance;
 * 3. the object's own overrides.
 *
 * Nested settings merge field by field, so an object can override only its atmosphere color
 * and keep the subtype's thickness. Lists (palettes) replace each other whole. The server and
 * the browser both run this, so live edit previews match what's saved.
 */
export function resolveAppearance({
  baseType,
  subtypeDefaults,
  overrides,
  view,
}: ResolveAppearanceInput): ResolvedAppearance {
  const type = objectTypes[baseType];
  const appearance = mergeLayers(
    type.defaultAppearance,
    subtypeDefaults,
    overrides,
  ) as Appearance & {
    color: HexColor;
  };
  const defaultSize: number | undefined = (type.size as Partial<Record<ViewLevel, number>>)[view];
  const scale = appearance.scale?.[view] ?? 1;
  return { appearance, size: defaultSize === undefined ? null : defaultSize * scale };
}

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function mergeLayers(...layers: (object | null | undefined)[]): PlainObject {
  let result: PlainObject = {};
  for (const layer of layers) if (layer) result = mergeTwo(result, layer as PlainObject);
  return result;
}

function mergeTwo(base: PlainObject, top: PlainObject): PlainObject {
  const result: PlainObject = { ...base };
  for (const [key, value] of Object.entries(top)) {
    if (value === undefined) continue;
    const current = result[key];
    result[key] = isPlainObject(current) && isPlainObject(value) ? mergeTwo(current, value) : value;
  }
  return result;
}
