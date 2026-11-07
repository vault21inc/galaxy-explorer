import { z } from 'zod';
import { RichText } from '../richtext/schema.ts';

/**
 * A fact's value ("Population: 5 billion"), by its field definition's value type (U2, U4).
 * The definition says which type is expected; the service layer checks they match.
 */
export const FieldValue = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), text: RichText }),
  z.object({ type: z.literal('number'), number: z.number() }),
  /** A date in the universe's own format, such as '240.M41', with an optional sort key. */
  z.object({
    type: z.literal('date_text'),
    text: z.string().max(200),
    sort: z.number().optional(),
  }),
  z.object({
    type: z.literal('url'),
    url: z.url({ protocol: /^https?$/ }),
    label: z.string().max(200).optional(),
  }),
]);
export type FieldValue = z.infer<typeof FieldValue>;

/** The value types, from the union above, for `field_definitions.value_type`. */
export const FIELD_VALUE_TYPES = FieldValue.options.map((option) => option.shape.type.value) as [
  FieldValue['type'],
  ...FieldValue['type'][],
];
