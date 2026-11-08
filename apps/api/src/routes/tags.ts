import { configResources, entityKinds } from '@ge/domain';

/** The OpenAPI tags, one per resource, with descriptions from the registries. */
export function openApiTags(): { name: string; description: string }[] {
  return [
    { name: 'health', description: 'Is the API up, and can it reach its database?' },
    { name: 'universes', description: 'Fictional settings; everything else lives inside one.' },
    { name: 'maps', description: 'One galaxy at one point in time.' },
    ...Object.values(entityKinds).map((kind) => ({
      name: kind.plural,
      description: kind.description,
    })),
    ...Object.values(configResources).map((resource) => ({
      name: resource.plural,
      description: resource.description,
    })),
    { name: 'images', description: 'Uploaded images attached to an entity.' },
    { name: 'links', description: 'Web links attached to an entity.' },
    { name: 'facts', description: "Values of the universe's custom fields, such as Population." },
    {
      name: 'relations',
      description: 'How entities relate, such as a character involved in an event.',
    },
    { name: 'locations', description: 'Where a place or event is.' },
  ];
}
