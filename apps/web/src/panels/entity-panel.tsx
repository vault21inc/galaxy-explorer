import type { EntityKind } from '@ge/domain';
import { useConfigList, useEntity } from '@/api/hooks.ts';
import { errorMessage } from '@/app/route-states.tsx';
import { EntityDetails } from './entity-details.tsx';
import { includesFor } from './sections.ts';
import type { PanelEntity } from './types.ts';

/**
 * Loads an entity with the aspects its sections need, plus the universe's field definitions
 * and subtypes for their labels, and shows its details. Content arrives with its spoiler flags
 * (`spoilers=include`) and is blacked out here, so toggling spoilers needs no refetch
 * (architecture.md §10).
 */
export function EntityPanel({
  kind,
  id,
  universeId,
}: {
  kind: EntityKind;
  id: string;
  universeId: string;
}) {
  const entity = useEntity(kind, id, { include: includesFor(kind) });
  const fieldDefinitions = useConfigList('field_definitions', universeId);
  const subtypes = useConfigList('object_subtypes', universeId);

  if (entity.error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {errorMessage(entity.error)}
      </p>
    );
  }
  if (!entity.data) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading…
      </p>
    );
  }
  return (
    <EntityDetails
      kind={kind}
      entity={entity.data as PanelEntity}
      fieldDefinitions={fieldDefinitions.data ?? []}
      subtypes={subtypes.data ?? []}
    />
  );
}
