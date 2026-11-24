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
 * While a timer draws frames on purpose (ambient motion, 30 a second), a frame up to this
 * many times its interval came on time, and isn't counted as slow (frame-rate-guard.ts).
 */
export const QUALITY_PACED_SLACK = 1.25;

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

/**
 * How long the picture takes to slide when the details panel opens over the map or closes, in
 * milliseconds (rendering.md §12, "The view shift"). The details sheet takes the same time to
 * move between its heights (`SHEET_MOVE_MS` in components/ui/sheet-drag.ts), so the two arrive
 * together.
 */
export const VIEW_SHIFT_MS = 200;

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
/**
 * Appearance edits re-bake a planet this long after the last change (rendering.md §9): sliders
 * feel live without baking on every tick of a drag.
 */
export const PLANET_BAKE_DEBOUNCE_MS = 150;
/** Uploaded planet maps kept loaded (M6-T2); the oldest is disposed past this. */
export const UPLOADED_SURFACES_KEPT = 16;

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

// ---------------------------------------------------------------------------------------------
// A look per kind of body (D-28, D-29, M4-T8; rendering.md §6)
// ---------------------------------------------------------------------------------------------

/**
 * A system's glyph (its star, rings and planet dots) spans this many times the system's radius,
 * since the rings reach well beyond the star. Picking, selection rings and labels keep using
 * the radius itself, so they fit the star as they fit the old sphere.
 */
export const SYSTEM_GLYPH_EXTENT = 2.4;

/** The star at a glyph's center stays between these on-screen radii, in CSS pixels. */
export const SYSTEM_STAR_MIN_PX = 4;
export const SYSTEM_STAR_MAX_PX = 20;

/** Planet dots a glyph shows at most, one per ring (D-28). */
export const SYSTEM_GLYPH_MAX_PLANETS = 6;

/** Each cell of the system glyph atlas, in pixels: 8 × 4 cells (planets 0–7 × stars 1–3). */
export const SYSTEM_GLYPH_CELL_PX = 128;

/**
 * Black holes may grow larger on screen than other bodies, so their lensed disc can be seen
 * (D-28): an on-screen radius between these, in CSS pixels. The quad spans the disc's full
 * width, BLACK_HOLE_EXTENT times the object's radius.
 */
export const BLACK_HOLE_MIN_PX = 6;
export const BLACK_HOLE_MAX_PX = 48;
export const BLACK_HOLE_EXTENT = 2;

/** Each of the black hole atlas's four viewing elevations (0°, 30°, 60°, 90°), in pixels. */
export const BLACK_HOLE_CELL_PX = 256;

/** Station and marker icons: on-screen radius in CSS pixels, and atlas cell size. */
export const ICON_MIN_PX = 6;
export const ICON_MAX_PX = 14;
export const ICON_CELL_PX = 128;

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

/**
 * Two taps on the same object within this long, in milliseconds, are a double-tap: they enter
 * it, as a double-click does (ux.md §3). Touch browsers don't all send `dblclick` (WebKit
 * doesn't), so the app counts taps itself (input/double-tap.ts). 300 ms is about what phones
 * use for their own double-tap.
 */
export const DOUBLE_TAP_MS = 300;
/** How far apart the two taps may land, in CSS pixels: a fingertip is never quite still. */
export const DOUBLE_TAP_SLOP_PX = 24;

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
/**
 * The same for a finger (pointerType "touch"): half of a 44 px target, the smallest Apple and
 * Google advise for touch. The nearest object within reach still wins, so close neighbours can
 * still be told apart. It reaches at most one grid cell further (PICK_CELL_PX is larger).
 */
export const PICK_MIN_RADIUS_TOUCH_PX = 22;
/** An object label is a pick target this many CSS pixels beyond its text's box on every side. */
export const LABEL_HIT_PADDING_PX = 3;
/** The same for a finger: a 16 px label line becomes a 36 px target. */
export const LABEL_HIT_PADDING_TOUCH_PX = 10;
/**
 * Where an object's label and another object overlap under the pointer, the object wins when
 * its pick circle is at most this radius in CSS pixels (a dot, a small planet), and the label
 * wins over anything wider: a belt's band, a rift, a route, a large region (picking.ts).
 */
export const LABEL_OVER_AREA_PX = 30;

/** Rings around hovered and selected objects: the gap outside the body and the line width, px. */
export const RING_GAP_PX = 4;
export const RING_WIDTH_PX = 1.5;

