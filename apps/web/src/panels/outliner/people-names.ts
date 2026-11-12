import { toPlainText } from '@ge/domain';
import type { EntityRead } from '@/api/hooks.ts';
import type { Person } from './outliner-tree.ts';

/**
 * The universe's characters, named as the outliner names view items: with their inline
 * spoilers blacked out (`nameRedacted`). Loaded on demand (outliner-slot.tsx): parsing rich
 * text needs the Markdown and HTML parsers, which the first visit shouldn't download.
 */
export function peopleOf(characters: readonly EntityRead<'character'>[]): Person[] {
  return characters.map((character) => ({
    id: character.id,
    namePlain: character.namePlain,
    nameRedacted: toPlainText(character.name, { redactSpoilers: true }),
    isSpoiler: character.isSpoiler,
    nameSpoiler: character.name.spoiler,
    status: character.status,
  }));
}
