import type { TourDef, TourId } from './tour-types.ts';

/**
 * The guided tours (M8-T10, D-30, ux.md §12): a reader's, on whatever map is open, which
 * writes nothing; and an editor's, in a practice universe of its own (practice.ts). A step
 * that waits for something ("press L") also has Next, so nobody is stuck.
 *
 * From M8-T10 on, a task that adds or changes a feature a reader or editor sees adds or updates
 * its step here (AGENTS.md, definition of done).
 */

const READER: TourDef = {
  id: 'reader',
  title: 'Take the tour',
  steps: [
    {
      id: 'move',
      title: 'Moving around',
      text: 'Drag to turn the view, right-drag (or ⌘/Ctrl-drag) to slide it, and scroll or pinch to zoom. Try it.',
      touchText:
        'Drag with one finger to turn the view, two fingers to slide it, and pinch to zoom. Try it.',
      target: { kind: 'view' },
      completes: 'camera-moved',
    },
    {
      id: 'select',
      title: 'Selecting',
      text: 'Click a system to select it. Its panel opens with what’s known about it.',
      touchText: 'Tap a system to select it. Its panel opens with what’s known about it.',
      target: { kind: 'object', pick: 'body' },
      completes: 'selected',
    },
    {
      id: 'labels',
      title: 'Labels',
      text: 'Press L to choose which labels show: the one you point at, groups too, or everything. Hold Space to see them all for a moment.',
      touchText:
        'Layers and labels, in More, chooses which labels show: the selected one, groups too, or everything.',
      target: { kind: 'view' },
      completes: 'labels-changed',
    },
    {
      id: 'spoilers',
      title: 'Spoilers',
      text: 'Potential spoilers are blacked out. This switch shows or hides them all; click a black bar to reveal only that one.',
      touchText:
        'Potential spoilers are blacked out. The Spoilers switch, in More, shows or hides them all; tap a black bar to reveal only that one.',
      target: { kind: 'control', name: 'spoilers' },
      completes: 'next',
    },
    {
      id: 'list',
      title: 'The List',
      text: 'Everything on the map, as a list you can search and move through with the keyboard. Open it.',
      touchText: 'Everything on the map, as a list you can search. Open it from More.',
      target: { kind: 'control', name: 'list' },
      completes: 'list-opened',
    },
    {
      id: 'layers',
      title: 'Groups and layers',
      text: 'Sectors and other groups are drawn as outlines. Layers turns groups, routes and regions on and off, with a legend.',
      target: { kind: 'control', name: 'layers' },
      completes: 'next',
    },
    {
      id: 'enter-system',
      title: 'Entering a system',
      text: 'Double-click this system, or select it and press Enter, or zoom in until it opens.',
      touchText: 'Double-tap this system, or pinch in on it until it opens.',
      target: { kind: 'object', pick: 'explorable' },
      completes: 'entered-system',
      needs: ['in-galaxy', 'explorable'],
    },
    {
      id: 'enter-planet',
      title: 'A planet’s globe',
      text: 'A planet you can visit opens the same way, to its globe with its places and events.',
      target: { kind: 'object', pick: 'explorable' },
      completes: 'entered-orbit',
      needs: ['in-system', 'explorable'],
    },
    {
      id: 'go-back',
      title: 'Going back',
      text: 'The breadcrumbs lead back out, or click the view and press Esc.',
      touchText: 'Tap the name at the top to see where you are, and go back out from there.',
      target: { kind: 'control', name: 'breadcrumbs' },
      completes: 'back-to-galaxy',
      needs: ['away-from-galaxy'],
    },
    {
      id: 'events',
      title: 'Events',
      text: 'Every event on this map, in date order. Choose one to go where it happened.',
      target: { kind: 'control', name: 'events' },
      completes: 'next',
    },
    {
      id: 'search',
      title: 'Search',
      text: 'Press ⌘/Ctrl + K, or click here, to find anything by name and fly to it. “Copy link to this view” there shares exactly what you see, and “Capture mode” hides everything but the galaxy, for recording a clip.',
      touchText:
        'Tap here to find anything by name and fly to it. “Copy link to this view” there shares exactly what you see.',
      target: { kind: 'control', name: 'search' },
      completes: 'next',
    },
    {
      id: 'shortcuts',
      title: 'Every shortcut',
      text: 'Press ? for every key and gesture. This tour stays in the Help menu, here.',
      touchText:
        'Every gesture is listed under Help and tours, in More, and this tour stays there.',
      target: { kind: 'control', name: 'help' },
      completes: 'next',
    },
  ],
};

