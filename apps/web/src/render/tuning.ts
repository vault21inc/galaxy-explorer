/**
 * Rendering tunables: every number that shapes how the 3D view looks or performs, in one place,
 * with its unit. Code elsewhere imports these instead of using inline numbers (AGENTS.md).
 *
 * Grouped by what they tune: the canvas, the camera, the sky, each view, and baking.
 */

// ---------------------------------------------------------------------------------------------
// Canvas (rendering.md §2–3)
// ---------------------------------------------------------------------------------------------

/** The color of empty space; matches the page background (ux.md §11). */
export const SPACE_COLOR = '#03050a';

/**
 * The quality settings (rendering.md §13), chosen per browser in the top bar's settings popover
 * (state/quality.ts). M2-T8 makes the frame-rate monitor step down one level when it stays low.
 *
 * - `dprRange`: the device pixel ratio range for the canvas, [min, max]. A Retina display has a
 *   ratio of 2, which means four times the pixels of ratio 1, and pixels are most of the GPU
 *   cost. Medium caps it at 1.5: text-sharp edges at about half the pixel cost (rendering.md
 *   §2, rule 2).
 * - `antialias`: multisample antialiasing smooths edges for a modest GPU cost. WebGL fixes it
 *   when the canvas is created, so a change applies on the next page load.
 * - `starPoints`: background stars in the galaxy view (M2-T2).
 * - `orbitTexturePx`: [width, height] of baked planet textures in the orbit view (M6).
 */
export const QUALITY_PRESETS = {
  low: { dprRange: [1, 1], antialias: false, starPoints: 8_000, orbitTexturePx: [1_024, 512] },
  medium: {
    dprRange: [1, 1.5],
    antialias: true,
    starPoints: 20_000,
    orbitTexturePx: [2_048, 1_024],
  },
  high: { dprRange: [1, 2], antialias: true, starPoints: 40_000, orbitTexturePx: [4_096, 2_048] },
} satisfies Record<string, QualityPreset>;

export interface QualityPreset {
  dprRange: [min: number, max: number];
  antialias: boolean;
  starPoints: number;
  orbitTexturePx: [width: number, height: number];
}

export type QualityLevel = keyof typeof QUALITY_PRESETS;

/** Lowest first, as the settings popover lists them. */
export const QUALITY_LEVELS = ['low', 'medium', 'high'] as const satisfies readonly QualityLevel[];

export const DEFAULT_QUALITY: QualityLevel = 'medium';

/**
 * While the camera moves, the pixel ratio drops to this fraction of its resting value
 * (R3F's `performance.min`, applied by drei's `<AdaptiveDpr>`), then returns when the camera
 * settles. Lighter while moving, crisp when still.
 */
export const MOVING_RESOLUTION_FACTOR = 0.5;

// ---------------------------------------------------------------------------------------------
// Camera (rendering.md §5, §12)
// ---------------------------------------------------------------------------------------------

/** Vertical field of view, in degrees. */
export const CAMERA_FOV_DEG = 45;

/**
 * The camera before any view sets its own (pages without a view, such as the universe list,
 * show only the sky). Near and far are clipping distances: nothing closer than `near` or
 * farther than `far` is drawn, and depth precision depends on far ÷ near (rendering.md §1,
 * concept 2). Each view replaces these (galaxy: GALAXY_NEAR_RADII and the rest below).
 */
export const CAMERA_NEAR = 0.1;
export const CAMERA_FAR = 5_000;

/** Where that camera starts, as a distance from the origin, in scene units. */
export const CAMERA_START_DISTANCE = 30;

/**
 * Easing for camera movement, in seconds: roughly how long the camera takes to catch up with
 * the input. `CAMERA_DRAGGING_SMOOTH_TIME_S` applies while a drag is in progress.
 */
export const CAMERA_SMOOTH_TIME_S = 0.2;
export const CAMERA_DRAGGING_SMOOTH_TIME_S = 0.1;

// ---------------------------------------------------------------------------------------------
// Sky (rendering.md §6): the distant starfield behind every view
// ---------------------------------------------------------------------------------------------

/** How many background stars. All of them are one draw call (rendering.md §1, concept 5). */
export const SKY_STAR_COUNT = 5_000;

/** On-screen size of each star, in CSS pixels, whatever the view. */
export const SKY_STAR_SIZE_PX = 2;

/** Dimmest star brightness, from 0 (black) to 1 (full). Brightness varies between this and 1. */
export const SKY_STAR_MIN_BRIGHTNESS = 0.12;

/** Seed for the star pattern, so it's identical on every load and in every screenshot. */
export const SKY_SEED = 40_000;

// ---------------------------------------------------------------------------------------------
// Galaxy view (rendering.md §5, §6). Distances in light-years, or in galaxy radii ("_RADII").
// ---------------------------------------------------------------------------------------------

/**
 * Where the camera starts: this many radii from the center, tilted this far from straight
 * down onto the disc. 2.2 radii frames the whole disc in a 45° field of view.
 */
