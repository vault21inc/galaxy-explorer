import { schema, withBatch, type Actor, type Database, type Executor } from '@ge/db';
import {
  CONFIG_RESOURCES,
  configLabelOf,
  type ConfigResource,
  type ExportAsset,
  type ImportMode,
  type ImportReport,
} from '@ge/domain';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { listConfig } from '../services/config-service.ts';
import { listMaps } from '../services/container-service.ts';
import { ImportBlocked, InvalidRequest, NotFound } from '../services/errors.ts';
import { requireMap, requireUniverse } from '../services/lookup.ts';
import { SEES_EVERYTHING } from '../services/visibility.ts';
import type { BlobStore } from '../storage/blob-store.ts';
import { ConfigRefs, EntityRefs, ImportRun, type Resolvers } from './import-context.ts';
import {
  importAspects,
  importEntities,
  importMemberships,
  importRelations,
} from './import-entities.ts';
import { readUpload, type ImportContent } from './import-read.ts';
import { importAssets, importConfig, importMap, importUniverseFields } from './import-settings.ts';

/**
 * `POST /universes/{id}/import` (M7-T4): an export's zip or a CSV of objects, imported as one
 * change batch, so one undo takes it all back.
 *
 * - **create** adds everything as new entries. A key or map slug already used is a conflict.
 * - **merge** updates entries by their external key and adds the rest; entries without a key
 *   are left out (they can't be matched).
 *
 * Settings rows, assets and maps are matched by name, hash and slug in both modes. A dry run
 * does everything and reports it, then rolls back. A real import with conflicts or references
 * to nothing rolls back too, and answers 409 with the report.
 */

export interface ImportOptions {
  filename: string;
  mode: ImportMode;
  dryRun: boolean;
  /** For a CSV: the map its objects go on. */
  mapId?: string;
}

/** Ends the transaction without keeping anything: a dry run, or a blocked import. */
class Rollback extends Error {}

export async function importUpload(
  db: Database,
  store: BlobStore,
  actor: Actor,
  universeId: string,
  data: Uint8Array,
  options: ImportOptions,
): Promise<ImportReport> {
  await requireUniverse(db, universeId);
  const content = readUpload(data);
  if (content.scope === 'csv' && !options.mapId) {
    throw new InvalidRequest('Say which map the CSV’s objects go on (mapId).');
  }
  const run = new ImportRun(options.mode, options.dryRun);
  const description = `Import ${options.filename}`.slice(0, 200);
  try {
    const { batchId } = await withBatch(
      db,
      actor,
      description,
      async (tx) => {
        await importContent(tx, store, run, universeId, content, options.mapId);
        if (run.dryRun || run.report.blocked) throw new Rollback();
      },
      { universeId },
    );
    return { ...run.report, batchId };
  } catch (error) {
    // Image files a failed or dry import wrote don't belong to anything.
    await Promise.all(run.written.map((key) => store.delete(key)));
    if (!(error instanceof Rollback)) throw error;
    if (run.report.blocked && !run.dryRun) throw new ImportBlocked(run.report);
    return run.report;
  }
}

async function importContent(
  tx: Executor,
  store: BlobStore,
  run: ImportRun,
  universeId: string,
  content: ImportContent,
  csvMapId: string | undefined,
): Promise<void> {
  const existingConfig = new Map<ConfigResource, Record<string, unknown>[]>();
  const labels = new Map<ConfigResource, Map<string, string[]>>();
  for (const resource of CONFIG_RESOURCES) {
    const rows = (await listConfig(tx, resource, universeId, { limit: Number.MAX_SAFE_INTEGER }))
      .items as Record<string, unknown>[];
    existingConfig.set(resource, rows);
    const byLabel = new Map<string, string[]>();
    for (const row of rows) {
      const label = String(row[configLabelOf(resource)]);
      byLabel.set(label, [...(byLabel.get(label) ?? []), row.id as string]);
    }
    labels.set(resource, byLabel);
  }
  const assets = await tx
    .select({ id: schema.assets.id, sha256: schema.assets.sha256 })
    .from(schema.assets)
    .where(eq(schema.assets.universeId, universeId));
  const universeRefs = new EntityRefs(await keysIn(tx, universeId, null));
  const resolvers: Resolvers = {
    entities: universeRefs,
    config: new ConfigRefs(labels),
    assets: new Map(assets.map((asset) => [asset.sha256, asset.id])),
  };

  // ---- the universe's own fields, assets and settings ----------------------------------------
  const universe = content.universe;
  if (universe) {
    if (content.scope === 'universe') {
      await importUniverseFields(tx, run, universeId, universe.universe as Record<string, unknown>);
    }
    await importAssets(
      tx,
      store,
      run,
      universeId,
      (universe.assets ?? []) as ExportAsset[],
      content.files,
      resolvers,
    );
    await importConfig(tx, run, universeId, universe, existingConfig, resolvers);
  }

  // ---- universe-scoped entities (characters), before the maps that refer to them -------------
  const universeImported = await importEntities(
    tx,
    run,
    { universeId },
    content.universeEntries,
    universeRefs,
    resolvers,
    new Set(await universeKeys(tx, universeId)),
  );
  await importAspects(tx, run, universeImported, resolvers);
  await importRelations(tx, run, 'universe.json', (universe?.relations ?? []) as never, resolvers);

  // ---- each map ----------------------------------------------------------------------------
  const maps = (
    await listMaps(tx, universeId, { viewer: SEES_EVERYTHING, limit: Number.MAX_SAFE_INTEGER })
  ).items;
  for (const map of content.maps) {
    let mapId: string | null;
    if (map.slug === null) {
      // A CSV goes on the map the request names, which must be in this universe.
      const target = await requireMap(tx, csvMapId ?? '');
      if (target.universeId !== universeId) throw new NotFound('map', csvMapId ?? '');
      mapId = target.id;
    } else {
      mapId = await importMap(tx, run, universeId, map, maps, resolvers);
    }
    if (mapId === null) continue;
    const refs = new EntityRefs(await keysIn(tx, universeId, mapId), universeRefs);
    const mapResolvers = { ...resolvers, entities: refs };
    const imported = await importEntities(
      tx,
      run,
      { mapId },
      map.entries,
      refs,
      mapResolvers,
      new Set((await keysIn(tx, universeId, mapId)).keys()),
    );
    await importAspects(tx, run, imported, mapResolvers);
    await importRelations(tx, run, map.source, map.relations, mapResolvers);
    await importMemberships(tx, run, map, refs);
  }
}

/** External keys already used in a map, or (null) among the universe-scoped entities. */
async function keysIn(tx: Executor, universeId: string, mapId: string | null) {
  const { entities } = schema;
  const rows = await tx
    .select({ key: entities.externalKey, id: entities.id })
    .from(entities)
    .where(
      and(
        eq(entities.universeId, universeId),
        mapId === null ? isNull(entities.mapId) : eq(entities.mapId, mapId),
        isNotNull(entities.externalKey),
      ),
    );
  return new Map(rows.map((row) => [row.key ?? '', row.id]));
}

async function universeKeys(tx: Executor, universeId: string) {
  return (await keysIn(tx, universeId, null)).keys();
}
