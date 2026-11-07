import { z } from 'zod';

/** A color as six lower-case hex digits, such as `#4fd1ff` (data-model §2). */
export const HexColor = z
  .string()
  .regex(/^#[0-9a-f]{6}$/, 'Use a lower-case hex color such as #4fd1ff.')
  .brand<'HexColor'>();
export type HexColor = z.infer<typeof HexColor>;
