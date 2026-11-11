import {
  resolveGalaxySettings,
  type ViewLevel,
  type ViewObject,
  type ViewPayload,
} from '@ge/domain';
import { lazy, type ComponentType } from 'react';
import { systemExtentSu } from '@/render/system/system-camera.ts';
import {
  GALAXY_BODY_MAX_PX,
  GALAXY_BODY_MIN_PX,
  GALAXY_MAX_DISTANCE_RADII,
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
    },
  },
  orbit: {
    component: lazy(() => import('./orbit-level.tsx')),
    placeholder: 'The orbit view, with the globe and what’s on it, arrives in M6.',
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
