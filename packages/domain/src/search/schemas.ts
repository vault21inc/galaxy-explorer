import { z } from 'zod';
import { Uuid } from '../ids.ts';
import { ENTITY_KINDS } from '../registry/entity-kinds.ts';

/** One search result (M7-T6): enough to name it, say where it is, and go there. */
export const SearchResult = z.object({
  id: Uuid,
  kind: z.enum(ENTITY_KINDS),
  /** Null for universe-scoped entries (characters). */
  mapId: Uuid.nullable(),
  /** An object's parent, which says which view shows it; null otherwise. */
  parentId: Uuid.nullable(),
  /** Plain text, blacked out when it's a hidden spoiler and spoilers are excluded. */
  name: z.string(),
  /** Where it is: its map's name, then the objects it's inside, outermost first. */
  path: z.array(z.string()),
  /** A short excerpt of its text around the match, from the public text when spoilers are excluded. */
  snippet: z.string(),
});
export type SearchResult = z.infer<typeof SearchResult>;