/** Ring colors: hover is a soft white; the selection uses the accent (ux.md §11). */
export const HOVER_RING_COLOR = '#ffffff';
export const HOVER_RING_OPACITY = 0.55;
export const SELECTION_RING_COLOR = '#4fd1ff';
export const SELECTION_RING_OPACITY = 1;
/**
 * The members of a selected group get a ring in the group's color at this opacity (M4-T4):
 * fainter than a selected object's, so the group reads as the selection.
 */
export const MEMBER_RING_OPACITY = 0.7;

/**
 * Flying to something in the galaxy view (double-click, F, Enter, a search result) frames a
 * sphere of at least this radius around it, in light-years: about what the camera sees at its
 * closest (GALAXY_MIN_DISTANCE_LY × sin(CAMERA_FOV_DEG / 2) ≈ 7.7 ly), so no frame asks for
 * a distance the camera can't reach.
 */
export const FLY_TO_MIN_RADIUS_LY = 8;
/**
 * Flying to one object frames its neighborhood (D-61): a sphere out to this many of its
 * nearest neighbors, so it arrives among them at whatever the map's spacing is there. Eight
 * around the Sun is 11.5 ly (out to Procyon); around a lone sector capital it may be 800 ly.
 */
export const FLY_TO_NEIGHBOR_COUNT = 8;
/**
 * A neighborhood ends at a gap: once this many neighbors are in, it stops before one more than
 * FLY_TO_NEIGHBOR_GAP times farther than the last. A cluster of five with nothing else for
 * thousands of light-years is framed as those five, not out to the eighth across the gap.
 */
export const FLY_TO_NEIGHBOR_MIN_COUNT = 3;
export const FLY_TO_NEIGHBOR_GAP = 4;
/**
 * That sphere is this much wider than the distance to the farthest of those neighbors, so it
 * and its label sit inside the frame and not on its edge.
 */
export const FLY_TO_NEIGHBORHOOD_PADDING = 1.25;
/**
 * The widest neighborhood framed, in light-years, for an object with nothing near it: enough
 * to see where it is, as every fly-to framed before D-61.
 */
export const FLY_TO_MAX_NEIGHBORHOOD_LY = 1_500;
/**
 * How long a fly asked for by name (a search result) waits for its target to be drawn, in
 * milliseconds. Past this it's dropped: a group on a hidden layer never is, and the camera
 * mustn't leap there minutes later when the reader turns the layer on.
 */
export const FLY_REQUEST_WAIT_MS = 5_000;

// ---------------------------------------------------------------------------------------------
// Labels (rendering.md §11, ux.md §7)
// ---------------------------------------------------------------------------------------------

/** The most labels shown at once; also the size of the reusable element pool. */
export const LABEL_MAX = 200;

/** Space between a body's on-screen edge and its label, in CSS pixels. */
export const LABEL_GAP_PX = 4;
/**
 * On a phone (the slim tier), the clear space every placed label keeps around it, in CSS
 * pixels, so fewer names crowd the small screen: a label that would come closer than this to
 * one already placed is left out (solve-labels.ts). The font doesn't change.
 */
export const LABEL_MARGIN_SLIM_PX = 6;

/** Label typography. The canvas measures text with the same font, so widths match the DOM. */
export const LABEL_FONT_FAMILY =
  "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";
export const OBJECT_LABEL_FONT_PX = 12;
export const OBJECT_LABEL_HEIGHT_PX = 16;
export const GROUP_LABEL_FONT_PX = 11;
export const GROUP_LABEL_HEIGHT_PX = 15;
/** Group labels are uppercase with this letter spacing, in em (ux.md §11). */
export const GROUP_LABEL_LETTER_SPACING_EM = 0.08;
/**
 * Object labels are a soft white (rendering.md §11). Opaque, not white at partial opacity: the
 * outline below is painted under the text, and a see-through fill would let it grey the glyphs.
 */
export const OBJECT_LABEL_COLOR = '#e2e4e9';
/**
 * Every label's dark outline, so it reads over the bright core and dense star fields: a stroke
 * this wide, painted under the text (`paint-order: stroke fill`), so half of it shows outside
 * each glyph, plus a soft shadow around that.
 */
export const LABEL_OUTLINE_PX = 3;
export const LABEL_OUTLINE_COLOR = 'rgb(0 0 0 / 0.85)';
export const LABEL_SHADOW = '0 0 4px rgb(0 0 0 / 0.9), 0 0 1px rgb(0 0 0)';

// ---- group outlines (rendering.md §6, M4-T3) --------------------------------------------------

/**
 * How far an outline stays from its members, as a share of the galaxy's radius, so it reads
 * the same on a small map and a large one: 2% is 1,000 ly in a 50,000 ly galaxy.
 */
