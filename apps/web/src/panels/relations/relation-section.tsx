import { entityKinds, relationTypes, rt, type EntityKind, type RelationType } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import type { ComponentType } from 'react';
import { useEditor } from '@/state/editor.ts';
import { useNavigation } from '@/state/navigation.ts';
import { useSelection } from '@/state/selection.ts';
import { EntityPicker, type PickerScope } from '../people-picker/entity-picker.tsx';
import { SectionHeading } from '../sections/section-heading.tsx';
import type { PanelEntity, SectionProps } from '../types.ts';
import {
  addRelation,
  createAndRelate,
  removeRelation,
  updateRelation,
  type RelationRead,
} from './relation-writes.ts';
import { RelationItem, type RelationWording } from './relation-item.tsx';
import { goToLocated } from './shown-where.ts';

/** Which end of the relation the panel's entity is. */
export type RelationSide = 'from' | 'to';

/**
 * One relation type, seen from one end (M6-T6): an event's "People involved" (the `to` end of
 * `participant`), a character's "Involved in" (its `from` end). Made for each typed relation
 * in the registry (relation-sections.ts), so a new one needs no code here.
 *
 * - **Reading:** each entity at the other end, with its role. Map-scoped ones (events) are
 *   listed in date order (`dateSort`) with their date, and a click goes to them in the views
 *   (shown-where.ts); others (characters) open their panel. Hidden spoilers stay blacked out.
 * - **Editing:** the role as text, the part's spoiler flag and a remove button for each, and a
 *   search-or-create picker to add one.
 */
export function relationSection(
  type: RelationType,
  side: RelationSide,
  otherKind: EntityKind,
): ComponentType<SectionProps> {
  const def = relationTypes[type];
  const title = side === 'to' && 'inverseLabel' in def ? def.inverseLabel : def.label;
  const otherDef = entityKinds[otherKind];
  function RelationSection({ entity, kind }: SectionProps) {
    const editing = useEditor((state) => state.editing);
    const queryClient = useQueryClient();
    const currentMapId = useNavigation((state) => state.stack[0]?.subjectId);
    const mine = (entity.relations ?? [])
      .filter(
        (relation) =>
          relation.relationType === type &&
          (side === 'from'
            ? relation.fromEntityId === entity.id
            : relation.toEntityId === entity.id),
      )
      .toSorted(byDate);
    if (mine.length === 0 && !editing) return null;

    const kinds = [kind, otherKind];
    const name = entity.namePlain;
    const scope: PickerScope | undefined =
      otherDef.scope === 'universe'
        ? { universeId: entity.universeId }
        : (entity.mapId ?? currentMapId) !== undefined
          ? { mapId: entity.mapId ?? currentMapId ?? '' }
          : undefined;
    const ends = (otherId: string) =>
      side === 'from'
        ? { type, fromId: entity.id, toId: otherId, kinds }
        : { type, fromId: otherId, toId: entity.id, kinds };
    return (
      <section aria-label={title}>
        <SectionHeading>{title}</SectionHeading>
        <ul className="flex flex-col gap-2 text-sm">
          {mine.map((relation) => (
            <RelationItem
              key={relation.id}
              relation={relation}
              editing={editing}
              wording={WORDING}
              detail={editing ? undefined : relation.other.dateText}
              onOpen={() => {
                open(relation);
              }}
              onRole={(text) =>
                void updateRelation(
                  queryClient,
                  relation,
                  kinds,
                  { role: text === '' ? null : rt.plain(text) },
                  `Edit the part of “${relation.other.namePlain}” in “${partOf(relation, entity)}”`,
                )
              }
              onSpoiler={(isSpoiler) =>
                void updateRelation(
                  queryClient,
                  relation,
                  kinds,
                  { isSpoiler },
                  `Edit the part of “${relation.other.namePlain}” in “${partOf(relation, entity)}”`,
                )
              }
              onRemove={() =>
                void removeRelation(
                  queryClient,
                  relation,
                  kinds,
                  `Remove “${relation.other.namePlain}” from “${partOf(relation, entity)}”`,
                )
              }
            />
          ))}
        </ul>
        {editing && (
          <div className="mt-2">
            <EntityPicker
              kind={otherKind}
              scope={scope}
              exclude={new Set(mine.map((relation) => relation.other.id))}
              label={`Add to ${title}`}
              onPick={(other) =>
                void addRelation(
                  queryClient,
                  ends(other.id),
                  side === 'to'
                    ? `Add “${other.namePlain}” to “${name}”`
                    : `Add “${name}” to “${other.namePlain}”`,
                )
              }
              onCreate={(newName) => {
                if (!scope) return;
                void createAndRelate(queryClient, {
                  type,
                  kind: otherKind,
                  name: newName,
                  scope,
                  newEnd: side === 'to' ? 'from' : 'to',
                  otherId: entity.id,
                  otherKind: kind,
                });
              }}
            />
          </div>
        )}
      </section>
    );
  }
  RelationSection.displayName = `RelationSection(${type}, ${side})`;
  return RelationSection;
}

/** A typed relation's rows: a person's part in an event. */
const WORDING: RelationWording = {
  rolePlaceholder: 'Role, such as “Inquisitor leading the hunt”',
  spoilerText: 'Their part is a spoiler',
  spoilerLabel: (name) => `${name}’s part is a spoiler`,
};

/** By the other end's date (undated last), then the relation's own order. */
function byDate(a: RelationRead, b: RelationRead): number {
  const da = a.other.dateSort ?? Number.POSITIVE_INFINITY;
  const db = b.other.dateSort ?? Number.POSITIVE_INFINITY;
  return da === db ? a.sortKey - b.sortKey : da - db;
}

/** The event's name in a change's description, from either end. */
function partOf(relation: RelationRead, entity: PanelEntity): string {
  return relation.other.kind === 'event' ? relation.other.namePlain : entity.namePlain;
}

/** Opens the other end: an event in the views, a character's panel. */
function open(relation: RelationRead) {
  const { other } = relation;
  if (other.mapId !== null) {
    void goToLocated(other.id, other.mapId);
    return;
  }
  useSelection.getState().select([other.id]);
}
