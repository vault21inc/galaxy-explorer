import { z } from 'zod';
import { HexColor } from '../colors.ts';
import { Uuid } from '../ids.ts';
import { BASE_TYPES } from '../registry/object-types.ts';
import type { ViewLevel } from '../registry/view-levels.ts';
import { Appearance } from './appearance.ts';
import { LOCATION_MODES } from './aspects.ts';
import { GroupStyle, RouteStyle } from './styles.ts';
import { GalaxySettings, Underlay } from './map-settings.ts';

/**
 * View payloads (architecture.md §6): what one view loads in one request. Compact and ready to
 * draw: appearances are resolved, positions are arrays, and there are no rich-text bodies. The
 * info panel fetches the full entity when something is selected.
 */

/** How a record is named in a view: plain text, plus what to show while spoilers are hidden. */
const Named = {
  namePlain: z.string(),
  /** The whole name is a potential spoiler. */
  nameSpoiler: z.boolean(),
  /** The name with every spoiler (whole or inline) blacked out: what labels show by default. */
  nameRedacted: z.string(),
  /** The whole record is a potential spoiler. */
  isSpoiler: z.boolean(),
};

/** `[x, y, z]` in the parent's frame and unit (data-model §5). */
const Position = z.tuple([z.number(), z.number(), z.number()]);

export const ViewObject = z.object({
  id: Uuid,
  baseType: z.enum(BASE_TYPES),
  subtypeId: Uuid.nullable(),
  ...Named,
  status: z.enum(['draft', 'published']),
  /** For editing straight from the view: writes send the version they read (architecture.md §5). */
  version: z.int().positive(),
  explorable: z.boolean(),
  position: Position,
  /**
   * The star it orbits, a sibling in the same system (D-29), or null for the system's center
   * (and for anything not in a system). Its orbit ring centers there.
   */
  orbitCenterId: Uuid.nullable(),
  /** Resolved: type defaults ← subtype defaults ← the object's overrides (data-model §6). */
  appearance: Appearance,
  /** Displayed size in this view's unit, or null where the type isn't drawn as a body. */
  size: z.number().nullable(),
  /**
   * A planet's or moon's uploaded map of its globe (the `surface_texture` image, M6-T2), which
   * it draws instead of its generated surface when `appearance.planet.texture` is `upload`:
   * the 2:1 `texture` variant, or the display one for an image that isn't 2:1. Null for every
   * other object, and for planets without one.
   */
  surfaceTexture: z.object({ assetId: Uuid, url: z.string(), isSpoiler: z.boolean() }).nullable(),
});
export type ViewObject = z.infer<typeof ViewObject>;

/** One of a system's stars, as its galaxy-view glyph shows it (D-29). */
export const SystemStar = z.object({
  /** Resolved color. */
  color: HexColor,
  /** Its size relative to the system's largest star: 1 for the largest. */
  sizeShare: z.number().min(0).max(1),
  isSpoiler: z.boolean(),
});

/**
 * An object in the galaxy view. Systems also say what their glyph shows (D-28, D-29): how many
 * planets they hold and up to 3 of their stars, largest first. Other types have 0 and [].
 */
export const GalaxyObject = ViewObject.extend({
  /** Planets directly in the system that the reader may see and that aren't spoilers. */
  planetCount: z.int().nonnegative(),
  /** The same planets flagged as potential spoilers, counted apart so they can stay hidden. */
  spoilerPlanetCount: z.int().nonnegative(),
  stars: z.array(SystemStar).max(3),
  /**
   * A region's uploaded top-down picture (the `region_texture` image, M4-T6), which a storm
   * draws instead of its generated one when `appearance.region.texture` is `upload`. Null for
   * every other object, and for regions without one.
   */
  regionTexture: z.object({ assetId: Uuid, url: z.string(), isSpoiler: z.boolean() }).nullable(),
});
export type GalaxyObject = z.infer<typeof GalaxyObject>;

export const ViewGroupMember = z.object({ objectId: Uuid, isSpoiler: z.boolean() });