export const GROUP_OUTLINE_PADDING_SHARE = 0.02;
/**
 * Extra padding per nesting level below a group, as a share of the radius, so a sector's
 * outline clearly encloses its sub-sectors' outlines: 750 ly more per level at 50,000 ly.
 */
export const GROUP_OUTLINE_NESTING_SHARE = 0.015;
/**
 * Degrees between the points of a ring group's circles (D-53). A circle 50,000 ly across drawn
 * with a hull's 15° steps shows its corners; 2° is 180 points a circle, two circles a ring,
 * which still adds only vertices to the merged batches, not draw calls.
 */
export const GROUP_RING_STEP_DEG = 2;
/**
 * Where a ring group's label sits on its band when the group doesn't say: degrees around the
 * centre from +x toward +z. −90 is toward −z, straight above the centre in the usual top-down
 * view, so concentric rings label one above the other like contour lines on a map.
 */
export const GROUP_RING_LABEL_DEG = -90;
/** A group's line width in CSS pixels when its style doesn't set one (GroupStyle). */
export const GROUP_LINE_WIDTH_PX = 2;
/** A group's fill opacity when its style doesn't set one: barely there (ux.md §11). */
export const GROUP_FILL_OPACITY = 0.06;
/** Dashed outlines: dash and gap length in CSS pixels, at the camera's target distance. */
export const GROUP_DASH_PX = 10;
export const GROUP_GAP_PX = 6;
/** Outlines and fills are flat overlays: drawn after the disc and glow, before bodies. */
export const GROUP_FILL_RENDER_ORDER = 2.5;
export const GROUP_LINE_RENDER_ORDER = 3.5;

// ---- routes (rendering.md §6, M4-T7) ----------------------------------------------------------

/** A route's look when its style doesn't set one (RouteStyle): a warm gold, 2 px, solid. */
export const ROUTE_COLOR = '#d9b45a';
export const ROUTE_LINE_WIDTH_PX = 2;
/** Dashed routes: dash and gap length in CSS pixels, at the camera's target distance. */
export const ROUTE_DASH_PX = 8;
export const ROUTE_GAP_PX = 5;
/** Routes are drawn over group outlines and under bodies, so a line never hides a system. */
export const ROUTE_LINE_RENDER_ORDER = 3.75;
/** How far from a route's line a click still picks it, in CSS pixels on either side. */
export const ROUTE_PICK_HALF_WIDTH_PX = 6;
/**
 * A route beats a region (0) but not a body (1) under the pointer: near a system the click is
 * the system's, and over a nebula a click on the line is the route's.
 */
export const ROUTE_PICK_PRIORITY = 0.5;
/** The Route tool's line in progress (M4-T7): white, a little wider than a route. */
export const ROUTE_DRAFT_COLOR = '#ffffff';
export const ROUTE_DRAFT_WIDTH_PX = 2.5;

// ---- region shapes (rendering.md §6, M4-T6, D-25) --------------------------------------------

/**
 * A storm's few billboards around its rim, for depth when the camera tilts: the flat disc alone
 * would vanish edge-on.
 */
export const STORM_BILLBOARDS = 8;
/** Each storm's top-down texture, baked once (rendering.md §9), in pixels a side. */
export const STORM_TEXTURE_PX = 256;
/** The smallest on-screen radius of a storm disc, in CSS pixels, so a far storm stays visible. */
export const STORM_DISC_MIN_PX = 10;
/** At most this many storms get a texture layer; more are drawn with the first layer. */
export const STORM_MAX_LAYERS = 64;
/** How bright a storm disc is drawn: its baked alpha times this. */
export const STORM_DISC_OPACITY = 0.9;

/** Curve segments per span between two rift points (Catmull-Rom, @ge/domain geo/rift.ts). */
export const RIFT_CURVE_STEPS = 12;
/** Billboards along a rift: one per this many half-widths of its length, within these limits. */
export const RIFT_BILLBOARD_SPACING_RADII = 1.2;
export const RIFT_BILLBOARDS_MIN = 6;
export const RIFT_BILLBOARDS_MAX = 60;
/** The flat band under a rift's billboards: its peak opacity across the middle. */
export const RIFT_RIBBON_OPACITY = 0.45;

// ---------------------------------------------------------------------------------------------
// Galaxy view: arriving from a system without a saved pose (M5-T1)
// ---------------------------------------------------------------------------------------------

// Leaving a system that was opened from a link has no saved galaxy pose to return to, so the
// galaxy camera looks at that system at the start tilt, framing its neighborhood as flying to
// it does (FLY_TO_NEIGHBOR_COUNT above, D-61): close enough to see its neighbors.

