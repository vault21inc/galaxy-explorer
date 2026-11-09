import type { GalaxySettings } from '../schemas/map-settings.ts';

/**
 * Named galaxy shapes (D-24, M3-T8): starting points the Map settings panel offers before its
 * sliders. Picking one fills the settings; nothing remembers which preset was picked. Each is
 * data, checked against `GalaxySettings` by a unit test, so a new preset is one more entry.
 * Size, seed and colors are left to the map.
 */
export interface GalaxyPreset {
  id: string;
  label: string;
  settings: GalaxySettings;
}

export const GALAXY_PRESETS: readonly GalaxyPreset[] = [
  {
    id: 'grand-design',
    label: 'Grand-design spiral',
    // The defaults: 4 well-defined arms.
    settings: { arms: 4, armTwist: 1.2, armSpread: 0.35, bulgeRadiusLy: 7_500, barLengthRadii: 0 },
  },
  {
    id: 'two-armed',
    label: 'Two-armed spiral',
    settings: { arms: 2, armTwist: 0.9, armSpread: 0.3, bulgeRadiusLy: 6_000, barLengthRadii: 0 },
  },
  {
    id: 'barred',
    label: 'Barred spiral',
    settings: { arms: 2, armTwist: 0.7, armSpread: 0.3, bulgeRadiusLy: 5_000, barLengthRadii: 0.3 },
  },
  {
    id: 'flocculent',
    label: 'Flocculent spiral',
    settings: { arms: 7, armTwist: 0.8, armSpread: 0.85, bulgeRadiusLy: 6_000, barLengthRadii: 0 },
  },
  {
    id: 'tightly-wound',
    label: 'Tightly wound spiral',
    settings: { arms: 3, armTwist: 2.4, armSpread: 0.25, bulgeRadiusLy: 8_000, barLengthRadii: 0 },
  },
  {
    id: 'lenticular',
    label: 'Lenticular',
    settings: { arms: 0, thicknessLy: 600, bulgeRadiusLy: 11_000, barLengthRadii: 0 },
  },
  {
    id: 'elliptical',
    label: 'Elliptical',
    settings: { arms: 0, thicknessLy: 9_000, bulgeRadiusLy: 22_000, barLengthRadii: 0 },
  },
];
