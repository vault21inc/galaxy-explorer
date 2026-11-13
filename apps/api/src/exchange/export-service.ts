import type { Executor } from '@ge/db';
import {
  assetPath,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  ExportManifest,
  type ExportManifest as Manifest,
} from '@ge/domain';
import type { BlobStore } from '../storage/blob-store.ts';
import { NotFound } from '../services/errors.ts';
import { buildExport } from './export-build.ts';
import { loadUniverse } from './export-data.ts';
import { writeZip, type ZipEntry } from './zip.ts';

/**
 * `GET /universes/{id}/export` and `GET /maps/{id}/export` (M7-T4): the universe, or one map
 * with the universe's settings and characters, as a zip (export-build.ts has the format).
 */

const encoder = new TextEncoder();
const json = (value: unknown) => encoder.encode(`${JSON.stringify(value, null, 2)}\n`);

export interface ExportOptions {
  /** Only this map; the universe's settings, assets and characters come too. */
  mapId?: string;
  /** Names the program in the manifest, such as "Galaxy Explorer 0.1.0". */
  generator: string;
  now?: Date;
}

export async function exportZip(
  ex: Executor,
  store: BlobStore,
  universeId: string,
  options: ExportOptions,
): Promise<{ filename: string; zip: Uint8Array }> {
  const data = await loadUniverse(ex, universeId);
  const map = options.mapId ? data.maps.find((item) => item.id === options.mapId) : undefined;
  if (options.mapId && !map) throw new NotFound('map', options.mapId);
  const built = buildExport(data, map ? [map.id] : undefined);
  const now = options.now ?? new Date();

  const manifest: Manifest = ExportManifest.parse({
    format: EXPORT_FORMAT,
    formatVersion: EXPORT_FORMAT_VERSION,
    generator: options.generator,
    exportedAt: now.toISOString(),
    scope: map ? 'map' : 'universe',
    maps: built.maps.map((item) => item.slug),
    counts: built.counts,
  });
  const entries: ZipEntry[] = [
    { path: 'manifest.json', data: json(manifest) },
    { path: 'universe.json', data: json(built.universe) },
    ...built.maps.map((item) => ({ path: `maps/${item.slug}.json`, data: json(item.file) })),
  ];
  for (const asset of built.assets) {
    // A file the media folder doesn't have (the demo seed's placeholders) is left out, and
    // the import recreates the asset without it: the same as it was here.
    const file = await store.get(asset.key);
    if (file)
      entries.push({ path: assetPath(asset.sha256, asset.variant), data: file, stored: true });
  }

  const day = now.toISOString().slice(0, 10);
  const name = map ? `${data.universe.slug}-${map.slug}` : data.universe.slug;
  return { filename: `${name}-${day}.zip`, zip: writeZip(entries, now) };
}
