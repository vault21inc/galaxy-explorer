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
 * Stepping down automatically (rendering.md §13): if the median frame rate stays below
 * QUALITY_FLOOR_FPS for QUALITY_WINDOW_MS of rendering, the quality drops one level. It never
 * steps up on its own; the reader can raise it again in the settings.
 */
export const QUALITY_FLOOR_FPS = 45;
export const QUALITY_WINDOW_MS = 2_000;

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
 * Clipping planes that follow the camera (rendering.md §5). Depth precision depends on
 * far ÷ near, so instead of one fixed pair for every zoom level, near is a fixed fraction of the
 * distance to the target and far reaches just past the galaxy:
 * - near = distance × GALAXY_NEAR_FRACTION, but at least GALAXY_MIN_NEAR_LY;
 * - far = distance + GALAXY_FAR_BEYOND_RADII × radius.
 * GALAXY_NEAR_RADII and GALAXY_FAR_RADII are the planes before the first camera update.
 */
export const GALAXY_NEAR_FRACTION = 1 / 1_000;
export const GALAXY_MIN_NEAR_LY = 0.01;
export const GALAXY_FAR_BEYOND_RADII = 3;
export const GALAXY_NEAR_RADII = 1 / 5_000;
export const GALAXY_FAR_RADII = 6;

/**
 * The camera's target (the point it orbits and zooms toward) stays within this box: the disc's
 * radius × 1.2 across, and this many radii above and below the plane. Zooming toward the cursor
 * moves the target toward the cursor, and without a floor it could sink through the disc until
 * the camera looked away from the galaxy.
 */
export const GALAXY_TARGET_HEIGHT_RADII = 0.05;

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

/**
 * The disc's live preview while a galaxy slider is dragged (M3-T8): a quarter of the full
 * size each way, so a re-bake costs a sixteenth.
 */
export const GALAXY_DISC_PREVIEW_PX = 512;

/** How long the preview waits after the last slider step before re-baking, in milliseconds. */
export const GALAXY_PREVIEW_DEBOUNCE_MS = 150;

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

// ---------------------------------------------------------------------------------------------
// Input (ux.md §3–4, rendering.md §12)
// ---------------------------------------------------------------------------------------------

/** A press that moves less than this, in CSS pixels, before release is a click, not a drag. */
export const CLICK_MAX_MOVE_PX = 4;

/** One "line" of wheel scrolling (Firefox with a mouse reports lines), in CSS pixels. */
export const WHEEL_LINE_PX = 16;

/** The largest zoom step one wheel event may cause, in pixels of wheel delta. */
export const WHEEL_MAX_PX = 200;

/**
 * Pinch-to-zoom scaling. Chrome and Firefox send a trackpad pinch as ctrl+wheel events whose
 * deltaY is about −100 × ln(scale change). Safari sends `gesturechange` events with the scale
 * itself. Both are turned into wheel pixels so a pinch zooms as fast as scrolling:
 * GESTURE_LOG_SCALE_TO_PX pixels per unit of ln(scale) (200 ≈ doubling the pinch halves the
 * distance), and PINCH_TO_WHEEL_PX = 200 ÷ 100 for the ctrl+wheel form.
 */
export const GESTURE_LOG_SCALE_TO_PX = 200;
export const PINCH_TO_WHEEL_PX = 2;

/** Arrow keys pan by this fraction of the camera's distance to its target per press. */
export const KEY_PAN_FRACTION = 0.1;

/** `+` and `−` move the camera this much closer or farther per press (1.25 = 25 %). */
export const KEY_ZOOM_FACTOR = 1.25;

// ---------------------------------------------------------------------------------------------
// Picking, hover and selection (rendering.md §6, §10)
// ---------------------------------------------------------------------------------------------

/** The picker's grid cell, in CSS pixels. */
export const PICK_CELL_PX = 64;

/**
 * The smallest pick circle, in CSS pixels: an 8 px body is still easy to hit with a 10 px
 * radius around its center.
 */
export const PICK_MIN_RADIUS_PX = 10;

/** Rings around hovered and selected objects: the gap outside the body and the line width, px. */
export const RING_GAP_PX = 4;
export const RING_WIDTH_PX = 1.5;

/** Ring colors: hover is a soft white; the selection uses the accent (ux.md §11). */
export const HOVER_RING_COLOR = '#ffffff';
export const HOVER_RING_OPACITY = 0.55;
export const SELECTION_RING_COLOR = '#4fd1ff';
export const SELECTION_RING_OPACITY = 1;

/**
 * Flying to an object (double-click, F) frames a sphere of at least this radius around it,
 * so a 120 ly system arrives with its neighborhood in view instead of filling the screen.
 */
export const FLY_TO_MIN_RADIUS_LY = 1_500;

// ---------------------------------------------------------------------------------------------
// Labels (rendering.md §11, ux.md §7)
// ---------------------------------------------------------------------------------------------

/** The most labels shown at once; also the size of the reusable element pool. */
export const LABEL_MAX = 200;

/** Space between a body's on-screen edge and its label, in CSS pixels. */
export const LABEL_GAP_PX = 4;

/** Label typography. The canvas measures text with the same font, so widths match the DOM. */
export const LABEL_FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
export const OBJECT_LABEL_FONT_PX = 12;
export const OBJECT_LABEL_HEIGHT_PX = 16;
export const GROUP_LABEL_FONT_PX = 11;
export const GROUP_LABEL_HEIGHT_PX = 15;
/** Group labels are uppercase with this letter spacing, in em (ux.md §11). */
export const GROUP_LABEL_LETTER_SPACING_EM = 0.08;
/** Object labels are white at this opacity (rendering.md §11). */
export const OBJECT_LABEL_OPACITY = 0.85;
