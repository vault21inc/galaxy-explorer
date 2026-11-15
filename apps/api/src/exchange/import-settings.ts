import { schema, type Executor } from '@ge/db';
import {
  ASSET_VARIANTS,
  assetPath,
  CONFIG_RESOURCES,
  configKeyOf,
  configLabelOf,
  configReferencesOf,
  configResources,
  refFieldOf,
  type ConfigResource,
  type ExportAsset,
} from '@ge/domain';
import { eq, sql } from 'drizzle-orm';
import sharp from 'sharp';
import { createConfig, updateConfig } from '../services/config-service.ts';
import {
  createMap,
  getUniverse,
  updateMap,
  updateUniverse,
} from '../services/container-service.ts';
import { assetKey, type BlobStore } from '../storage/blob-store.ts';
import { topoOrder } from './records.ts';
import { withIds, type ImportRun, type Resolvers } from './import-context.ts';
import type { MapContent } from './import-read.ts';

/**
 * Importing what entities build on (M7-T4): the universe's own fields, its assets, its settings
 * rows and its maps. Each record is matched to what's already there by a natural key (an
 * asset's hash, a setting's name, a map's slug): a match is kept as it is, or in a merge,
 * updated.
 */

type Row = Record<string, unknown>;

/** Equal as the file and the database would write them: null and absent alike. */
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const unchanged = (input: Row, current: Row) =>
  Object.entries(input).every(([field, value]) => same(value, current[field]));

/** A universe export's own fields: its name, description, date notes and settings. */
export async function importUniverseFields(
  tx: Executor,
  run: ImportRun,
  universeId: string,
  fields: Row,
): Promise<void> {
  const current = await getUniverse(tx, universeId);
  if (unchanged(fields, current)) {
    run.count('universe', 'keep');
    return;
  }
  const done = await run.step(tx, 'universe.json › universe', (sp) =>
    updateUniverse(sp, universeId, { ...fields, version: current.version }),
  );
  if (done) run.count('universe', 'update');
}

/**
 * Assets: one with the same hash is already here and is used as it is; a new one is stored
 * with its images from the zip. An image file the zip lacks is noted, and the asset is
 * imported without it, as it was where it came from.
 */
export async function importAssets(
  tx: Executor,
  store: BlobStore,
  run: ImportRun,
  universeId: string,
  assets: readonly ExportAsset[],
  files: ReadonlyMap<string, Uint8Array>,
  resolvers: Resolvers,
): Promise<void> {
  for (const asset of assets) {
    const where = `universe.json › assets › ${asset.sha256}`;
    if (resolvers.assets.has(asset.sha256)) {
      run.count('assets', 'keep');
      continue;
    }
    const id = await run.step(tx, where, async (sp) => {
      const [row] = (await sp.execute<{ id: string }>(sql`select uuidv7() as id`)).rows;
      if (!row) throw new Error('Postgres returned no new id.');
      const variants: Row = {};
      for (const variant of ASSET_VARIANTS) {
        const size = asset.variants[variant];
        if (!size) continue;
        const key = assetKey(universeId, row.id, variant);
        variants[variant] = { key, ...size };
        const data = files.get(assetPath(asset.sha256, variant));
        if (!data) {
          run.note(where, `The zip has no ${variant} image; it will show as missing.`);
          continue;
        }
        await checkWebp(data, size, `${where} › ${variant}`, run);
        if (!run.dryRun) {
          await store.put(key, Buffer.from(data), 'image/webp');
          run.written.push(key);
        }
      }
      await sp.insert(schema.assets).values({
        id: row.id,
        universeId,
        sha256: asset.sha256,
        mimeType: 'image/webp',
        width: asset.width,
        height: asset.height,
        byteSize: asset.byteSize,
        variants: variants as never,
        originalFilename: asset.originalFilename ?? null,
        altText: asset.altText ?? null,
        credit: asset.credit ?? null,
        sourceUrl: asset.sourceUrl ?? null,
        license: asset.license ?? null,
      });
      return row.id;
    });
    if (!id) continue;
    resolvers.assets.set(asset.sha256, id);
    run.count('assets', 'create');
  }
}

/** The media folder serves these as WebP images, so they must be: of the size the file says. */
async function checkWebp(
  data: Uint8Array,
  size: { width: number; height: number },
  where: string,
  run: ImportRun,
): Promise<void> {
  try {
    const metadata = await sharp(data).metadata();
    if (
      metadata.format !== 'webp' ||
      metadata.width !== size.width ||
      metadata.height !== size.height
    ) {
      run.conflict(
        where,
        `The image isn’t a ${String(size.width)}×${String(size.height)} WebP, as the file says.`,
      );
    }
  } catch {
    run.conflict(where, 'The image can’t be read.');
  }
}

