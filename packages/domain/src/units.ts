/**
 * Numbers named after their unit (data-model §5), so a signature says what it expects:
 * `radiusSu: Su`. They're plain aliases for `number`: each view has its own frame and unit, and
 * nothing converts between frames, so no conversion helpers exist.
 */

/** Light-years: the galaxy frame. */
export type Ly = number;
/** System units: the schematic system frame, roughly astronomical units. */
export type Su = number;
/** Body radii: the orbit frame, where the globe's radius is 1. */
export type Radii = number;
/** Degrees: latitude and longitude on a surface, rotations and tilts. */
export type Deg = number;
/** CSS pixels on screen. */
export type Px = number;
