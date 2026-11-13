import type { components } from '@ge/api-client';
import type { ConfigReadOf, EntityKind, EntityReadOf } from '@ge/domain';

/** An entity with the aspects the panel asked for (architecture.md §5 `include`). */
export type PanelEntity = EntityReadOf<EntityKind> & {
  facts?: components['schemas']['FactRead'][];
  links?: components['schemas']['LinkRead'][];
  relations?: components['schemas']['RelationRead'][];
  members?: components['schemas']['MemberRead'][];
  waypoints?: components['schemas']['WaypointRead'][];
  images?: components['schemas']['ImageRead'][];
  location?: components['schemas']['LocationRead'] | null;
  citations?: components['schemas']['CitationRead'][];
};

/** What every panel section gets. */
export interface SectionProps {
  kind: EntityKind;
  entity: PanelEntity;
  fieldDefinitions: readonly ConfigReadOf<'field_definitions'>[];
  subtypes: readonly ConfigReadOf<'object_subtypes'>[];
}