const EDITOR: TourDef = {
  id: 'editor',
  title: 'Editor tour',
  steps: [
    {
      id: 'edit-mode',
      title: 'Edit mode',
      text: 'This practice universe is yours alone: change anything. Turn on edit mode (or press E).',
      target: { kind: 'control', name: 'edit-toggle' },
      completes: 'editing-on',
      needs: ['can-edit'],
    },
    {
      id: 'toolbar',
      title: 'The toolbar',
      text: 'The edit tools: adding, grouping, routes, map settings, undo and History.',
      target: { kind: 'control', name: 'edit-toolbar' },
      completes: 'next',
      needs: ['editing'],
    },
    {
      id: 'add-object',
      title: 'Adding an object',
      text: 'Press N or open Add, choose a system, click the map to place it, then type its name.',
      target: { kind: 'control', name: 'add-menu' },
      completes: 'change-made',
      needs: ['editing', 'in-galaxy'],
    },
    {
      id: 'move-object',
      title: 'Moving it',
      text: 'Drag it to move it. The arrow handle changes its height, and holding Shift snaps it to the grid.',
      target: { kind: 'object', pick: 'selected' },
      completes: 'change-made',
      needs: ['editing', 'selection'],
    },
    {
      id: 'object-form',
      title: 'Its details',
      text: 'The panel is its form: name, description, color, size and more. Each field saves as you leave it.',
      target: { kind: 'control', name: 'info-panel' },
      completes: 'next',
      needs: ['editing', 'selection'],
    },
    {
      id: 'group',
      title: 'Grouping',
      text: 'Shift-drag a box around a few objects, then press ⌘/Ctrl + G to make them a sector or another group. Its form’s Shape can make it a ring around the galaxy’s centre instead, for regions like a Core or an Outer Rim.',
      target: { kind: 'control', name: 'tool-group' },
      completes: 'next',
      needs: ['editing'],
    },
    {
      id: 'undo',
      title: 'Undo and History',
      text: '⌘/Ctrl + Z undoes your last change. History lists every change to the universe, and undoes any of them.',
      target: { kind: 'control', name: 'tool-history' },
      completes: 'next',
      needs: ['editing'],
    },
    {
      id: 'settings',
      title: 'Universe settings',
      text: 'This menu leads to the universe’s settings: its facts, subtypes, group types, event categories and sharing.',
      target: { kind: 'control', name: 'universe-switcher' },
      completes: 'next',
    },
    {
      id: 'map-settings',
      title: 'Map settings',
      text: 'The galaxy’s shape, and a reference image to trace over.',
      target: { kind: 'control', name: 'tool-map' },
      completes: 'next',
      needs: ['editing'],
    },
    {
      id: 'regions-routes',
      title: 'Regions and routes',
      text: 'Add ▸ Region makes a nebula, a storm or a rift. The Route tool joins systems, one click at a time.',
      target: { kind: 'control', name: 'tool-route' },
      completes: 'next',
      needs: ['editing'],
    },
    {
      id: 'enter-system',
      title: 'Inside a system',
      text: 'Double-click this system to open it. Its stars, planets and moons are edited the same way.',
      target: { kind: 'object', pick: 'explorable' },
      completes: 'entered-system',
      needs: ['in-galaxy', 'explorable'],
    },
    {
      id: 'add-planet',
      title: 'Adding a planet',
      text: 'In a system, Add places planets, moons and stations, in orbit around its star.',
      target: { kind: 'control', name: 'add-menu' },
      completes: 'next',
      needs: ['editing', 'in-system'],
    },
    {
      id: 'enter-globe',
      title: 'A planet’s globe',
      text: 'Double-click this planet to open its globe.',
      target: { kind: 'object', pick: 'explorable' },
      completes: 'entered-orbit',
      needs: ['in-system', 'explorable'],
    },
    {
      id: 'place-event',
      title: 'Places and events',
      text: 'On a globe, Add ▸ Place or Event, then click the globe where it is.',
      target: { kind: 'control', name: 'add-menu' },
      completes: 'next',
      needs: ['editing', 'in-orbit'],
    },
    {
      id: 'delete',
      title: 'Deleting',
      text: 'Select something and press Delete. Before anything goes, a dialog shows everything that would go with it.',
      target: { kind: 'view' },
      completes: 'next',
    },
  ],
};

export const TOURS: Record<TourId, TourDef> = { reader: READER, editor: EDITOR };
