import { isHidden, redactionBar, spoilerKeys, type RichText, type SpoilerPolicy } from '@ge/domain';

/**
 * A universe's or map's name as the switchers show it (ux.md §6): a redaction bar when the
 * whole record or its name is a hidden potential spoiler, such as a map set after a twist.
 */
export function containerName(
  record: { id: string; namePlain: string; name: RichText; isSpoiler?: boolean },
  policy: SpoilerPolicy,
): string {
  const key = spoilerKeys.record(record.id);
  const hidden =
    isHidden(record.isSpoiler ?? false, key, policy) ||
    isHidden(record.name.spoiler, spoilerKeys.field(key, 'name'), policy);
  return hidden ? redactionBar(record.namePlain) : record.namePlain;
}
