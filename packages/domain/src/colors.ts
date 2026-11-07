import { z } from 'zod';
import { HEX_COLOR_PATTERN } from './patterns.ts';

/** A color as six lower-case hex digits, such as `#4fd1ff` (data-model §2). */
export const HexColor = z
  .string()
  .regex(new RegExp(HEX_COLOR_PATTERN), 'Use a lower-case hex color such as #4fd1ff.')
  .brand<'HexColor'>();
export type HexColor = z.infer<typeof HexColor>;
