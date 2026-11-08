import { redactionBar } from '@ge/domain';
import type { SpoilerPolicy } from '../bodies/body-buffers.ts';

/** What a label needs from a view item's name (architecture.md §6). */
export interface Nameable {
  namePlain: string;
  /** The name with every spoiler, whole or inline, blacked out. */
  nameRedacted: string;
  /** The whole item is a potential spoiler. */
  isSpoiler: boolean;
}

/**
 * A label's text under the spoiler policy (rendering.md §11, ux.md §6): the plain name when
 * spoilers are shown; otherwise the redacted name, and for a whole hidden item, a redaction bar
 * about as long as its name.
 */
export function labelText(item: Nameable, policy: SpoilerPolicy): string {
  if (policy.showSpoilers) return item.namePlain;
  if (item.isSpoiler) return redactionBar(item.namePlain);
  return item.nameRedacted;
}
