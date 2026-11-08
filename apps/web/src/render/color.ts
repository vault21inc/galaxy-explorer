/**
 * Colors for shaders. Hex colors are written in sRGB, the encoding screens use, but lighting
 * and blending math must happen in linear light, where doubling a value doubles the
 * brightness. These are pure functions, so Web Workers and tests can use them without three.js.
 */

export type LinearRgb = [r: number, g: number, b: number];

/** `#rrggbb` (sRGB) to linear RGB, each from 0 to 1. */
export function hexToLinear(hex: string): LinearRgb {
  const value = Number.parseInt(hex.slice(1, 7), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) =>
    srgbToLinear(channel / 255),
  ) as LinearRgb;
}

/** The sRGB transfer function, inverted (IEC 61966-2-1). */
function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function mixRgb(a: LinearRgb, b: LinearRgb, t: number): LinearRgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
