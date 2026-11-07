/**
 * Rendering tunables: every number that shapes how the 3D view looks or performs, in one place,
 * with its unit. Code elsewhere imports these instead of using inline numbers (AGENTS.md).
 *
 * The M0 values drive the placeholder sky; the real views add theirs from M2 on.
 */

// ---------------------------------------------------------------------------------------------
// Canvas (rendering.md §2–3)
// ---------------------------------------------------------------------------------------------

/** The color of empty space; matches the page background (ux.md §11). */
export const SPACE_COLOR = '#03050a';

/**
 * Device pixel ratio range for the canvas: [min, max]. A Retina display has a ratio of 2, which
 * means four times the pixels of ratio 1, and pixels are most of the GPU cost. Capping at 1.5
 * keeps text-sharp edges at about half the pixel cost (rendering.md §2, rule 2).
 */
export const DPR_RANGE: [min: number, max: number] = [1, 1.5];

/**
 * While the camera moves, the pixel ratio drops to this fraction of its resting value
 * (R3F's `performance.min`, applied by drei's `<AdaptiveDpr>`), then returns when the camera
 * settles. Lighter while moving, crisp when still.
 */
export const MOVING_RESOLUTION_FACTOR = 0.5;

/** Multisample antialiasing: smooths edges for a modest GPU cost. "Low" quality turns it off. */
export const ANTIALIAS = true;

// ---------------------------------------------------------------------------------------------
// Camera (rendering.md §5, §12)
// ---------------------------------------------------------------------------------------------

/** Vertical field of view, in degrees. */
export const CAMERA_FOV_DEG = 45;

/**
 * Near and far clipping distances, in scene units. Nothing closer than `near` or farther than
 * `far` is drawn. Depth precision depends on far ÷ near, so keep the ratio as small as the view
 * allows (rendering.md §1, concept 2).
 */
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 5_000;

/** Where the camera starts, as a distance from the origin, in scene units. */
export const CAMERA_START_DISTANCE = 30;

/** How close and how far the camera may get from its target, in scene units. */
export const CAMERA_MIN_DISTANCE = 2;
export const CAMERA_MAX_DISTANCE = 400;

/**
 * Easing for camera movement, in seconds: roughly how long the camera takes to catch up with
 * the input. `CAMERA_DRAGGING_SMOOTH_TIME_S` applies while a drag is in progress.
 */
export const CAMERA_SMOOTH_TIME_S = 0.2;
export const CAMERA_DRAGGING_SMOOTH_TIME_S = 0.1;

// ---------------------------------------------------------------------------------------------
// Placeholder sky (M0 only; M2 replaces it with the baked galaxy background)
// ---------------------------------------------------------------------------------------------

/** How many background stars. All of them are one draw call (rendering.md §1, concept 5). */
export const SKY_STAR_COUNT = 5_000;

/**
 * Radius of the sphere the stars sit on, in scene units. It's far beyond the camera's maximum
 * distance, so stars stay in the background, and inside `CAMERA_FAR`, so they aren't clipped.
 */
export const SKY_RADIUS = 1_000;

/** On-screen size of each star, in CSS pixels, whatever its distance. */
export const SKY_STAR_SIZE_PX = 2;

/** Dimmest star brightness, from 0 (black) to 1 (full). Brightness varies between this and 1. */
export const SKY_STAR_MIN_BRIGHTNESS = 0.35;

/** Seed for the star pattern, so it's identical on every load and in every screenshot. */
export const SKY_SEED = 40_000;
