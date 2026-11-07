/**
 * Who sees what (ux.md §6). Spoilers are hidden by default; the reader can reveal everything
 * with the global toggle (`showAll`), or one item at a time by clicking it (`revealed`), until
 * the page reloads. Edit mode uses SHOW_ALL.
 */
export interface SpoilerPolicy {
  showAll: boolean;
  /** Keys of the items revealed one at a time; see `spoilerKeys`. */
  revealed: ReadonlySet<string>;
}

export const HIDE_SPOILERS: SpoilerPolicy = Object.freeze({
  showAll: false,
  revealed: new Set<string>(),
});

export const SHOW_SPOILERS: SpoilerPolicy = Object.freeze({
  showAll: true,
  revealed: new Set<string>(),
});

/** True when a flagged item stays hidden under the policy. Unflagged items are never hidden. */
export function isHidden(flagged: boolean, key: string, policy: SpoilerPolicy): boolean {
  return flagged && !policy.showAll && !policy.revealed.has(key);
}

/**
 * The key of every revealable item, built in one place so the server, the panel, the 3D labels
 * and the per-item reveal clicks all agree.
 */
export const spoilerKeys = {
  /** A whole entity, map or universe. */
  record: (id: string) => id,
  /** A text field of a record: `name`, `summary`, `description`, … */
  field: (ownerKey: string, field: string) => `${ownerKey}/${field}`,
  /** The n-th inline spoiler (0-based) inside a text field. */
  inline: (fieldKey: string, index: number) => `${fieldKey}#${String(index)}`,
  image: (entityId: string, assetId: string, role: string) =>
    `${entityId}/image/${assetId}/${role}`,
  link: (entityId: string, linkId: string) => `${entityId}/link/${linkId}`,
  fact: (entityId: string, fieldDefinitionId: string) => `${entityId}/fact/${fieldDefinitionId}`,
  relation: (relationId: string) => `relation/${relationId}`,
  member: (groupId: string, objectId: string) => `${groupId}/member/${objectId}`,
  location: (entityId: string) => `${entityId}/location`,
} as const;
