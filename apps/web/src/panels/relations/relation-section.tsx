import {
  entityKinds,
  relationTypes,
  rt,
  spoilerKeys,
  toPlainText,
  type EntityKind,
  type RelationType,
} from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import type { ComponentType } from 'react';
import { Button } from '@/components/ui/button.tsx';
import { Switch } from '@/components/ui/switch.tsx';
import { Redactable } from '@/richtext/redactable.tsx';
import { RichTextView } from '@/richtext/rich-text-view.tsx';
import { useEditor } from '@/state/editor.ts';
import { useNavigation } from '@/state/navigation.ts';
import { useSelection } from '@/state/selection.ts';
import { INPUT_CLASS } from '../entity-form/fields/field-row.tsx';
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

function RelationItem({
  relation,
  editing,
  onRole,
  onSpoiler,
  onRemove,
}: {
  relation: RelationRead;
  editing: boolean;
  onRole: (text: string) => void;
  onSpoiler: (isSpoiler: boolean) => void;
  onRemove: () => void;
}) {
  const key = spoilerKeys.relation(relation.id);
  const { other } = relation;
  const roleText = relation.role ? toPlainText(relation.role) : '';
  const nameButton = (
    <button
      type="button"
      className="text-left font-medium hover:text-primary hover:underline"
      onClick={() => {
        open(relation);
      }}
    >
      <Redactable
        flagged={other.isSpoiler || other.nameSpoiler}
        revealKey={spoilerKeys.record(other.id)}
        hiddenText={other.namePlain}
      >
        <span>{other.namePlain}</span>
      </Redactable>
    </button>
  );
  if (editing) {
    return (
      <li className="flex flex-col gap-1 rounded border p-2">
        <div className="flex items-center justify-between gap-2">
          {nameButton}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${other.namePlain}`}
            onClick={onRemove}
          >
            <X aria-hidden />
          </Button>
        </div>
        <input
          // Remounted with each saved role, which replaces what's typed.
          key={roleText}
          aria-label={`Role of ${other.namePlain}`}
          placeholder="Role, such as “Inquisitor leading the hunt”"
          defaultValue={roleText}
          className={INPUT_CLASS}
          onBlur={(event) => {
            const next = event.currentTarget.value.trim();
            if (next !== roleText) onRole(next);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Switch
            checked={relation.isSpoiler}
            aria-label={`${other.namePlain}’s part is a spoiler`}
            onCheckedChange={onSpoiler}
          />
          Their part is a spoiler
        </label>
      </li>
    );
  }
  return (
    <li>
      <Redactable flagged={relation.isSpoiler} revealKey={key} hiddenText={other.namePlain}>
        {nameButton}
        {other.dateText && <span className="text-muted-foreground"> · {other.dateText}</span>}
        {relation.role && (
          <span className="block text-muted-foreground">
            <RichTextView value={relation.role} fieldKey={`${key}/role`} inline />
          </span>
        )}
      </Redactable>
    </li>
  );
}
