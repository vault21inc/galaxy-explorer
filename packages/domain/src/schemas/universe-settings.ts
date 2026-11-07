import { z } from 'zod';
import { HexColor } from '../colors.ts';
import { Uuid } from '../ids.ts';

/** Per-universe settings (data-model §4). */
export const UniverseSettings = z
  .object({
    /** Distance unit labels per view, such as 'ly' and 'AU'. */
    distanceUnitLabels: z.object({ galaxy: z.string(), system: z.string() }).partial(),
    /** The UI accent color (ux.md §11); cyan by default. */
    accentColor: HexColor,
    defaultMapId: Uuid,
  })
  .partial();
export type UniverseSettings = z.infer<typeof UniverseSettings>;
