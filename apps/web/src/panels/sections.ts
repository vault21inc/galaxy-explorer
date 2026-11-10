import { entityKinds, type EntityInclude, type EntityKind, type EntityKindDef } from '@ge/domain';
import type { ComponentType } from 'react';
import { EntityForm } from './entity-form/entity-form.tsx';
import { FactsSection } from './sections/facts-section.tsx';
import { HeaderSection } from './sections/header-section.tsx';
import { ImagesSection } from './images/images-section.tsx';
import { LinksSection } from './sections/links-section.tsx';
import { MembersSection } from './sections/members-section.tsx';
import { NestingSection } from './sections/nesting-section.tsx';
import { RelationsSection } from './sections/relations-section.tsx';
import { textSection } from './sections/text-section.tsx';
import type { SectionProps } from './types.ts';

/**
 * The panel-sections registry (architecture.md §3.5): the info panel's sections in order, and
 * which kinds show each. A kind shows an aspect's section only if the entity-kinds registry
 * says it has that aspect, so a new kind gets the right panel with no code here. Location
 * joins in M6.
 *
 * In edit mode the generated form (M3-T4) takes the place of the name and text sections.
 */
export interface SectionDef {
  id: string;
  component: ComponentType<SectionProps>;
  /** The aspect the section needs loaded with the entity, if any. */
  include?: EntityInclude;
  appliesTo: (kind: EntityKindDef) => boolean;
  /** Shown only when reading ('view') or only in edit mode ('edit'); both by default. */
  mode?: 'view' | 'edit';
}

const always = () => true;

export const PANEL_SECTIONS: readonly SectionDef[] = [
  { id: 'form', component: EntityForm, appliesTo: always, mode: 'edit' },
  { id: 'header', component: HeaderSection, appliesTo: always, mode: 'view' },
  {
    id: 'summary',
    component: textSection('summary', 'text-foreground/90'),
    appliesTo: always,
    mode: 'view',
  },
  { id: 'description', component: textSection('description'), appliesTo: always, mode: 'view' },
  {
    id: 'members',
    component: MembersSection,
    include: 'members',
    appliesTo: (kind) => kind.aspects.members,
  },
  // Groups nest (data-model §3.3): where this one sits, and what sits inside it.
  { id: 'nesting', component: NestingSection, appliesTo: (kind) => kind.aspects.members },
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

/** A kind's sections, all of them or only those for reading or editing. */
export function sectionsFor(kind: EntityKind, mode?: 'view' | 'edit'): readonly SectionDef[] {
  const def: EntityKindDef = entityKinds[kind];
  return PANEL_SECTIONS.filter(
    (section) =>
      section.appliesTo(def) &&
      (mode === undefined || section.mode === undefined || section.mode === mode),
  );
}

/** The aspects to `include` when loading an entity for its panel. */
export function includesFor(kind: EntityKind): EntityInclude[] {
  return sectionsFor(kind).flatMap((section) => (section.include ? [section.include] : []));
}
