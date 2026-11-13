import {
  csvObjects,
  ENTITY_RECORD_SCHEMAS,
  entityKinds,
  EXPORT_FORMAT,
  EXPORT_FORMAT_VERSION,
  ExportManifest,
  MAP_KINDS,
  MapFile,
  UNIVERSE_KINDS,
  UniverseFile,
  type EntityKind,
} from '@ge/domain';
import type { z } from 'zod';
import { InvalidRequest } from '../services/errors.ts';
import { readZip } from './zip.ts';

/**
 * Reads an import upload (M7-T4): an export's zip, or a CSV of objects. Every file is checked
 * against the format before anything is written, and every mistake is reported at once, with
 * the file and the place in it.
 */

type Row = Record<string, unknown>;

export interface EntityEntry {
  kind: EntityKind;
  record: Row;
  /** For the report: "maps/main.json › objects › gudrun", or "line 12". */
  where: string;
}

export interface MapContent {
  source: string;
  /** The map file's slug; null for a CSV, which goes to the map the request names. */
  slug: string | null;
  header: Row | null;
  entries: EntityEntry[];
  relations: Row[];
  /** CSV only: objects joining groups already on the map. */
  memberships: { object: string; group: string; where: string }[];
}

export interface ImportContent {
  scope: 'universe' | 'map' | 'csv';
  /** universe.json, checked; null for a CSV. */
  universe: Row | null;
  universeEntries: EntityEntry[];
  maps: MapContent[];
  /** The zip's files, by path, for the assets' images. */
  files: Map<string, Uint8Array>;
}

type Problems = { path: string; message: string }[];

const decoder = new TextDecoder('utf-8', { fatal: false });

/** Zip files start with "PK\x03\x04". */
const isZip = (data: Uint8Array) =>
  data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;

export function readUpload(data: Uint8Array): ImportContent {
  return isZip(data) ? readExport(data) : readCsv(decoder.decode(data));
}

function parsed<S extends z.ZodType>(
  schema: S,
  file: string,
  bytes: Uint8Array | undefined,
  problems: Problems,
): z.infer<S> | null {
  if (!bytes) {
    problems.push({ path: file, message: 'The file is missing from the zip.' });
    return null;
  }
  let json: unknown;
  try {
    json = JSON.parse(decoder.decode(bytes));
  } catch (error) {
    problems.push({ path: file, message: `Not valid JSON: ${(error as Error).message}` });
    return null;
  }
  const result = schema.safeParse(json);
  if (result.success) return result.data;
  for (const issue of result.error.issues.slice(0, 50)) {
    problems.push({ path: `${file} › ${issue.path.join('.')}`, message: issue.message });
  }
  return null;
}

/** A record's name for the report: its ref, key, or place in its list. */
function labelOf(record: Row, index: number): string {
  const label = record.ref ?? record.externalKey;
  return typeof label === 'string' ? label : `#${String(index + 1)}`;
}

function entriesOf(file: Row, kinds: readonly EntityKind[], source: string): EntityEntry[] {
  return kinds.flatMap((kind) => {
    const plural = entityKinds[kind].plural;
    const list = (file[plural] ?? []) as Row[];
    return list.map((record, index) => ({
      kind,
      record,
      where: `${source} › ${plural} › ${labelOf(record, index)}`,
    }));
  });
}

function readExport(data: Uint8Array): ImportContent {
  const files = readZip(data);
  const problems: Problems = [];
  const manifestJson = files.get('manifest.json');
  if (manifestJson) {
    // A file from a newer version reads differently: say so rather than list its fields.
    const raw = (() => {
      try {
        return JSON.parse(decoder.decode(manifestJson)) as Row;
      } catch {
        return {};
      }
    })();
    if (raw.format !== EXPORT_FORMAT) {
      throw new InvalidRequest('This zip isn’t a Galaxy Explorer export (its manifest says so).');
    }
    if (typeof raw.formatVersion === 'number' && raw.formatVersion > EXPORT_FORMAT_VERSION) {
      throw new InvalidRequest(
        'This export was made by a newer version of Galaxy Explorer. Update this one first.',
      );
    }
  }
  const manifest = parsed(ExportManifest, 'manifest.json', manifestJson, problems);
  const universe = parsed(UniverseFile, 'universe.json', files.get('universe.json'), problems);
  const maps: MapContent[] = [];
  for (const slug of manifest?.maps ?? []) {
    const source = `maps/${slug}.json`;
    const file = parsed(MapFile, source, files.get(source), problems);
    if (!file) continue;
    if (file.map.slug !== slug) {
      problems.push({
        path: `${source} › map.slug`,
        message: `The file’s map is “${String(file.map.slug)}”, not “${slug}”.`,
      });
      continue;
    }
    maps.push({
      source,
      slug,
      header: file.map,
      entries: entriesOf(file, MAP_KINDS, source),
      relations: (file.relations ?? []) as Row[],
      memberships: [],
    });
  }
  if (problems.length > 0 || !manifest || !universe) {
    throw new InvalidRequest('The export has mistakes; nothing was imported.', problems);
  }
  return {
    scope: manifest.scope,
    universe,
    universeEntries: entriesOf(universe, UNIVERSE_KINDS, 'universe.json'),
    maps,
    files,
  };
}

const csvMistakes = (problems: readonly { line: number; message: string }[]) =>
  new InvalidRequest(
    'The CSV has mistakes; nothing was imported.',
    problems.map((problem) => ({ path: `line ${String(problem.line)}`, message: problem.message })),
  );

function readCsv(text: string): ImportContent {
  const { objects, memberships, problems } = csvObjects(text);
  if (problems.length > 0) throw csvMistakes(problems);
  const schema = ENTITY_RECORD_SCHEMAS.celestial_object;
  const entries: EntityEntry[] = objects.map((record, index) => {
    const where = `line ${String(index + 2)}`;
    const result = schema.safeParse(record);
    for (const issue of result.error?.issues ?? []) {
      problems.push({ line: index + 2, message: `${issue.path.join('.')}: ${issue.message}` });
    }
    return { kind: 'celestial_object', record, where };
  });
  if (problems.length > 0) throw csvMistakes(problems);
  return {
    scope: 'csv',
    universe: null,
    universeEntries: [],
    maps: [
      {
        source: 'CSV',
        slug: null,
        header: null,
        entries,
        relations: [],
        memberships: memberships.map((membership) => ({
          object: membership.object,
          group: membership.group,
          where: `line ${String(membership.line)}`,
        })),
      },
    ],
    files: new Map(),
  };
}
