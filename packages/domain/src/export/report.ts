import { z } from 'zod';

/**
 * What an import did, or would do (M7-T4): `POST /universes/{id}/import` returns it, and with
 * `dryRun` it's the report the settings page shows before the owner confirms.
 */

export const IMPORT_MODES = ['create', 'merge'] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const ImportCounts = z.object({
  create: z.int().nonnegative(),
  update: z.int().nonnegative(),
  /** Already there and left as it is: an asset with the same hash, a setting with that name. */
  keep: z.int().nonnegative(),
  /** Not imported: in a merge, an entry without an external key. */
  skip: z.int().nonnegative(),
});
export type ImportCounts = z.infer<typeof ImportCounts>;

export const ImportFinding = z.object({
  /** Where in the file: "maps/main.json › objects › gudrun", or "line 12". */
  where: z.string(),
  message: z.string(),
});
export type ImportFinding = z.infer<typeof ImportFinding>;

export const ImportReport = z.object({
  dryRun: z.boolean(),
  mode: z.enum(IMPORT_MODES),
  /** The change batch, for undo; null for a dry run. */
  batchId: z.uuid().nullable(),
  /** Per kind of record (universe, assets, groupTypes, maps, objects, relations…). */
  counts: z.record(z.string(), ImportCounts),
  /** What can't be imported as it stands, such as a key already used on the map. */
  conflicts: z.array(ImportFinding),
  /** References to nothing in the file or the universe. */
  unresolved: z.array(ImportFinding),
  /** Left out, and why. */
  skipped: z.array(ImportFinding),
  /** Worth knowing but harmless, such as an image without its file. */
  notes: z.array(ImportFinding),
  /** Conflicts or unresolved references stop the import: nothing is written. */
  blocked: z.boolean(),
});
export type ImportReport = z.infer<typeof ImportReport>;