// ---------------------------------------------------------------------------------------------
// System view camera (rendering.md §5, §7). Distances in system units (su, about an AU), or in
// the system's extent ("_EXTENTS"): the distance from its center to its farthest child.
// ---------------------------------------------------------------------------------------------

/** An empty or tiny system is framed as if it reached this far. */
export const SYSTEM_MIN_EXTENT_SU = 4;
/**
 * Moons and stations beside their planets in the system view (system/satellites.ts): this
 * many times their orbit-view distance, counted in the planet's system-view radii.
 */
export const SYSTEM_SATELLITE_SPREAD = 1;
/** Where the camera starts: this many extents from the center, tilted like the galaxy view. */
export const SYSTEM_START_DISTANCE_EXTENTS = 1.6;
export const SYSTEM_START_TILT_DEG = 55;
/** The closest the camera may get to its target. M5-T2 replaces it with the target's stop distance. */
export const SYSTEM_MIN_DISTANCE_SU = 0.2;
/**
 * The farthest the camera may get: zooming out past this exits to the parent view (rendering.md
 * §4–5, "exit beyond 3 × the system's extent"; the push that triggers it arrives in M5-T2).
 */
export const SYSTEM_EXIT_EXTENTS = 3;
/**
 * Fixed clipping planes (rendering.md §5). A system is small enough for one pair: far ÷ near is
 * 10⁶, well within a 24-bit depth buffer at these distances.
 */
export const SYSTEM_NEAR_SU = 0.01;
export const SYSTEM_FAR_SU = 10_000;
/** The target stays within this many extents of the center, and this close to the plane. */
export const SYSTEM_TARGET_EXTENTS = 1.2;
// Looser than the galaxy's: zooming toward a planet off the middle of the screen puts the
// camera's target at the planet's depth, a little off the plane (zoom-gate.ts).
export const SYSTEM_TARGET_HEIGHT_EXTENTS = 0.5;
/** Flying to an object (F, double-click) frames at least this radius around it. */
export const SYSTEM_FLY_TO_MIN_RADIUS_SU = 0.6;
/** Leaving a planet's orbit view without a saved pose: look at it from this many extents. */
export const SYSTEM_FOCUS_DISTANCE_EXTENTS = 0.35;

// ---------------------------------------------------------------------------------------------
// Orbit view (rendering.md §5, §8, M6-T3). Distances in body radii: the globe's radius is 1.
// ---------------------------------------------------------------------------------------------

/** The closest the camera may get to the globe's center: just above its surface. */
export const ORBIT_MIN_DISTANCE_RADII = 1.15;
/** Zooming out past this leaves the orbit view for the one above it. */
export const ORBIT_EXIT_RADII = 8;
/** Where the camera starts: at least this far out, so the whole globe is in view… */
export const ORBIT_START_DISTANCE_RADII = 3.2;
/** …and this many times the reach of its farthest moon or station, so they're in view too. */
export const ORBIT_FRAME_EXTENTS = 1.9;
/** With moons that far out, zooming out leaves the view this many times the start distance. */
export const ORBIT_EXIT_BEYOND_START = 1.4;
/**
 * How far round from the sunlit side the camera starts, in degrees about the vertical: 0 looks
 * straight at the day side (flat, no shading), 90 at the line between day and night. Between,
 * the globe reads as round, with some night side for its lights.
 */
export const ORBIT_START_FROM_SUN_DEG = 70;
/** And how far above the equator it starts, in degrees. */
export const ORBIT_START_ELEVATION_DEG = 28;
/** Fixed clipping planes, in radii: far ÷ near is 10⁵, easy for a 24-bit depth buffer. */
export const ORBIT_NEAR_RADII = 0.01;
export const ORBIT_FAR_RADII = 1_000;
/** Flying to a moon (F, double-click) frames at least this radius around it. */
export const ORBIT_FLY_TO_MIN_RADIUS = 0.25;
/** Leaving a moon's view without a saved pose: look at it from this many radii away. */
export const ORBIT_FOCUS_DISTANCE_RADII = 1.5;
/**
 * Where the light comes from for a body outside any system (a rogue planet), as a direction
 * from the body: up and to one side, so the globe is half lit and half in shadow.
 */
export const ORBIT_DEFAULT_SUN_DIRECTION = [0.8, 0.3, 0.52] as const;
/** The default light's color, linear RGB: a faint, cool glow from the galaxy, not a sun. */
export const ORBIT_DEFAULT_SUN_COLOR = [0.55, 0.6, 0.75] as const;

