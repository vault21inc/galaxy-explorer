/**
 * The three levels a reader moves between (T2, architecture.md §3.3). Each has its own frame and
 * unit (data-model §5). There's no hard-coded hierarchy: the view an object opens comes from
 * its base type's `explorableAs`, and a view's parent is the view of its subject's parent.
 */
export interface ViewLevelDef {
  /** What the view is about: the map itself, or an object of one of these base types. */
  subject: 'map' | readonly string[];
  /** The unit of the view's frame. The galaxy's label comes from universe settings. */
  unit: 'ly' | 'su' | 'radii';
  label: string;
}

export function defineViewLevels<const T extends Record<string, ViewLevelDef>>(levels: T): T {
  return levels;
}

export const viewLevels = defineViewLevels({
  galaxy: { subject: 'map', unit: 'ly', label: 'Galaxy view' },
  system: { subject: ['system'], unit: 'su', label: 'System view' },
  orbit: { subject: ['planet', 'moon'], unit: 'radii', label: 'Orbit view' },
});

export type ViewLevel = keyof typeof viewLevels;

/** The level names in registry order, as a tuple Zod can use. */
export const VIEW_LEVELS = Object.keys(viewLevels) as [ViewLevel, ...ViewLevel[]];
