import {
  catmullRom,
  defaultRiftPath,
  type PlanePoint,
  type RegionAppearance,
  type RegionShape,
  type RimGap,
  type ViewObject,
} from '@ge/domain';
import { RIFT_CURVE_STEPS } from '../tuning.ts';

/**
 * A region's settings with every field filled in (M4-T6). The view payload's appearance is
 * already merged with the type's defaults on the server; these fallbacks only cover a payload
 * from before a field existed.
 */
export interface ResolvedRegion {
  shape: RegionShape;
  radius: number;
  density: number;
  color: string | undefined;
  innerRadius: number;
  rimColor: string | undefined;
  filaments: number;
  gaps: readonly RimGap[];
  texture: 'procedural' | 'upload';
  rotationDeg: number;
  path: readonly PlanePoint[] | undefined;
}

export function resolvedRegion(object: Pick<ViewObject, 'appearance'>): ResolvedRegion {
  const region: RegionAppearance = object.appearance.region ?? {};
  return {
    shape: region.shape ?? 'sphere',
    radius: region.radius ?? 1_000,
    density: region.density ?? 0.5,
    color: region.color ?? object.appearance.color,
    innerRadius: region.innerRadius ?? 0.45,
    rimColor: region.rimColor,
    filaments: region.filaments ?? 0.5,
    gaps: region.gaps ?? [],
    texture: region.texture ?? 'procedural',
    rotationDeg: region.rotationDeg ?? 0,
    path: region.path,
  };
}

/**
 * A rift's center line on the plane, in world coordinates: its points (relative to the object)
 * moved to the object's position, then smoothed into a Catmull-Rom curve. A rift without points
 * of its own is a straight band through its position (`defaultRiftPath`).
 */
export function riftCurve(
  object: Pick<ViewObject, 'position'>,
  region: Pick<ResolvedRegion, 'path' | 'radius'>,
): PlanePoint[] {
  const [x, , z] = object.position;
  const points = (region.path ?? defaultRiftPath(region.radius)).map(([px, pz]): PlanePoint => [
    x + px,
    z + pz,
  ]);
  return catmullRom(points, RIFT_CURVE_STEPS);
}
