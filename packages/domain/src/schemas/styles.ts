import { z } from 'zod';
import { HexColor } from '../colors.ts';

/**
 * A group's outline: a padded hull around its members, or a ring around a centre (D-53). Later,
 * perhaps: 'voronoi' territories, 'freeform' traced shapes.
 */
export const GROUP_SHAPES = ['hull', 'ring'] as const;

/**
 * A ring group's band (D-53, rendering.md §6): the space between two circles around `center`.
 * A radius left out follows the members (just inside the nearest, just outside the farthest);
 * a radius given is pinned there. An inner radius of 0 is a disc.
 */
export const GroupRing = z
  .object({
    /** [x, z] in light-years. Default [0, 0], the galaxy's centre. */
    center: z.tuple([z.number(), z.number()]),
    innerRadiusLy: z.number().min(0),
    outerRadiusLy: z.number().positive(),
    /**
     * Where on the band the label sits: degrees around the centre from +x toward +z. Default
     * −90 (`GROUP_RING_LABEL_DEG`), straight above the centre in the usual top-down view.
     */
    labelDeg: z.number().min(-360).max(360),
  })
  .partial()
  .refine(
    (ring) =>
      ring.innerRadiusLy === undefined ||
      ring.outerRadiusLy === undefined ||
      ring.innerRadiusLy < ring.outerRadiusLy,
    { message: 'The inner radius must be smaller than the outer one.', path: ['innerRadiusLy'] },
  );
export type GroupRing = z.infer<typeof GroupRing>;

/** How a group's outline is drawn (U6). Missing fields use defaults. */
export const GroupStyle = z
  .object({
    /** Default 0.06: barely there, so the stars stay the subject (ux.md §11). */
    fillOpacity: z.number().min(0).max(0.5),
    /** Default 2. */
    lineWidthPx: z.number().min(1).max(6),
    dashed: z.boolean(),
    /** Default 'hull'. */
    shape: z.enum(GROUP_SHAPES),
    /** Only read while `shape` is 'ring'. */
    ring: GroupRing,
  })
  .partial();
export type GroupStyle = z.infer<typeof GroupStyle>;

/** How a route's line is drawn (M4). */
export const RouteStyle = z
  .object({ color: HexColor, widthPx: z.number().min(1).max(6), dashed: z.boolean() })
  .partial();
export type RouteStyle = z.infer<typeof RouteStyle>;
