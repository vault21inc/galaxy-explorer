/**
 * The vocabulary of the guided tours (M8-T10, D-30, ux.md §12). A tour is data: an ordered
 * list of steps (tours.ts), each naming what it points at, what completes it and what it
 * needs, by keys from the lists below. The lists are what the tour layer knows how to find,
 * watch and check (targets.ts, completions.ts, needs.ts); a unit test holds every step to them.
 */

export const TOUR_IDS = ['reader', 'editor'] as const;
export type TourId = (typeof TOUR_IDS)[number];

/**
 * The controls a step can point at, each marked `data-tour="<name>"` in the markup. A test
 * checks that each one is marked somewhere in the app's source.
 */
export const TOUR_CONTROLS = [
  'edit-toggle',
  'list',
  'layers',
  'events',
  'search',
  'spoilers',
  'help',
  'breadcrumbs',
  'universe-switcher',
  'add-menu',
  'edit-toolbar',
  'tool-group',
  'tool-route',
  'tool-map',
  'tool-history',
  'info-panel',
] as const;
export type TourControl = (typeof TOUR_CONTROLS)[number];

/**
 * The objects a step can point at, found through the scene index (render/scene-index.ts):
 * - `body`: a star system, planet or other body on screen, near the middle;
 * - `explorable`: one of those that opens a view of its own (a system or a planet);
 * - `selected`: what's selected.
 */
export const OBJECT_PICKS = ['body', 'explorable', 'selected'] as const;
export type ObjectPick = (typeof OBJECT_PICKS)[number];

/** What a step points at: a control, an object, or the whole view (nothing in particular). */
export type TourTarget =
  { kind: 'control'; name: TourControl } | { kind: 'object'; pick: ObjectPick } | { kind: 'view' };
export const TARGET_KINDS = ['control', 'object', 'view'] as const;

/**
 * What completes a step besides its Next button: something the reader does in the app.
 * `next` is the button alone, for a step that only shows where something is.
 */
export const TOUR_COMPLETIONS = [
  'next',
  'camera-moved',
  'selected',
  'labels-changed',
  'list-opened',
  'entered-system',
  'entered-orbit',
  'back-to-galaxy',
  'editing-on',
  'change-made',
] as const;
export type TourCompletion = (typeof TOUR_COMPLETIONS)[number];

/**
 * What a step needs to make sense now. A step whose needs aren't met is skipped, so a tour
 * never points at nothing: no explorable system on this map, edit mode left off, a view the
 * reader didn't enter.
 */
export const TOUR_NEEDS = [
  'can-edit',
  'editing',
  'selection',
  'explorable',
  'in-galaxy',
  'in-system',
  'in-orbit',
  'away-from-galaxy',
] as const;
export type TourNeed = (typeof TOUR_NEEDS)[number];

export interface TourStep {
  /** Unique within its tour; e2e tests find steps by it. */
  id: string;
  title: string;
  /** A sentence or two, in the app's own words: "event", never "scene". */
  text: string;
  target: TourTarget;
  completes: TourCompletion;
  needs?: readonly TourNeed[];
}

export interface TourDef {
  id: TourId;
  /** As the Help menu offers it. */
  title: string;
  steps: readonly TourStep[];
}
