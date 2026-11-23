import { unwrap } from '@ge/api-client';
import { entityKinds, rt, type EntityKind } from '@ge/domain';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '@/api/client.ts';
import { showEntity } from '@/state/show-entity.ts';
import { AnyEntityPicker } from '../people-picker/any-entity-picker.tsx';
import type { PanelEntity } from '../types.ts';
import { RelationItem, type RelationWording } from './relation-item.tsx';
import {
  addRelation,
  removeRelation,
  updateRelation,
  type RelationRead,
} from './relation-writes.ts';

const WORDING: RelationWording = {
  rolePlaceholder: 'How they’re related, such as “Travelled it”',
  spoilerText: 'The link is a spoiler',
  spoilerLabel: (name) => `The link to ${name} is a spoiler`,
};

/**
 * "Related to" in edit mode: the entity's untyped relations, either way round (`related` is
 * symmetric), each with its role, spoiler switch and remove button, then a picker over the
 * whole universe to add one. Anything can relate to anything (relation-types.ts), across maps:
 * a person to a route, an event to a system. Each change is one step in the history.
 */
export function RelatedEditor({
  entity,
  kind,
  relations,
}: {
  entity: PanelEntity;
  kind: EntityKind;
  relations: readonly RelationRead[];
}) {
  const queryClient = useQueryClient();
  const name = entity.namePlain;
  const kindsOf = (relation: RelationRead) => [kind, relation.other.kind];
  // Not offered: this entry, and what it's already related to either way round.
  const exclude = new Set([entity.id, ...relations.map((relation) => relation.other.id)]);
  return (
    <>
      {relations.length > 0 && (
        <ul className="flex flex-col gap-2 text-sm">
          {relations.map((relation) => {
            const otherName = relation.other.namePlain;
            const what = `the link between “${name}” and “${otherName}”`;
            return (
              <RelationItem
                key={relation.id}
                relation={relation}
                editing
                wording={WORDING}
                detail={entityKinds[relation.other.kind].label.one.toLowerCase()}
                onOpen={() => {
                  void openOther(relation.other);
                }}
                onRole={(text) =>
                  void updateRelation(
                    queryClient,
                    relation,
                    kindsOf(relation),
                    { role: text === '' ? null : rt.plain(text) },
                    `Edit ${what}`,
                  )
                }
                onSpoiler={(isSpoiler) =>
                  void updateRelation(
                    queryClient,
                    relation,
                    kindsOf(relation),
                    { isSpoiler },
                    `Edit ${what}`,
                  )
                }
                onRemove={() =>
                  void removeRelation(queryClient, relation, kindsOf(relation), `Remove ${what}`)
                }
              />
            );
          })}
        </ul>
      )}
      <div className="mt-2">
        <AnyEntityPicker
          universeId={entity.universeId}
          exclude={exclude}
          label="Add to Related to"
          onPick={(other) =>
            void addRelation(
              queryClient,
              { type: 'related', fromId: entity.id, toId: other.id, kinds: [kind, other.kind] },
              `Relate “${name}” to “${other.name}”`,
            )
          }
        />
      </div>
    </>
  );
}

/**
 * Opens the other end where it's shown (state/show-entity.ts). An object's view is its
 * parent's, which the relation doesn't carry, so it's looked up first.
 */
async function openOther(other: RelationRead['other']): Promise<void> {
  const parentId =
    other.kind === 'celestial_object'
      ? (await unwrap(api.GET('/api/v1/objects/{id}', { params: { path: { id: other.id } } })))
          .parentId
      : null;
  showEntity({ id: other.id, kind: other.kind, mapId: other.mapId, parentId });
}
