import { isHidden, redactionBar, spoilerKeys, type SpoilerPolicy } from '@ge/domain';

/** What a label needs from a view item's name (architecture.md §6). */
export interface Nameable {
  id: string;
  namePlain: string;
  /** The name with every spoiler, whole or inline, blacked out. */
  nameRedacted: string;
  /** The whole item is a potential spoiler. */
  isSpoiler: boolean;
  /** The whole name is a potential spoiler. */
  nameSpoiler: boolean;
}

/**
 * A label's text under the spoiler policy (rendering.md §11, ux.md §6):
 * - a whole hidden item: a redaction bar about as long as its name;
 * - spoilers shown, or the name revealed in the panel: the plain name;
 * - otherwise the redacted name, with inline spoilers blacked out.
 */
export function labelText(item: Nameable, policy: SpoilerPolicy): string {
  const record = spoilerKeys.record(item.id);
  if (isHidden(item.isSpoiler, record, policy)) return redactionBar(item.namePlain);
  if (policy.showAll || policy.revealed.has(spoilerKeys.field(record, 'name'))) {
    return item.namePlain;
  }
  if (isHidden(item.nameSpoiler, spoilerKeys.field(record, 'name'), policy)) {
    return redactionBar(item.namePlain);
  }
  return item.nameRedacted;
}
