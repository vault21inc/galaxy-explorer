import { planetPresets } from '../planet-presets.ts';
import { PLANET_PRESETS } from '../schemas/appearance.ts';
import type { FormCondition, FormFieldDef } from './entity-forms.ts';

/**
 * A planet's or moon's appearance fields (M6-T2): its surface (a preset, or an uploaded map of
 * the globe), then its axial tilt, atmosphere, clouds, rings and night lights. Each optional
 * layer has a switch, and its own fields show only while it's on.
 */

/** The generator's fields show unless the planet uses an uploaded texture. */
const GENERATED: readonly FormCondition[] = [
  'planetType',
  { path: 'appearance.planet.texture', notIn: ['upload'] },
];
const on = (layer: string): readonly FormCondition[] => [
  'planetType',
  { path: `appearance.planet.${layer}.enabled`, in: [true] },
];

const PRESET_LABELS = Object.fromEntries(
  PLANET_PRESETS.map((name) => [name, planetPresets[name].label]),
);

export const PLANET_FIELDS: readonly FormFieldDef[] = [
  {
    path: 'appearance.planet.texture',
    widget: 'select',
    label: 'Surface',
    options: {
      from: 'values',
      values: ['preset', 'upload'],
      labels: { preset: 'Generated from a preset', upload: 'An uploaded map of the globe' },
    },
    showWhen: 'planetType',
  },
  {
    widget: 'imageRole',
    role: 'surface_texture',
    path: 'appearance.planet.texture',
    value: 'upload',
    label: 'Surface map',
    hint: 'An equirectangular map, twice as wide as tall: longitude across, latitude up.',
    showWhen: ['planetType', { path: 'appearance.planet.texture', in: ['upload'] }],
  },
  {
    path: 'appearance.planet.preset',
    widget: 'select',
    label: 'Preset',
    options: { from: 'values', values: PLANET_PRESETS, labels: PRESET_LABELS },
    showWhen: GENERATED,
  },
  {
    path: 'appearance.planet.seed',
    widget: 'seed',
    label: 'Seed',
    hint: 'Another number gives other continents with the same look.',
    showWhen: GENERATED,
  },
  {
    path: 'appearance.planet.palette',
    widget: 'palette',
    label: 'Palette',
    hint: 'From the shore to the peaks; a gas giant’s band colors.',
    showWhen: GENERATED,
  },
  {
    path: 'appearance.planet.seaLevel',
    widget: 'slider',
    label: 'Sea level',
    hint: 'Water fills everything below it; 0 for none.',
    showWhen: [...GENERATED, { path: 'appearance.planet.preset', notIn: ['gas_giant'] }],
  },
  {
    path: 'appearance.planet.axialTiltDeg',
    widget: 'slider',
    label: 'Axial tilt (°)',
    showWhen: 'planetType',
  },
  {
    path: 'appearance.planet.atmosphere.enabled',
    widget: 'switch',
    label: 'Atmosphere',
    showWhen: 'planetType',
  },
  {
    path: 'appearance.planet.atmosphere.color',
    widget: 'color',
    label: 'Atmosphere color',
    showWhen: on('atmosphere'),
  },
  {
    path: 'appearance.planet.atmosphere.thickness',
    widget: 'slider',
    label: 'Atmosphere thickness',
    showWhen: on('atmosphere'),
  },
  {
    path: 'appearance.planet.clouds.enabled',
    widget: 'switch',
    label: 'Clouds',
    showWhen: 'planetType',
  },
  {
    path: 'appearance.planet.clouds.coverage',
    widget: 'slider',
    label: 'Cloud cover',
    showWhen: on('clouds'),
  },
  {
    path: 'appearance.planet.clouds.color',
    widget: 'color',
    label: 'Cloud color',
    showWhen: on('clouds'),
  },
  {
    path: 'appearance.planet.rings.enabled',
    widget: 'switch',
    label: 'Rings',
    showWhen: 'planetType',
  },
  {
    path: 'appearance.planet.rings.innerRadius',
    widget: 'number',
    label: 'Rings from (radii)',
    showWhen: on('rings'),
  },
  {
    path: 'appearance.planet.rings.outerRadius',
    widget: 'number',
    label: 'Rings to (radii)',
    showWhen: on('rings'),
  },
  {
    path: 'appearance.planet.rings.color',
    widget: 'color',
    label: 'Ring color',
    showWhen: on('rings'),
  },
  {
    path: 'appearance.planet.rings.opacity',
    widget: 'slider',
    label: 'Ring opacity',
    showWhen: on('rings'),
  },
  {
    path: 'appearance.planet.nightLights.enabled',
    widget: 'switch',
    label: 'Night lights',
    hint: 'City lights on the dark side; hive and forge worlds have them already.',
    showWhen: 'planetType',
  },
  {
    path: 'appearance.planet.nightLights.color',
    widget: 'color',
    label: 'Light color',
    showWhen: on('nightLights'),
  },
  {
    path: 'appearance.planet.nightLights.intensity',
    widget: 'slider',
    label: 'Light intensity',
    showWhen: on('nightLights'),
  },
];
