import {
  resolveGalaxySettings,
  type ViewLevel,
  type ViewObject,
  type ViewPayload,
} from '@ge/domain';
import { lazy, type ComponentType } from 'react';
import type { LocatedKind } from '@/state/editor.ts';
import { axialTiltRad, orbitPayloadInView } from '@/render/orbits/equator-frame.ts';
import { systemExtentSu } from '@/render/system/system-camera.ts';
import {
  GALAXY_BODY_MAX_PX,
  GALAXY_BODY_MIN_PX,
  GALAXY_MAX_DISTANCE_RADII,
  ORBIT_EXIT_RADII,
  SYSTEM_EXIT_EXTENTS,
  SYSTEM_PLANET_MAX_PX,
  SYSTEM_PLANET_MIN_PX,
} from '@/render/tuning.ts';

type AnyPayload = ViewPayload<ViewLevel>;

/**
 * How the editor works in a view (M5-T4): everything the tools need that differs between
 * views, so no tool asks which view it's in. A level without it can't be edited (the orbit
 * view until M6).
 */
export interface LevelEdit {
  /** The Add menu's heading. */
  addLabel: string;
  /** The parent of an object added in this view: the subject, or null at the top level. */
  parentOf: (subjectId: string) => string | null;
  /** How far from the center placing and dragging may reach (work-plane.ts), in the view's unit. */
  workPlaneLimit: (payload: AnyPayload) => number;
  /** Shift-drag snapping spacing until the reader sets their own, in the view's unit. */
  gridSize: number;
  /** Copies land this far along +x, in the view's unit (ux.md §5). */
  duplicateOffset: number;
  /** The placement ghost's on-screen radius clamp, as the view's bodies are drawn. */
  ghostClampPx: { min: number; max: number };
  /** Groups and routes are drawn here (M4): the toolbar and menus offer them. */
  groupsAndRoutes: boolean;
  /** The Map settings panel (galaxy look, underlay) belongs here. */
  mapSettings: boolean;
  /** What an empty view says, with a hint at adding something. */
  emptyTitle: string;
  /**
   * Places and events added here (M6-T5): which kinds the Add menu offers, and how a click
   * locates them: on the globe's surface (orbit view), or at a point in space in the view's
   * frame (galaxy and system views, "Add event here").
   */
  located: { kinds: readonly LocatedKind[]; mode: 'surface' | 'space' };
}

export interface LevelDef {
  /** Draws the view inside the canvas; loaded on first use, so each view is its own chunk. */
  component: ComponentType<{ subjectId: string }>;
  /**
   * A view not built yet: it opens, with breadcrumbs, but draws only the sky, and the page says
   * so with this text.
   */
  placeholder?: string;
  edit?: LevelEdit;
  /**
   * The payload as this view draws it, when that differs from how it's saved: the orbit view
   * turns its moons and stations by the planet's axial tilt (D-60). Readers that draw or edit
   * pass it to `useViewPayload`.
   */
  inView?: (payload: AnyPayload) => AnyPayload;
  /** The tilt of the plane this view's objects are placed and dragged on, in radians. */
  workPlaneTiltRad?: (payload: AnyPayload) => number;
}

/**
 * The view levels the canvas can draw (architecture.md §3.5), and how each is edited. Each
 * level's camera limits live with its camera setup (render/galaxy/galaxy-camera.ts,
 * render/system/system-camera.ts); the enter and exit distances are in render/tuning.ts.
 */
export const levels: Record<ViewLevel, LevelDef> = {
  galaxy: {
    component: lazy(() => import('./galaxy-level.tsx')),
    edit: {
      addLabel: 'Add to the galaxy',
      parentOf: () => null,
      // As far as the camera itself may go, so nothing lands where it can't be seen again.
      workPlaneLimit: (payload) =>
        GALAXY_MAX_DISTANCE_RADII *
        resolveGalaxySettings('galaxySettings' in payload.map ? payload.map.galaxySettings : {})
          .radiusLy,
      gridSize: 10,
      duplicateOffset: 20,
      ghostClampPx: { min: GALAXY_BODY_MIN_PX / 2, max: GALAXY_BODY_MAX_PX / 2 },
      groupsAndRoutes: true,
      mapSettings: true,
      emptyTitle: 'This map is empty',
      located: { kinds: ['event'], mode: 'space' },
    },
  },
  system: {
    component: lazy(() => import('./system-level.tsx')),
    edit: {
      addLabel: 'Add to the system',
      parentOf: (subjectId) => subjectId,
      // The system camera's farthest distance (system-camera.ts).
      workPlaneLimit: (payload) => SYSTEM_EXIT_EXTENTS * systemExtentSu(objectsIn(payload)),
      gridSize: 0.5,
      duplicateOffset: 0.5,
      ghostClampPx: { min: SYSTEM_PLANET_MIN_PX, max: SYSTEM_PLANET_MAX_PX },
      groupsAndRoutes: false,
      mapSettings: false,
      emptyTitle: 'This system is empty',
      located: { kinds: ['event'], mode: 'space' },
    },
  },
  // The globe and what orbits it (M6-T3): moons, stations and markers are placed and moved
  // with the same tools, on the plane of the planet's equator, tilted with it (D-60).
  orbit: {
    component: lazy(() => import('./orbit-level.tsx')),
    edit: {
      addLabel: 'Add around the world',
      parentOf: (subjectId) => subjectId,
      // As far as the orbit camera may go (orbit-camera.ts).
      workPlaneLimit: () => ORBIT_EXIT_RADII,
      gridSize: 0.25,
      duplicateOffset: 0.25,
      ghostClampPx: { min: SYSTEM_PLANET_MIN_PX, max: SYSTEM_PLANET_MAX_PX },
      groupsAndRoutes: false,
      mapSettings: false,
      emptyTitle: 'Nothing orbits this world',
      located: { kinds: ['place', 'event'], mode: 'surface' },
    },
    // Moons circle in the plane of the planet's equator, tilted with it (D-60).
    inView: (payload) => ('pins' in payload ? orbitPayloadInView(payload) : payload),
    workPlaneTiltRad: (payload) =>
      'pins' in payload ? axialTiltRad(payload.subject.appearance) : 0,
  },
};

/**
 * The objects a view draws and edits: the galaxy's top-level objects, or the subject's
 * children in a system or orbit view (architecture.md §6).
 */
export function objectsIn(payload: AnyPayload): readonly ViewObject[] {
  return 'objects' in payload ? payload.objects : payload.children;
}

/** The payload with one more object, for optimistic creation (use-create-object.ts). */
export function withObject<P extends AnyPayload>(payload: P, object: ViewObject): P {
  if ('objects' in payload) {
    return { ...payload, objects: [...payload.objects, object] };
  }
  return { ...payload, children: [...payload.children, object] };
}