/** Sphere segments around and pole to pole: the globe, its clouds, its atmosphere. */
export const GLOBE_SEGMENTS = [128, 64] as const;
export const GLOBE_CLOUD_SEGMENTS = [96, 48] as const;
export const GLOBE_ATMOSPHERE_SEGMENTS = [64, 32] as const;
export const GLOBE_RING_SEGMENTS = 160;
/** Light on the globe's night side: very little, so it reads as night and its lights stand out. */
export const GLOBE_AMBIENT = 0.012;
/**
 * Softens the line between day and night (the terminator): sunlight fades in from this far past
 * it, as a cosine (globe-shaders.ts `sunlit`), instead of starting dead where the sun sets.
 * Real terminators are soft too: the sun is a disc, not a point, and air scatters its light.
 */
export const GLOBE_TERMINATOR_WRAP = 0.15;
/** The same exposure curve as the system view's planets (SYSTEM_PLANET_EXPOSURE). */
export const GLOBE_EXPOSURE = 2;
/**
 * Sunlight glinting off oceans: how tight the highlight is (a Blinn-Phong exponent: higher is a
 * smaller, sharper glint) and how bright.
 */
export const GLOBE_SPECULAR_POWER = 60;
export const GLOBE_SPECULAR_STRENGTH = 0.6;
/**
 * Night lights fade in across the line between day and night: fully on where the sun is this
 * far below the horizon (as the cosine of the angle), off where it's this far above.
 */
export const GLOBE_NIGHT_FULL = -0.12;
export const GLOBE_NIGHT_NONE = 0.08;
/** How bright the atmosphere's haze is over the globe's lit edge, in linear light. */
export const GLOBE_HAZE_STRENGTH = 0.25;
/** How bright night lights are before their intensity setting, in linear light. */
export const GLOBE_LIGHTS_GAIN = 1;
/** Clouds float this far out, in radii, and cover at most this much. */
export const GLOBE_CLOUD_RADIUS = 1.01;
export const GLOBE_CLOUD_OPACITY = 0.92;
/** Ambient motion (rendering.md §8): at most this many frames a second while it runs. */
export const AMBIENT_MOTION_FPS = 30;
/** The planet turns this many degrees a second, and its clouds this many more. */
export const GLOBE_SPIN_DEG_PER_S = 4;
export const GLOBE_CLOUD_DRIFT_DEG_PER_S = 1.5;

// ---------------------------------------------------------------------------------------------
// Pins on the globe (rendering.md §8, M6-T4)
// ---------------------------------------------------------------------------------------------

/** The icon atlas: a square canvas of this many pixels, in cells of this many (16 × 16). */
export const ICON_ATLAS_PX = 1_024;
export const ICON_ATLAS_CELL_PX = 64;
/** A pin's on-screen radius in CSS pixels, at any distance. */
export const PIN_RADIUS_PX = 12;
/** Pins sit this far out from the globe's center, in radii: just above its surface. */
export const PIN_LIFT_RADII = 1.005;
/**
 * A pin is drawn this many radii nearer the camera than its point, so the globe's curve doesn't
 * cut off the bottom of a pin standing near the edge of the visible side.
 */
export const PIN_TOWARD_CAMERA_RADII = 0.02;
/**
 * Pins located "at the body" rather than at a point on it (an event aboard a moon) stand in a
 * ring at this latitude, spread evenly around it, so each can be seen and clicked.
 */
export const PIN_AT_BODY_LAT_DEG = 70;
/** Pins at the same point fan out this many degrees of arc apart (pin-items.ts). */
export const PIN_FAN_DEG = 4;
/** Icons for pins without a category of their own: places, and events without one. */
export const PIN_PLACE_ICON = 'lucide:landmark';
export const PIN_EVENT_ICON = 'lucide:sparkle';
/** And their colors. */
export const PIN_PLACE_COLOR = '#b9c4d0';
export const PIN_EVENT_COLOR = '#e8eaed';

// ---------------------------------------------------------------------------------------------
// Event markers outside globes (rendering.md §8, M6-T5)
// ---------------------------------------------------------------------------------------------

/** An event marker's on-screen radius in CSS pixels: a little smaller than a globe's pins. */
export const MARKER_RADIUS_PX = 9;
/**
 * A marker at an object (a system, a nebula) is drawn this many CSS pixels right of and above
 * the object's center, beside its glyph rather than over it; more at the same object step right
 * by MARKER_FAN_PX each.
 */
export const MARKER_BESIDE_PX = 16;
export const MARKER_FAN_PX = 20;

// ---------------------------------------------------------------------------------------------
// Moving between views (rendering.md §4, ux.md §9)
// ---------------------------------------------------------------------------------------------

