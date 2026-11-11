import { createRequire } from 'node:module';
import {
  ICON_SETS,
  iconKey,
  parseIconKey,
  type IconSet,
  type IconSummary,
  type IconSvg,
} from '@ge/domain';

/**
 * The bundled icon sets (M6-T4, D-32), read once from their Iconify JSON packages: Lucide
 * (`@iconify-json/lucide`, ISC) and game-icons.net (`@iconify-json/game-icons`, CC BY 3.0).
 * The API serves them so the web app never downloads the 6 MB of the full sets: the picker
 * searches here, and a map fetches only the drawings of the icons its categories use.
 */
interface IconifyJson {
  icons: Record<string, { body: string; width?: number; height?: number }>;
  aliases?: Record<string, { parent: string }>;
  width?: number;
  height?: number;
}

const PACKAGES: Record<IconSet, string> = {
  lucide: '@iconify-json/lucide/icons.json',
  'game-icons': '@iconify-json/game-icons/icons.json',
};

const require = createRequire(import.meta.url);
const loaded = new Map<IconSet, IconifyJson>();

function setData(set: IconSet): IconifyJson {
  let data = loaded.get(set);
  if (!data) {
    data = require(PACKAGES[set]) as IconifyJson;
    loaded.set(set, data);
  }
  return data;
}

/** The names in a set, aliases included, sorted. */
const namesCache = new Map<IconSet, string[]>();
function namesOf(set: IconSet): string[] {
  let names = namesCache.get(set);
  if (!names) {
    const data = setData(set);
    names = [...Object.keys(data.icons), ...Object.keys(data.aliases ?? {})].sort();
    namesCache.set(set, names);
  }
  return names;
}

/**
 * Icons whose names contain every word of `query` (split on spaces and hyphens), best first:
 * an exact name, then names starting with the query, then the rest, alphabetically. An empty
 * query lists each set from the start.
 */
export function searchIcons(
  query: string,
  options: { sets?: readonly IconSet[]; limit: number },
): IconSummary[] {
  const words = query
    .toLowerCase()
    .split(/[\s-]+/)
    .filter(Boolean);
  const wanted = query.trim().toLowerCase().replace(/\s+/g, '-');
  const scored: { summary: IconSummary; rank: number }[] = [];
  for (const set of options.sets ?? ICON_SETS) {
    for (const name of namesOf(set)) {
      if (!words.every((word) => name.includes(word))) continue;
      const rank = name === wanted ? 0 : name.startsWith(wanted) ? 1 : 2;
      scored.push({ summary: { key: iconKey(set, name), set, name }, rank });
    }
  }
  scored.sort((a, b) => a.rank - b.rank || a.summary.name.localeCompare(b.summary.name));
  return scored.slice(0, options.limit).map((item) => item.summary);
}

/** The drawings of these keys, in their order; unknown keys are left out. */
export function iconDrawings(keys: readonly string[]): IconSvg[] {
  return keys.flatMap((key): IconSvg[] => {
    const { set, name } = parseIconKey(key);
    const data = setData(set);
    const target = data.icons[name] ?? data.icons[data.aliases?.[name]?.parent ?? ''];
    if (!target) return [];
    return [
      {
        key,
        body: target.body,
        width: target.width ?? data.width ?? 16,
        height: target.height ?? data.height ?? 16,
      },
    ];
  });
}
