import { z } from 'zod';

/**
 * Icons for event categories and pins (M6-T4, D-32): two bundled sets, chosen by the owner.
 * - **Lucide** (ISC): clean, generic UI icons, the ones the app's own buttons use.
 * - **game-icons.net** (CC BY 3.0): thousands of thematic icons, credited on the site.
 *
 * An icon is named by a key, `set:name`, such as `game-icons:crossed-swords` or `lucide:flag`.
 * A key without a set is Lucide's: the keys written before M6-T4 (`swords`, `flag`) stay valid.
 */
export const ICON_SETS = ['lucide', 'game-icons'] as const;
export type IconSet = (typeof ICON_SETS)[number];

export const ICON_SET_LABELS: Record<IconSet, string> = {
  lucide: 'Lucide',
  'game-icons': 'game-icons.net',
};

/** The credit each set asks for, shown in the app's help (CC BY 3.0 requires game-icons'). */
export const ICON_CREDITS: Record<IconSet, { text: string; url: string }> = {
  lucide: { text: 'Lucide icons (ISC licence)', url: 'https://lucide.dev' },
  'game-icons': {
    text: 'Icons by Lorc, Delapouite and contributors at game-icons.net (CC BY 3.0)',
    url: 'https://game-icons.net',
  },
};

const ICON_NAME = '[a-z0-9]+(?:-[a-z0-9]+)*';
export const ICON_KEY_PATTERN = new RegExp(`^(?:(?:${ICON_SETS.join('|')}):)?${ICON_NAME}$`);

export const IconKey = z
  .string()
  .max(100)
  .regex(ICON_KEY_PATTERN, 'An icon key is a set and a name, such as game-icons:crossed-swords.');

/** A key's set and name; a key without a set is Lucide's. */
export function parseIconKey(key: string): { set: IconSet; name: string } {
  const colon = key.indexOf(':');
  if (colon < 0) return { set: 'lucide', name: key };
  const set = key.slice(0, colon);
  const name = key.slice(colon + 1);
  return (ICON_SETS as readonly string[]).includes(set)
    ? { set: set as IconSet, name }
    : { set: 'lucide', name: key };
}

/** The canonical key, always with its set: `lucide:flag`. */
export function iconKey(set: IconSet, name: string): string {
  return `${set}:${name}`;
}

/** One search result: an icon to choose. */
export const IconSummary = z.object({ key: z.string(), set: z.enum(ICON_SETS), name: z.string() });
export type IconSummary = z.infer<typeof IconSummary>;

/**
 * An icon's drawing: the SVG body (paths, without the outer `<svg>`) in a `width` × `height`
 * view box. Its colors are `currentColor`, so whoever draws it picks the color.
 */
export const IconSvg = z.object({
  key: z.string(),
  body: z.string(),
  width: z.int().positive(),
  height: z.int().positive(),
});
export type IconSvg = z.infer<typeof IconSvg>;