export const ViewGroup = z.object({
  id: Uuid,
  /** For edits from the view, such as deleting the group (M4-T2). */
  version: z.int().positive(),
  ...Named,
  status: z.enum(['draft', 'published']),
  groupTypeId: Uuid,
  parentGroupId: Uuid.nullable(),
  outlineColor: HexColor,
  style: GroupStyle,
  members: z.array(ViewGroupMember),
});

export type ViewGroup = z.infer<typeof ViewGroup>;

/**
 * A route as the galaxy view draws it (M4-T7): its look and its waypoints in order, only those
 * the view shows. Waypoints may repeat an object.
 */
export const ViewRoute = z.object({
  id: Uuid,
  version: z.int().positive(),
  ...Named,
  status: z.enum(['draft', 'published']),
  style: RouteStyle,
  waypoints: z.array(Uuid),
});
export type ViewRoute = z.infer<typeof ViewRoute>;

export const ViewGroupType = z.object({
  id: Uuid,
  name: z.string(),
  layer: z.string(),
  parentGroupTypeId: Uuid.nullable(),
  defaultColor: HexColor,
  sortKey: z.number(),
});
export type ViewGroupType = z.infer<typeof ViewGroupType>;

export const GalaxyView = z.object({
  map: z.object({
    id: Uuid,
    /** Layer visibility is remembered per universe (M4-T5). */
    universeId: Uuid,
    ...Named,
    galaxySettings: GalaxySettings,
    underlay: Underlay.nullable(),
    underlayAssetId: Uuid.nullable(),
  }),
  /** Top-level objects: what sits directly in the galaxy. */
  objects: z.array(GalaxyObject),
  groups: z.array(ViewGroup),
  /** Arrive in M4. */
  /** Routes whose waypoints the reader may see (M4-T7). */
  routes: z.array(ViewRoute),
  groupTypes: z.array(ViewGroupType),
});
export type GalaxyView = z.infer<typeof GalaxyView>;

/** The chain from the galaxy down to the subject, for breadcrumbs (ux.md §1). */
const Ancestor = z.object({ id: Uuid, baseType: z.enum(BASE_TYPES), ...Named });

const Subject = ViewObject.extend({ parentId: Uuid.nullable() });

export const SystemView = z.object({
  map: z.object({ id: Uuid, ...Named }),
  /** Outermost first, ending with the subject's parent; empty for a top-level subject. */
  ancestors: z.array(Ancestor),
  subject: Subject,
  /** The subject's direct children: stars, planets, belts, stations… */
  children: z.array(ViewObject),
});
export type SystemView = z.infer<typeof SystemView>;

/** A place or event shown as a pin on the globe (E3, E4). */
export const ViewPin = z.object({
  id: Uuid,
  kind: z.enum(['place', 'event']),
  ...Named,
  status: z.enum(['draft', 'published']),
  /** How it's located: on the surface (lat/lon), at the body, or at a place on the surface. */
  mode: z.enum(LOCATION_MODES),
  latDeg: z.number().nullable(),
  lonDeg: z.number().nullable(),
  /** For mode 'place': the place it's at, whose coordinates it uses. */
  placeId: Uuid.nullable(),
  /** The location itself is a spoiler: the pin isn't drawn while spoilers are hidden (P2). */
  locationSpoiler: z.boolean(),
  categoryId: Uuid.nullable(),
  dateText: z.string().nullable(),
});
export type ViewPin = z.infer<typeof ViewPin>;

export const OrbitView = SystemView.extend({ pins: z.array(ViewPin) });
export type OrbitView = z.infer<typeof OrbitView>;

/**
 * Each view level's payload schema, so clients derive the payload type from the level
 * (`ViewPayload<'system'>`) instead of naming it. `satisfies` makes a missing level a type error.
 */
export const viewPayloads = {
  galaxy: GalaxyView,
  system: SystemView,
  orbit: OrbitView,
} satisfies Record<ViewLevel, z.ZodType>;
export type ViewPayload<L extends ViewLevel> = z.infer<(typeof viewPayloads)[L]>;
