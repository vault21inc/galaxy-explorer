import type { HexColor } from '../colors.ts';

/**
 * A star's color from its surface temperature (rendering.md §7): the color of a black body at
 * that temperature, as sRGB, white at about 6,500 K. Cool stars are orange-red, the Sun
 * (5,800 K) a warm white, hot stars blue-white.
 *
 * The table samples Tanner Helland's widely used fit to the blackbody curve, every 500 K up to
 * 10,000 K and more sparsely above, where the color hardly changes; between samples the color
 * is interpolated linearly. Temperatures outside the table take its first or last color.
 */
const TABLE: readonly (readonly [number, string])[] = [
  [1_500, '#ff6c00'],
  [2_000, '#ff890e'],
  [2_500, '#ff9f46'],
  [3_000, '#ffb16e'],
  [3_500, '#ffc18d'],
  [4_000, '#ffcea6'],
  [4_500, '#ffdabb'],
  [5_000, '#ffe4ce'],
  [5_500, '#ffedde'],
  [6_000, '#fff6ed'],
  [6_500, '#fffefa'],
  [7_000, '#f3f2ff'],
  [7_500, '#e6ebff'],
  [8_000, '#dde6ff'],
  [8_500, '#d7e2ff'],
  [9_000, '#d2dfff'],
  [9_500, '#cddcff'],
  [10_000, '#cadaff'],
  [11_000, '#c4d6ff'],
  [12_000, '#bfd3ff'],
  [13_000, '#bbd1ff'],
  [14_000, '#b8cfff'],
  [15_000, '#b5cdff'],
  [16_000, '#b3cbff'],
  [17_000, '#b0caff'],
  [18_000, '#aec9ff'],
  [19_000, '#acc7ff'],
  [20_000, '#abc6ff'],
  [22_000, '#a8c4ff'],
  [25_000, '#a4c2ff'],
  [30_000, '#9fbeff'],
  [35_000, '#9bbcff'],
  [40_000, '#98baff'],
  [45_000, '#95b8ff'],
  [50_000, '#93b6ff'],
];

export function blackbodyColor(temperatureK: number): HexColor {
  const first = TABLE[0];
  const last = TABLE[TABLE.length - 1];
  if (!first || !last) throw new Error('Empty blackbody table');
  if (temperatureK <= first[0]) return first[1] as HexColor;
  if (temperatureK >= last[0]) return last[1] as HexColor;
  const upper = TABLE.findIndex(([kelvin]) => kelvin >= temperatureK);
  const [lowK, lowHex] = TABLE[upper - 1] ?? first;
  const [highK, highHex] = TABLE[upper] ?? last;
  const t = (temperatureK - lowK) / (highK - lowK);
  const low = channels(lowHex);
  const high = channels(highHex);
  const mixed = low.map((value, index) => Math.round(value + ((high[index] ?? value) - value) * t));
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}` as HexColor;
}

function channels(hex: string): number[] {
  return [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}