/** Resources that others point at first: subtypes before the field definitions narrowed by them. */
const RESOURCE_ORDER = topoOrder(
  CONFIG_RESOURCES,
  (resource) => resource,
  (resource) => Object.values(configReferencesOf(resource)),
);

/** The settings rows already in the universe, per resource. */
export type ExistingConfig = ReadonlyMap<ConfigResource, readonly Row[]>;

export async function importConfig(
  tx: Executor,
  run: ImportRun,
  universeId: string,
  file: Row,
  existing: ExistingConfig,
  resolvers: Resolvers,
): Promise<void> {
  for (const resource of RESOURCE_ORDER) {
    const section = configKeyOf(resource);
    const label = configLabelOf(resource);
    const references = configReferencesOf(resource);
    const ownRefs = Object.entries(references)
      .filter(([, target]) => target === resource)
      .map(([field]) => refFieldOf(field));
    const refOf = (record: Row) => String(record.ref ?? record[label]);
    const records = topoOrder((file[section] ?? []) as Row[], refOf, (record) =>
      ownRefs.map((field) => record[field]),
    );
    for (const record of records) {
      const ref = refOf(record);
      const where = `universe.json › ${section} › ${ref}`;
      // A row that nests in itself (a group type of its own type) gets its own id afterwards.
      const self = ownRefs.filter((field) => record[field] === ref);
      const body = { ...record, ...Object.fromEntries(self.map((field) => [field, null])) };
      const converted = withIds(body, references, resolvers, { drop: ['ref'] });
      if ('missing' in converted) {
        run.missing(where, converted);
        continue;
      }
      const naturalKey = configResources[resource].naturalKey;
      const match = existing
        .get(resource)
        ?.find((row) => naturalKey.every((field) => same(row[field], converted.input[field])));
      if (match && (run.mode === 'create' || unchanged(converted.input, match))) {
        resolvers.config.set(resource, ref, match.id as string);
        run.count(section, 'keep');
        continue;
      }
      const saved = await run.step(tx, where, async (sp) => {
        const row = match
          ? await updateConfig(sp, resource, match.id as string, converted.input)
          : await createConfig(sp, resource, universeId, converted.input);
        if (self.length > 0) {
          const ids = Object.fromEntries(self.map((field) => [`${field}Id`, row.id]));
          await updateConfig(sp, resource, row.id, ids);
        }
        return row;
      });
      if (!saved) continue;
      resolvers.config.set(resource, ref, saved.id);
      run.count(section, match ? 'update' : 'create');
    }
  }
}

/**
 * A map file's own fields: a new map, or (a merge) the map with that slug updated. Adding a
 * map whose slug is taken is a conflict. Returns the map's id, or null if it isn't imported.
 */
/** Whether nothing is on the map yet: no entry of any kind, drafts included. */
async function isEmptyMap(tx: Executor, mapId: string): Promise<boolean> {
  const [entry] = await tx
    .select({ id: schema.entities.id })
    .from(schema.entities)
    .where(eq(schema.entities.mapId, mapId))
    .limit(1);
  return entry === undefined;
}

export async function importMap(
  tx: Executor,
  run: ImportRun,
  universeId: string,
  content: MapContent,
  existing: readonly { id: string; slug: string; version: number }[],
  resolvers: Resolvers,
): Promise<string | null> {
  const header = content.header ?? {};
  const converted = withIds(header, { underlayAssetId: 'asset' }, resolvers);
  if ('missing' in converted) {
    run.missing(`${content.source} › map`, converted);
    return null;
  }
  const match = existing.find((map) => map.slug === content.slug);
  // Adding as new, a map of the same slug that holds nothing yet is filled, as the file's: a
  // universe made on the home page starts with an empty "main" map, which is also the slug of
  // most exports' map, so importing into a new universe would otherwise always conflict (found
  // in the owner's M7 demo). A map with entries is someone's work: that's a conflict.
  if (match && run.mode === 'create' && !(await isEmptyMap(tx, match.id))) {
    run.conflict(
      content.source,
      `A map with the slug “${String(content.slug)}” is already in this universe, with entries on it. Import with “Update by key” to update it, or change its slug in the file.`,
    );
    return null;
  }
  if (match && unchanged(converted.input, match)) {
    run.count('maps', 'keep');
    return match.id;
  }
  const saved = await run.step(tx, content.source, (sp) =>
    match
      ? updateMap(sp, match.id, { ...converted.input, version: match.version })
      : createMap(sp, universeId, converted.input as never),
  );
  if (!saved) return null;
  run.count('maps', match ? 'update' : 'create');
  return saved.id;
}
