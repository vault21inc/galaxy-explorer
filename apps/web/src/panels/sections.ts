import { entityKinds, type EntityInclude, type EntityKind, type EntityKindDef } from '@ge/domain';
import type { ComponentType } from 'react';
import { FactsSection } from './sections/facts-section.tsx';
import { HeaderSection } from './sections/header-section.tsx';
import { ImagesSection } from './sections/images-section.tsx';
import { LinksSection } from './sections/links-section.tsx';
import { PositionSection } from './sections/position-section.tsx';
import { RelationsSection } from './sections/relations-section.tsx';
import { textSection } from './sections/text-section.tsx';
import type { SectionProps } from './types.ts';

/**
 * The panel-sections registry (architecture.md §3.5): the info panel's sections in order, and
 * which kinds show each. A kind shows an aspect's section only if the entity-kinds registry
 * says it has that aspect, so a new kind gets the right panel with no code here. Members,
 * location and history join in M4, M6 and M3.
 */
export interface SectionDef {
  id: string;
  component: ComponentType<SectionProps>;
  /** The aspect the section needs loaded with the entity, if any. */
  include?: EntityInclude;
  appliesTo: (kind: EntityKindDef) => boolean;
}

const always = () => true;

export const PANEL_SECTIONS: readonly SectionDef[] = [
  { id: 'header', component: HeaderSection, appliesTo: always },
  {
    id: 'position',
    component: PositionSection,
    // Kinds placed by coordinates: their extension has x, y and z (objects).
    appliesTo: (kind) => kind.extension !== null && 'x' in kind.extension.shape,
  },
  { id: 'summary', component: textSection('summary', 'text-foreground/90'), appliesTo: always },
  { id: 'description', component: textSection('description'), appliesTo: always },
  {
    id: 'images',
    component: ImagesSection,
    include: 'images',
    appliesTo: (kind) => kind.aspects.images,
  },
  {
    id: 'facts',
    component: FactsSection,
    include: 'facts',
    appliesTo: (kind) => kind.aspects.facts,
  },
  {
    id: 'links',
    component: LinksSection,
    include: 'links',
    appliesTo: (kind) => kind.aspects.links,
  },
  {
    id: 'relations',
    component: RelationsSection,
    include: 'relations',
    appliesTo: (kind) => kind.aspects.relations,
  },
];

export function sectionsFor(kind: EntityKind): readonly SectionDef[] {
  const def: EntityKindDef = entityKinds[kind];
  return PANEL_SECTIONS.filter((section) => section.appliesTo(def));
}

/** The aspects to `include` when loading an entity for its panel. */
export function includesFor(kind: EntityKind): EntityInclude[] {
  return sectionsFor(kind).flatMap((section) => (section.include ? [section.include] : []));
}