/**
 * Entering or leaving a view: the camera flies toward the object (or away, leaving) for this
 * long, the screen fades to black, the views swap behind the black, and the screen fades back
 * while the new camera eases into place.
 */
// Together, with the swap (~35 ms measured), within the 700 ms transition budget (rendering.md
// §2, M5-T5). The plan's first numbers (350 + 150 + 300 ms) added up to more than the budget.
export const VIEW_FLY_MS = 260;
export const VIEW_FADE_OUT_MS = 120;
export const VIEW_FADE_IN_MS = 220;
/** With `prefers-reduced-motion`, no camera moves: one quick fade out and back in instead. */
export const VIEW_REDUCED_FADE_MS = 100;
/**
 * The fly toward an object ends this many of its drawn radii away from it: close enough to feel
 * like diving in, never inside it.
 */
export const VIEW_FLY_END_RADII = 3;
/** Leaving, the camera flies out to this many times its distance before the fade. */
export const VIEW_FLY_OUT_FACTOR = 2;
/**
 * Where the new view's camera starts before easing to its resting pose: entering, this many
 * times farther from its target (arriving from afar); leaving, this fraction of the distance
 * (pulling back out of the view just left).
 */
export const VIEW_ENTER_START_FACTOR = 1.8;
export const VIEW_EXIT_START_FACTOR = 0.45;
/**
 * The swap waits at most this long for the new view's data and camera before fading back in,
 * so a slow request shows its loading panel instead of a black screen.
 */
export const VIEW_READY_TIMEOUT_MS = 2_000;

// ---------------------------------------------------------------------------------------------
// Zooming into and out of views (rendering.md §4, M5-T2). Distances are multiples of the zoom
// target's radius as its renderer draws it (its `size` in the view's unit), keyed by the view
// the target is seen in.
// ---------------------------------------------------------------------------------------------

/**
 * Zooming toward an object that opens a view stops this many of its radii away; pushing on
 * past that enters it. In the galaxy view a 120 ly system enters from 1,440 ly, where its glyph
 * has reached its largest on-screen size.
 */
export const ENTER_DISTANCE_RADII = { galaxy: 12, system: 8, orbit: 8 } as const;
/** Zooming toward an object that opens no view stops this many of its radii away. */
export const STOP_DISTANCE_RADII = { galaxy: 6, system: 3, orbit: 3 } as const;
/**
 * How much more zoom input, in wheel pixels, it takes past the enter or exit distance to change
 * view: the hysteresis that keeps a trackpad flick from jumping views. A mouse wheel notch is
 * about 100 px, so this is a notch and a bit; a trackpad needs a short deliberate push.
 */
export const ENTER_PUSH_PX = 120;
export const EXIT_PUSH_PX = 120;
/** The push fades if no zoom input arrives for this long, and the progress ring disappears. */
export const PUSH_RESET_MS = 500;
/** "At" a distance limit means within this fraction of it, since the camera eases into it. */
export const DISTANCE_LIMIT_SLACK = 0.03;
/**
 * The momentum guard: wheel input is ignored for this long after a change of view starts, so
 * trackpad inertia can't carry into the next view (rendering.md §4).
 */
export const MOMENTUM_GUARD_MS = 400;
/**
 * And beyond that, a stream of wheel events that was under way when the change started stays
 * ignored until it pauses for this long: inertia arrives every frame or so until it has
 * decayed, while a reader starting a new scroll has lifted their fingers first.
 */
export const WHEEL_STREAM_GAP_MS = 150;
/** The progress ring: this many CSS pixels outside the target's drawn radius, and its stroke. */
export const PUSH_RING_GAP_PX = 10;
export const PUSH_RING_MIN_RADIUS_PX = 24;
export const PUSH_RING_STROKE_PX = 3;
/** Leaving a view by zooming out, the ring is drawn around the middle of the screen. */
export const EXIT_RING_RADIUS_PX = 48;

// ---------------------------------------------------------------------------------------------
// System view look (rendering.md §7, M5-T3). Sizes in system units (su) unless "_PX".
// ---------------------------------------------------------------------------------------------

/**
 * Stars are spheres at least this many CSS pixels in radius, so a star seen from far out stays
 * a visible disc; up close they're their true size (no upper limit to speak of).
 */
export const STAR_BODY_MIN_PX = 6;
export const STAR_BODY_MAX_PX = 100_000;
/** Icosphere subdivisions for stars: 3 gives 1,280 triangles, round even filling the screen. */
export const STAR_SPHERE_DETAIL = 3;
/**
 * The star surface's granulation (rendering.md §9): a cell pattern baked once into this many
 * pixels across (and half as many tall), with about this many cells around the equator. It
 * brightens and darkens the surface by up to ±STAR_GRANULATION_CONTRAST.
 */
