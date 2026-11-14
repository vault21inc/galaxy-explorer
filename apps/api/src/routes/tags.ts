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
    { name: 'assets', description: 'Uploading images, and the universe’s image library.' },
    {
      name: 'icons',
      description:
        'The bundled icon sets for event categories and pins: Lucide and game-icons.net (M6-T4).',
    },
    { name: 'links', description: 'Web links attached to an entity.' },
    { name: 'citations', description: 'Where an entity’s filled-in content came from (M7-T3).' },
    {
      name: 'wiki',
      description: 'Searching and reading configured wikis, for “Fill from wiki” (M7-T3).',
    },
    { name: 'facts', description: "Values of the universe's custom fields, such as Population." },
    {
      name: 'relations',
      description: 'How entities relate, such as a character involved in an event.',
    },
    { name: 'locations', description: 'Where a place or event is.' },
    { name: 'batch', description: 'Many operations in one transaction and one undo step.' },
    { name: 'search', description: 'Full-text search over a universe’s entries (M7-T6).' },
    {
      name: 'exchange',
      description:
        'Import and export: a universe or map as a zip, and CSV import of objects (M7-T4).',
    },
    { name: 'history', description: 'Every change, what it did, and undo and redo.' },
    { name: 'views', description: 'Render-ready payloads for the galaxy, system and orbit views.' },
  ];
}