export const GALAXY_START_DISTANCE_RADII = 2.2;
export const GALAXY_START_TILT_DEG = 50;

/** The closest and farthest the camera may get to its target (rendering.md §5). */
export const GALAXY_MIN_DISTANCE_LY = 20;
export const GALAXY_MAX_DISTANCE_RADII = 3;

/**
 * Near and far clipping distances. Far covers the far edge of the disc from the maximum
 * distance. Near is fixed for now; M2-T4 makes it follow the camera's distance to its target
 * (rendering.md §5) so depth precision holds when zoomed in close.
 */
export const GALAXY_NEAR_RADII = 1 / 5_000;
export const GALAXY_FAR_RADII = 6;

/**
 * How far the camera may tilt, in degrees from straight down (0) to straight up (180). Never
 * exactly 0 or 180: there, "up" is undefined and the camera would spin (rendering.md §5).
 */
export const POLAR_MIN_DEG = 5;
export const POLAR_MAX_DEG = 175;

/** The disc plane's half-width, in radii: a little wider than the galaxy so its edge fades out. */
export const GALAXY_DISC_EXTENT_RADII = 1.2;

/** The baked disc texture's width and height, in pixels (rendering.md §9). */
export const GALAXY_DISC_TEXTURE_PX = 2_048;

/** The disc's brightness when drawn; 1 adds the baked colors at full strength. */
export const GALAXY_DISC_INTENSITY = 0.8;

/**
 * How much of the disc's light is the smooth arm glow; the rest is mottled by noise, which
 * gives the arms their clumpy, star-forming look.
 */
export const GALAXY_DISC_NOISE_AMOUNT = 0.55;

/** Depth stars' on-screen size range, in CSS pixels. Capped so close stars never become blobs. */
export const GALAXY_STAR_MIN_PX = 1;
export const GALAXY_STAR_MAX_PX = 3;

/** A depth star's size in radii (about 100 ly in a 50,000 ly galaxy), varied ±50 %. */
export const GALAXY_STAR_SIZE_RADII = 0.002;

/** Dimmest depth-star brightness, and how far their colors lean toward white. */
export const GALAXY_STAR_MIN_BRIGHTNESS = 0.25;
export const GALAXY_STAR_WHITE_MIX = 0.45;

/**
 * The core glows: soft light over the bulge (rendering.md §6). Each has a radius in bulge radii
 * and a strength; their on-screen radius is capped at GALAXY_GLOW_MAX_PX, because a glow that
 * fills the screen costs a full screen of blended pixels (rendering.md §1, concept 7).
 */
export const GALAXY_GLOWS = [
  { radiusBulges: 0.7, intensity: 0.35 },
  { radiusBulges: 2.4, intensity: 0.1 },
] as const;
export const GALAXY_GLOW_MAX_PX = 480;

// ---------------------------------------------------------------------------------------------
// Baking (rendering.md §9)
// ---------------------------------------------------------------------------------------------

/** Baked textures kept on the GPU; the least recently used is disposed past this. */
export const BAKE_CACHE_SIZE = 48;

// ---------------------------------------------------------------------------------------------
// Objects in the galaxy view (rendering.md §6)
// ---------------------------------------------------------------------------------------------

/**
 * Every body stays between these on-screen heights, in CSS pixels, whatever the camera distance:
 * zoomed far out, a 120 ly system would be a fraction of a pixel, and close up it would fill
 * the screen. The shader and the CPU (test hooks now, picking in M2-T5) clamp the same way.
 */
export const GALAXY_BODY_MIN_PX = 8;
export const GALAXY_BODY_MAX_PX = 40;

/**
 * The color of anything hidden as a potential spoiler (ux.md §6): a neutral grey that reads as
 * "something is here" without telling what.
 */
export const REDACTION_COLOR = '#6b7280';

/**
 * Regions (nebulae, anomalies) are clouds of soft billboards (rendering.md §6). Each region gets
 * between REGION_BILLBOARDS_MIN and _MAX of them, more for denser regions.
 */
export const REGION_BILLBOARDS_MIN = 6;
export const REGION_BILLBOARDS_MAX = 20;

/** Each billboard's on-screen radius, in CSS pixels: never smaller or larger than these. */
export const REGION_BILLBOARD_MIN_PX = 3;
export const REGION_BILLBOARD_MAX_PX = 320;

/** How strongly one billboard shows; overlapping ones add up. */
export const REGION_BILLBOARD_OPACITY = 0.32;

/**
 * How each region type blends (rendering.md §6). Nebulae glow: their light adds to what's
 * behind. Anomalies (warp storms) are darker, tinted clouds drawn over it. `tint` multiplies
 * the region's color.
 */
export const REGION_STYLES: Record<string, { additive: boolean; tint: number }> = {
  nebula: { additive: true, tint: 1 },
  anomaly: { additive: false, tint: 0.55 },
};
export const DEFAULT_REGION_STYLE = { additive: true, tint: 1 };

/** The baked soft-noise sprite every region billboard uses, in pixels per side. */
export const REGION_SPRITE_PX = 256;
