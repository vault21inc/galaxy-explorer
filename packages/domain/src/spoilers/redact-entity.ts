import type { RichText } from '../richtext/schema.ts';
import { isHidden, spoilerKeys, type SpoilerPolicy } from './policy.ts';
import { redactionBar } from '../richtext/redaction-bar.ts';
import { blackedOut, redactOptionalRichText, syncPlainName } from './redact-rich-text.ts';

/**
 * Applies the spoiler policy to an entity as the API returns it, covering every flag in
 * data-model §7. The server uses it for `spoilers=exclude`; the browser can use it too.
 *
 * - **The whole entity** (`isSpoiler`, hidden): its texts are blacked out and every aspect item
 *   becomes a placeholder. Revealing the entity's key then applies the per-item flags below.
 * - **Text fields** (`name`, `summary`, `description`, captions, roles, text facts): see
 *   `redactRichText`.
 * - **Images, links, facts, relations, group memberships, the location:** a hidden item becomes
 *   a placeholder `{ redacted: true, … }` that keeps only what isn't secret, such as which
 *   fact it is (so the panel can show "Population: ▇▇▇") and its sort order. The secret
 *   parts (the image file, the URL, the value, who is involved, where) are gone.
 *
 * The input shapes below are the minimum this needs. The read schemas (M1-T6) are structurally
 * compatible, so their types pass straight in.
 */

export interface Redacted {
  readonly redacted: true;
}

interface Flagged {
  isSpoiler: boolean;
  sortKey?: number | string | null;
}

export interface RedactableImage extends Flagged {
  assetId: string;
  role: string;
  caption?: RichText | null;
}
export interface RedactableLink extends Flagged {
  id: string;
}
export interface RedactableFact extends Flagged {
  fieldDefinitionId: string;
  value: unknown;
}
export interface RedactableRelation extends Flagged {
  id: string;
  relationType: string;
  role?: RichText | null;
  /** The entity at the other end (RelationRead.other); its name follows its own flags. */
  other?: {
    id: string;
    namePlain: string;
    isSpoiler: boolean;
    nameSpoiler: boolean;
    dateText?: string | null;
  };
}
export interface RedactableMember extends Flagged {
  objectId: string;
}
export type RedactableLocation = Flagged;

export interface RedactableEntity {
  id: string;
  isSpoiler: boolean;
  name: RichText;
  summary?: RichText | null;
  description?: RichText | null;
  images?: readonly RedactableImage[];
  links?: readonly RedactableLink[];
  facts?: readonly RedactableFact[];
  relations?: readonly RedactableRelation[];
  members?: readonly RedactableMember[];
  location?: RedactableLocation | null;
}

/** A hidden item: only these fields survive. */
type Placeholder<T, K extends string> = Pick<T, Extract<K | 'isSpoiler' | 'sortKey', keyof T>> &
  Redacted;
type ItemOf<A> = A extends readonly (infer I)[] ? I : never;
type ListOf<A, K extends string> = (ItemOf<A> | Placeholder<ItemOf<A>, K>)[];

/** Fields whose type allows null, which a hidden entity's content fields are set to. */
type NullableKeys<E> = { [K in keyof E]-?: null extends E[K] ? K : never }[keyof E];

export type RedactedEntity<E extends RedactableEntity> = Omit<
  E,
  'images' | 'links' | 'facts' | 'relations' | 'members' | 'location'
> & {
  images?: ListOf<E['images'], 'role'>;
  links?: ListOf<E['links'], 'id'>;
  facts?: ListOf<E['facts'], 'fieldDefinitionId'>;
  relations?: ListOf<E['relations'], 'id' | 'relationType'>;
  members?: ListOf<E['members'], never>;
  location?: E['location'] | Placeholder<NonNullable<E['location']>, never>;
};

export interface RedactEntityOptions<E> {
  /**
   * Kind-specific fields that are content, such as an event's `dateText`. They're set to null
   * while the whole entity is hidden. The entity-kind registry (M1-T2) lists them per kind.
   */
  contentFields?: readonly NullableKeys<E>[];
}

