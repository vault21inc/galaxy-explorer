/**
 * Moving between views from anywhere (rendering.md §4, ux.md §9): Esc, the breadcrumbs, the
 * test hooks and, from M5-T2, zooming. Each changes the URL; the view sync (use-view-sync.ts)
 * resolves the new URL and the transition controller animates the change, so a link, Back and
 * Forward all take the same path.
 *
 * The map page installs the navigator, which knows the current universe and map; elsewhere
 * these do nothing.
 */
export interface ViewNavigator {
  /** Opens an object's view, one level deeper (or selects it, if it doesn't open one). */
  enter: (objectId: string) => void;
  /** Goes up one view, back to where the camera was. */
  exit: () => void;
  /** Opens any object's view, or the galaxy view (null). */
  goTo: (objectId: string | null) => void;
}

let navigator: ViewNavigator | null = null;

export function setViewNavigator(next: ViewNavigator | null): void {
  navigator = next;
}

export const viewNavigation: ViewNavigator = {
  enter: (objectId) => navigator?.enter(objectId),
  exit: () => navigator?.exit(),
  goTo: (objectId) => navigator?.goTo(objectId),
};

/** `/u/{universe}/{map}` for the galaxy view, `…/view/{objectId}` for an object's (ux.md §9). */
export function viewPath(universeSlug: string, mapSlug: string, objectId: string | null): string {
  const map = `/u/${universeSlug}/${mapSlug}`;
  return objectId === null ? map : `${map}/view/${objectId}`;
}
