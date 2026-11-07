import { z } from 'zod';
import { HexColor } from '../colors.ts';
import { VIEW_LEVELS } from '../registry/view-levels.ts';

/**
 * How an object looks (data-model §4). Stored as sparse overrides: every field is optional,
 * and missing ones fall back to the subtype's defaults, then the base type's
 * (`resolveAppearance`, data-model §6).
 */

/** One value per view level, any of them optional: `{ galaxy: 2, orbit: 0.5 }`. */
export const perView = <T extends z.ZodType>(value: T) =>
  z.partialRecord(z.enum(VIEW_LEVELS), value);

export const PLANET_PRESETS = [
  'barren',
  'desert',
  'ice',
  'ocean',
  'jungle',
  'lava',
  'toxic',
  'gas_giant',
  'city',
  'forge',
] as const;

export const PlanetAppearance = z
  .object({
    preset: z.enum(PLANET_PRESETS),
    seed: z.int(),
    /** Overrides the preset's color stops. */
    palette: z.array(HexColor).min(2).max(6),
    seaLevel: z.number().min(0).max(1),
    /** 'upload' uses the entity image with role 'surface_texture'. */
    texture: z.enum(['preset', 'upload']),
    axialTiltDeg: z.number().min(-90).max(90),
    atmosphere: z
      .object({ enabled: z.boolean(), color: HexColor, thickness: z.number().min(0).max(0.3) })
      .partial(),
    clouds: z
      .object({ enabled: z.boolean(), coverage: z.number().min(0).max(1), color: HexColor })
      .partial(),
    rings: z
      .object({
        enabled: z.boolean(),
        /** In body radii. */
        innerRadius: z.number().min(1),
        outerRadius: z.number().min(1),
        color: HexColor,
        opacity: z.number().min(0).max(1),
        tiltDeg: z.number(),
      })
      .partial(),
    nightLights: z
      .object({ enabled: z.boolean(), color: HexColor, intensity: z.number().min(0).max(2) })
      .partial(),
  })
  .partial();
export type PlanetAppearance = z.infer<typeof PlanetAppearance>;

export const Appearance = z
  .object({
    /** Body color in the galaxy and system views. */
    color: HexColor,
    /** Multiplies the base type's default size, per view (U3). */
    scale: perView(z.number().min(0.05).max(20)),
    /** Higher wins when labels collide (0–10). */
    labelPriority: z.int().min(0).max(10),
    /** Draw this object's orbit ring in the system view. */
    showOrbit: z.boolean(),
    star: z
      .object({ temperatureK: z.number().min(1_500).max(50_000), glow: z.number().min(0).max(3) })
      .partial(),
    /** Planets and moons. */
    planet: PlanetAppearance,
    /** Nebulae and anomalies. */
    region: z
      .object({
        /** In the parent frame's unit: light-years in the galaxy. */
        radius: z.number().positive(),
        shape: z.enum(['sphere', 'disc']),
        density: z.number().min(0).max(1),
        color: HexColor,
      })
      .partial(),
  })
  .partial();
export type Appearance = z.infer<typeof Appearance>;
