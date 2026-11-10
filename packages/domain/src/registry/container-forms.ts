import type { FormFieldDef } from './entity-forms.ts';

/**
 * The universe details form on the settings page (M4-T1), as data like the entity forms
 * (entity-forms.ts): the same widgets, checked against `UniverseUpdate`. The slug isn't here:
 * changing it would break every link to the universe.
 */
export const universeForm: readonly FormFieldDef[] = [
  { path: 'name', widget: 'name', label: 'Name' },
  { path: 'description', widget: 'richText', label: 'Description' },
  {
    path: 'dateFormatNotes',
    widget: 'richText',
    label: 'Date format',
    hint: 'How dates are written in this universe, such as “240.M41” (E2).',
  },
  {
    path: 'settings.accentColor',
    widget: 'color',
    label: 'Accent color',
    hint: 'The interface accent (ux.md §11). Cyan #4fd1ff by default.',
  },
  {
    path: 'settings.distanceUnitLabels.galaxy',
    widget: 'text',
    label: 'Galaxy unit',
    hint: 'The distance unit shown in the galaxy view, such as “ly”.',
  },
  {
    path: 'settings.distanceUnitLabels.system',
    widget: 'text',
    label: 'System unit',
    hint: 'The distance unit shown in the system view, such as “AU”.',
  },
];
