import { z } from 'zod';
import { HexColor } from '../colors.ts';

/** How a group's outline is drawn (U6). Missing fields use defaults. */
export const GroupStyle = z
  .object({
    /** Default 0.06: barely there, so the stars stay the subject (ux.md §11). */
    fillOpacity: z.number().min(0).max(0.5),
    /** Default 2. */
    lineWidthPx: z.number().min(1).max(6),
    dashed: z.boolean(),
    /** Later: 'voronoi' territories, 'freeform'. */
    shape: z.enum(['hull']),
  })
  .partial();
export type GroupStyle = z.infer<typeof GroupStyle>;

/** How a route's line is drawn (M4). */
export const RouteStyle = z
  .object({ color: HexColor, widthPx: z.number().min(1).max(6), dashed: z.boolean() })
  .partial();
export type RouteStyle = z.infer<typeof RouteStyle>;