export function redactEntity<E extends RedactableEntity>(
  entity: E,
  policy: SpoilerPolicy,
  options: RedactEntityOptions<E> = {},
): RedactedEntity<E> {
  const id = entity.id;
  const whole = isHidden(entity.isSpoiler, spoilerKeys.record(id), policy);
  const field = (name: string) => spoilerKeys.field(id, name);
  const hidden = (flagged: boolean, key: string) => whole || isHidden(flagged, key, policy);
  const text = <T extends RichText | null | undefined>(value: T, name: string): T =>
    whole && value ? (blackedOut(value) as T) : redactOptionalRichText(value, policy, field(name));

  const result = { ...entity } as Record<string, unknown>;
  result.name = text(entity.name, 'name');
  syncPlainName(result, entity.name);
  if ('summary' in entity) result.summary = text(entity.summary, 'summary');
  if ('description' in entity) result.description = text(entity.description, 'description');
  if (whole) for (const key of options.contentFields ?? []) result[key as string] = null;

  if (entity.images) {
    result.images = entity.images.map((image) => {
      const key = spoilerKeys.image(id, image.assetId, image.role);
      return hidden(image.isSpoiler, key)
        ? placeholder(image, ['role'])
        : { ...image, caption: redactOptionalRichText(image.caption, policy, `${key}/caption`) };
    });
  }
  if (entity.links) {
    result.links = entity.links.map((link) =>
      hidden(link.isSpoiler, spoilerKeys.link(id, link.id)) ? placeholder(link, ['id']) : link,
    );
  }
  if (entity.facts) {
    result.facts = entity.facts.map((fact) => {
      const key = spoilerKeys.fact(id, fact.fieldDefinitionId);
      if (hidden(fact.isSpoiler, key)) return placeholder(fact, ['fieldDefinitionId']);
      // Text facts may still hold inline spoilers.
      return isTextValue(fact.value)
        ? {
            ...fact,
            value: { ...fact.value, text: redactOptionalRichText(fact.value.text, policy, key) },
          }
        : fact;
    });
  }
  if (entity.relations) {
    result.relations = entity.relations.map((relation) => {
      const key = spoilerKeys.relation(relation.id);
      return hidden(relation.isSpoiler, key)
        ? placeholder(relation, ['id', 'relationType'])
        : {
            ...relation,
            role: redactOptionalRichText(relation.role, policy, `${key}/role`),
            ...(relation.other ? { other: redactRelationEnd(relation.other, policy) } : {}),
          };
    });
  }
  if (entity.members) {
    result.members = entity.members.map((member) =>
      hidden(member.isSpoiler, spoilerKeys.member(id, member.objectId))
        ? placeholder(member, [])
        : member,
    );
  }
  if (entity.location && hidden(entity.location.isSpoiler, spoilerKeys.location(id))) {
    result.location = placeholder(entity.location, []);
  }
  return result as RedactedEntity<E>;
}

/** Keeps `keep`, the spoiler flag and the sort key, and marks the item as redacted. */
function placeholder<T extends Flagged>(item: T, keep: readonly (keyof T)[]): Redacted {
  const kept: Record<string, unknown> = { redacted: true, isSpoiler: item.isSpoiler };
  if (item.sortKey !== undefined) kept.sortKey = item.sortKey;
  for (const key of keep) kept[key as string] = item[key];
  return kept as unknown as Redacted;
}

function isTextValue(value: unknown): value is { type: 'text'; text: RichText } {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { type?: unknown }).type === 'text' &&
    typeof (value as { text?: unknown }).text === 'object'
  );
}

/** A relation's other end with its name blacked out when that entity or its name is hidden. */
function redactRelationEnd<O extends NonNullable<RedactableRelation['other']>>(
  other: O,
  policy: SpoilerPolicy,
): O {
  const hiddenName = isHidden(
    other.isSpoiler || other.nameSpoiler,
    spoilerKeys.record(other.id),
    policy,
  );
  if (!hiddenName) return other;
  // A hidden event's date is part of it, as its own panel hides it (`contentFields`).
  const whole = isHidden(other.isSpoiler, spoilerKeys.record(other.id), policy);
  return {
    ...other,
    namePlain: redactionBar(other.namePlain),
    ...(whole && other.dateText !== undefined ? { dateText: null } : {}),
  };
}
