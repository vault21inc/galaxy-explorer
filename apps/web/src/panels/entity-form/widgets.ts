import type { FormFieldDef, FormWidget } from '@ge/domain';
import type { ComponentType } from 'react';
import type { FieldProps } from './field-props.ts';
import { ColorField } from './fields/color-field.tsx';
import { DefaultLookField } from './fields/default-look-field.tsx';
import { IconField } from './fields/icon-field.tsx';
import { ImageRoleField } from './fields/image-role-field.tsx';
import { ListField } from './fields/list-field.tsx';
import { PaletteField } from './fields/palette-field.tsx';
import { PerViewScaleField } from './fields/per-view-scale-field.tsx';
import { PositionField } from './fields/position-field.tsx';
import { RiftPathField } from './fields/rift-path-field.tsx';
import { RimGapsField } from './fields/rim-gaps-field.tsx';
import { RichTextField } from './fields/rich-text-field.tsx';
import { SeedField } from './fields/seed-field.tsx';
import { SelectField } from './fields/select-field.tsx';
import { SliderField } from './fields/slider-field.tsx';
import { SwitchField } from './fields/switch-field.tsx';
import { TextField } from './fields/text-field.tsx';

/** The field definitions a widget is used for. */
type DefOf<W extends FormWidget> = FormFieldDef & { widget: W };

/**
 * Form widgets by name: the web half of the form metadata in `@ge/domain`
 * (entity-forms.ts). A new widget is a name there and a component here; a new kind needs
 * neither. The mapped type makes a missing widget, or one given the wrong kind of field, a
 * type error.
 */
const widgets: { [W in FormWidget]: ComponentType<FieldProps<DefOf<W>>> } = {
  name: RichTextField,
  richText: RichTextField,
  switch: SwitchField,
  select: SelectField,
  color: ColorField,
  perViewScale: PerViewScaleField,
  position: PositionField,
  text: TextField,
  number: TextField,
  rimGaps: RimGapsField,
  riftPath: RiftPathField,
  imageRole: ImageRoleField,
  slider: SliderField,
  seed: SeedField,
  palette: PaletteField,
  icon: IconField,
  list: ListField,
  defaultLook: DefaultLookField,
};

/** The component for a field. Each gets only fields of its own widget, which TypeScript can't follow through the lookup, hence the one cast. */
export function widgetFor(field: FormFieldDef): ComponentType<FieldProps> {
  return widgets[field.widget] as ComponentType<FieldProps>;
}
