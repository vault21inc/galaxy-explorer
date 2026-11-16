/**
 * Everything the app keeps in the browser's own storage (`localStorage`): a reader's display
 * preferences, nothing about them. The stores use these names, and the privacy note
 * (`/about/privacy`, M8-T9) lists them from here, so the note can't fall behind the code. A
 * new remembered preference gets its line here.
 */
export const STORAGE_KEYS = {
  labels: { key: 'ge.labels', what: 'which labels show (L)' },
  spoilers: { key: 'ge.spoilers', what: 'whether potential spoilers are shown' },
  quality: { key: 'ge.quality', what: 'the quality setting, and whether ambient motion runs' },
  stars: { key: 'ge.stars', what: 'how many background stars to draw, and how bright' },
  layers: { key: 'ge.layers', what: 'which layers and group types are hidden' },
  tours: { key: 'ge.tours', what: 'which guided tours were offered, so each is offered once' },
} as const satisfies Record<string, { key: `ge.${string}`; what: string }>;