export const STAR_GRANULATION_PX = 512;
export const STAR_GRANULATION_CELLS = 110;
export const STAR_GRANULATION_CONTRAST = 0.1;
/**
 * Limb darkening: a star's edge is dimmer than its middle, because we see shallower, cooler
 * layers there. Brightness at the edge, from 0 (black) to 1 (no darkening).
 */
export const STAR_LIMB_BRIGHTNESS = 0.55;
/**
 * The glow around a star: a camera-facing disc this many star radii across times the star's
 * `glow` (appearance.star.glow, 1 by default), at least STAR_GLOW_MIN_PX in radius, whose
 * brightness falls off smoothly to nothing at its edge.
 */
export const STAR_GLOW_RADII = 3;
export const STAR_GLOW_MIN_PX = 26;
export const STAR_GLOW_INTENSITY = 0.55;
/** Stars that light the system's bodies, the largest first (D-29); more are drawn but unlit. */
export const SYSTEM_MAX_LIGHTS = 3;
/** Light on every body's night side, so its shape still reads against black space. */
export const SYSTEM_AMBIENT = 0.07;

/**
 * Planets' brightness in the system view (M6-T2). Lit light goes through an exposure curve,
 * 1 − e^(−exposure × light): nearly a plain ×exposure gain for dim surfaces (an ocean world),
 * easing toward white instead of clipping for bright ones (ice, cloud tops). Real surface
 * colors are dark (Earth reflects about 30 % of sunlight), and the curve is what a camera's
 * exposure does to show them.
 */
export const SYSTEM_PLANET_EXPOSURE = 2;
/** Light on a planet's night side: more than SYSTEM_AMBIENT, since surfaces are dark. */
export const SYSTEM_PLANET_AMBIENT = 0.12;

/** Planets are at least this many CSS pixels in radius, so they never vanish when zoomed out. */
export const SYSTEM_PLANET_MIN_PX = 4;
export const SYSTEM_PLANET_MAX_PX = 100_000;
/** A planet's sphere (rendering.md §7): 32 segments around, 16 from pole to pole. */
export const PLANET_SEGMENTS = 32;
/**
 * The system view's planet textures (M6-T2): 256 × 128 texels, 2:1 like every map of a globe
 * (360° around, 180° from pole to pole). A planet there covers at most a few hundred pixels,
 * so more would never be seen; the orbit view bakes its own, larger ones.
 */
export const SYSTEM_PLANET_TEXTURE_PX = { width: 256, height: 128 } as const;
/**
 * Layers the system view's planet stack starts with (planet-texture-array.ts): 16 planets'
 * surfaces, about 2.8 MB with mipmaps. A system with more grows it once.
 */
export const SYSTEM_PLANET_INITIAL_LAYERS = 16;
export const PLANET_RINGS_SEGMENTS = 96;
/** Planet rings without their own color and opacity use these. */
export const PLANET_RINGS_COLOR = '#d8c9a8';
export const PLANET_RINGS_OPACITY = 0.6;
/** And rings without their own span run from and to these many planet radii. */
export const PLANET_RINGS_INNER_RADII = 1.4;
export const PLANET_RINGS_OUTER_RADII = 2.2;

/**
 * Orbit rings (rendering.md §7): a circle for each body around the system's center, through
 * the body, this many segments round, as crisp thin lines in a dim color. A selected body's
 * ring is drawn in the selection color.
 */
export const ORBIT_RING_SEGMENTS = 128;
export const ORBIT_RING_COLOR = '#2f4258';
export const ORBIT_RING_SELECTED_COLOR = '#4fd1ff';
export const ORBIT_RING_WIDTH_PX = 1;

/**
 * Asteroid belts (rendering.md §7): seeded rocks in a band around the system's center, through
 * the belt's position. The band's half-width is its size × BELT_HALF_WIDTH_SIZES, its half
 * thickness size × BELT_HALF_THICKNESS_SIZES. Rocks are BELT_ROCK_RADIUS_SU across give or
 * take 60 %, never under BELT_ROCK_MIN_PX on screen.
 */
export const BELT_ROCKS = 1_200;
export const BELT_MAX_ROCKS = 2_000;
export const BELT_HALF_WIDTH_SIZES = 0.45;
export const BELT_HALF_THICKNESS_SIZES = 0.06;
export const BELT_ROCK_RADIUS_SU = 0.02;
export const BELT_ROCK_MIN_PX = 1.1;
/** A belt is picked within this many pixels of its middle line, or its half-width if wider. */
export const BELT_PICK_HALF_WIDTH_PX = 8;
/** Points on the circle a belt is picked along, and labelled at. */
export const BELT_PICK_POINTS = 96;

