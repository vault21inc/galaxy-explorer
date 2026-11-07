/**
 * The Drizzle table definitions (data-model §3). drizzle-kit reads this file to generate
 * migrations (`pnpm db:generate`), and `createDatabase` passes it to Drizzle for typed
 * queries. Column names are camelCase here and snake_case in the database.
 *
 * Foreign keys are in SQL at the end of each migration, not here: see migrations/README.md.
 * Routes, route waypoints and citations arrive in M4 and M7; the auth tables in M8.
 */
export { entityImages, entityLinks, entityRelations, fieldValues } from './aspects.ts';
export { assets } from './assets.ts';
export { maps, universes } from './containers.ts';
export {
  celestialObjects,
  entities,
  entityLocations,
  events,
  groupMembers,
  objectGroups,
} from './entities.ts';
export { changeBatches, changeLog } from './history.ts';
export { eventCategories, fieldDefinitions, groupTypes, objectSubtypes } from './settings.ts';
