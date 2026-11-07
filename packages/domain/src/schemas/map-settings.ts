import { z } from 'zod';
import { HexColor } from '../colors.ts';

/** The procedural galaxy background of a map (G1, data-model §4). Missing fields use defaults. */
export const GalaxySettings = z
  .object({
    seed: z.int(),
    /** Default 50,000. */
    radiusLy: z.number().min(1_000).max(500_000),
    /** Default 1,000. */
    thicknessLy: z.number().min(10).max(20_000),
    /** Default 4; 0 makes an elliptical galaxy. */
    arms: z.int().min(0).max(8),
    /** Turns of the logarithmic spiral across the radius. */
    armTwist: z.number().min(0).max(3),
    armSpread: z.number().min(0).max(1),
    bulgeRadiusLy: z.number().min(0),
    /** Capped further by the quality setting (rendering.md §13). */
    starPoints: z.int().min(1_000).max(50_000),
    colors: z.object({ core: HexColor, arm: HexColor, dust: HexColor }),
  })
  .partial();
export type GalaxySettings = z.infer<typeof GalaxySettings>;

/** A reference image under the galaxy, for tracing positions in edit mode (G1). */
export const Underlay = z.object({
  /** The world width the image spans. */
  widthLy: z.number().positive(),
  rotationDeg: z.number(),
  offsetX: z.number(),
  offsetZ: z.number(),
  opacity: z.number().min(0).max(1),
  visible: z.boolean(),
});
export type Underlay = z.infer<typeof Underlay>;