/**
 * The system view's background (rendering.md §7): the sky, plus a dim band where the galaxy's
 * disc runs across it, as seen from inside the disc. The band is this many degrees wide, its
 * plane tilted this far from the system's and turned this far about the vertical, so that from
 * the view's starting pose (SYSTEM_START_TILT_DEG) it runs through the middle of the screen,
 * corner to corner. In
 * this color at this brightness.
 */
export const GALAXY_BAND_WIDTH_DEG = 7;
export const GALAXY_BAND_TILT_DEG = 55;
export const GALAXY_BAND_TURN_DEG = -120;
export const GALAXY_BAND_COLOR = '#aab4d8';
export const GALAXY_BAND_INTENSITY = 0.085;

// ---------------------------------------------------------------------------------------------
// Capture mode (D-55, rendering.md §16): the canvas alone, framed for recording, and a
// scripted camera move between two camera links.
// ---------------------------------------------------------------------------------------------

/**
 * The pixel-ratio cap while capturing (the High setting's): a 9:16 frame is about a third of a
 * wide window's pixels, so at ratio 2 it costs less than the full window at Medium's 1.5, and a
 * Retina screen recording gets one canvas pixel per screen pixel. The ratio also stays put while
 * the camera moves (no `regress`), so a clip doesn't soften mid-move.
 */
export const CAPTURE_MAX_DPR = 2;

/** The move's length when the address doesn't say (`secs`), in seconds. */
export const CAPTURE_MOVE_SECONDS = 10;
/** The lengths `,` and `.` step through, in seconds; the first and last bound `secs`. */
export const CAPTURE_MOVE_SECONDS_STEPS = [3, 5, 8, 10, 12, 15, 20, 30, 45, 60] as const;
/** `spin` is bounded to this many degrees either way: ten turns. */
export const CAPTURE_SPIN_LIMIT_DEG = 3_600;
/**
 * How fast the camera turns around what it's looking at when a clip is asked for with no end
 * set, by capture mode's buttons (a phone), in degrees a second: the one-tap clip. Slow enough
 * to read as a drift, and a whole turn at the longest move, 60 s. The turn grows with the
 * move's length, so Longer shows more of the way round, not the same turn more slowly.
 */
export const CAPTURE_TURN_DEG_PER_S = 6;

/**
 * Pressing P jumps to the move's start and holds it this long before moving, so a recording
 * started just before has a still first second to cut on.
 */
export const CAPTURE_LEAD_IN_MS = 1_000;

/**
 * How much the move pulls back to travel (the ρ of van Wijk and Nuij's "smooth and efficient
 * zooming and panning", the curve d3's zoom transitions use; render/camera/capture-move.ts).
 * Higher pulls back further and travels faster while out; √2 is the paper's choice, which
 * viewers in its trials found most natural. Near 0 it barely pulls back, and a long pan whizzes.
 */
export const CAPTURE_ZOOM_CURVATURE = Math.SQRT2;

/**
 * The keys' card in the black bars beside the frame shows only where a bar is at least this
 * wide, in CSS px, so it never covers the frame.
 */
export const CAPTURE_HINT_MIN_BAR_PX = 240;

/**
 * Recording a clip in the app (D-56, rendering.md §16): the move drawn frame by frame at
 * exactly this width (the height follows the frame's shape: 1920 for 9:16), and encoded as
 * H.264 in an MP4, the format Instagram takes. 1080 px wide is Instagram's own size.
 */
export const CAPTURE_RECORD_WIDTH_PX = 1_080;
/** Frames a second when the address doesn't say (`fps`), and the rates it may say. */
export const CAPTURE_RECORD_FPS = 30;
export const CAPTURE_RECORD_FPS_CHOICES = [24, 25, 30, 60] as const;
/**
 * The video's bit rate, in bits a second at 30 frames a second (twice at 60). 16 Mbit/s keeps
 * the depth stars' fine grain; Instagram re-encodes uploads to less anyway.
 */
export const CAPTURE_RECORD_BITRATE_BPS = 16_000_000;
/** Still seconds before and after the move in a recorded clip, to cut on. */
export const CAPTURE_RECORD_HOLD_S = 1;
/**
 * After raising the pixel ratio for a recording, wait this long before the first frame, so
 * anything that follows the canvas's size has caught up.
 */
export const CAPTURE_RECORD_SETTLE_MS = 100;
