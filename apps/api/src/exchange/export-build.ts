import {
  ASSET_VARIANTS,
  CONFIG_RECORD_SCHEMAS,
  CONFIG_RESOURCES,
  configKeyOf,
  configLabelOf,
  configReferencesOf,
  ENTITY_RECORD_SCHEMAS,
  entityKinds,
  ExportFact,
  ExportImage,
  ExportMember,
  ExportRelation,
  MAP_KINDS,
  MapFile,
  referencesOf,
  RefAllocator,
  slugRef,
  UNIVERSE_KINDS,
  type AssetVariantName,
  type EntityKind,
  type References,
} from '@ge/domain';
import type { UniverseData } from './export-data.ts';
import { LOCATION_RECORD, recordOf, topoOrder, type RefLookup } from './records.ts';

/**
 * Builds an export's files from a universe's rows (M7-T4, D-36): references in place of ids,
 * and an order that is the same every time, so exporting, importing into an empty universe and
 * exporting again gives the same files apart from the export's time.
 */

type Row = Record<string, unknown>;

export interface BuiltExport {
  universe: Row;
  maps: { slug: string; file: Row }[];
  assets: { sha256: string; variant: AssetVariantName; key: string }[];
  counts: Record<string, number>;
}

const MAP_FILE_HEADER = MapFile.shape.map;

/** Rows by `sortKey`, then id: the order the settings pages show, kept through an import. */
const bySortKey = (rows: readonly Row[]) =>
  [...rows].sort(
    (a, b) =>
      (a.sortKey as number) - (b.sortKey as number) || String(a.id).localeCompare(String(b.id)),
  );

/** The id fields in a kind's or resource's own fields that point at its own records. */
function selfReferences(references: References, target: string): string[] {
  return Object.entries(references)
    .filter(([, to]) => to === target)
    .map(([field]) => field);
}

/** Rows with the ones their `fields` point at first. */
const parentsFirst = (rows: readonly Row[], fields: readonly string[]) =>
  topoOrder(
    rows,
    (row) => row.id as string,
    (row) => fields.map((field) => row[field]),
  );

export function buildExport(data: UniverseData, onlyMapIds?: readonly string[]): BuiltExport {
  const lookup: RefLookup = { entity: new Map(), config: new Map(), asset: new Map() };
  const counts: Record<string, number> = {};
  const universeFile: Row = {
    universe: recordOf(
      { shape: { name: 1, description: 1, dateFormatNotes: 1, settings: 1 } },
      data.universe,
    ),
  };

  // ---- assets: referred to by the hash of the upload -----------------------------------------
  const assets: BuiltExport['assets'] = [];
  universeFile.assets = data.assets.map((asset) => {
    lookup.asset.set(asset.id, asset.sha256);
    const variants: Row = {};
    for (const variant of ASSET_VARIANTS) {
      const stored = asset.variants[variant];
      if (!stored) continue;
      variants[variant] = { width: stored.width, height: stored.height };
      assets.push({ sha256: asset.sha256, variant, key: stored.key });
    }
    return recordOf(
      {
        shape: {
          sha256: 1,
          width: 1,
          height: 1,
          byteSize: 1,
          variants: 1,
          originalFilename: 1,
          altText: 1,
          credit: 1,
          sourceUrl: 1,
          license: 1,
        },
      },
      { ...asset, variants },
    );
  });
  counts.assets = data.assets.length;

  // ---- settings rows: referred to by name, or by key ----------------------------------------
  const configOrder = new Map<string, number>();
  for (const resource of CONFIG_RESOURCES) {
    const references = configReferencesOf(resource);
    const rows = parentsFirst(
      bySortKey(data.config[resource]),
      selfReferences(references, resource),
    );
    const refs = new RefAllocator();
    const label = configLabelOf(resource);
    const ownRef = new Map<string, string | undefined>();
    rows.forEach((row, index) => {
      configOrder.set(row.id as string, index);
      const name = String(row[label]);
      const ref = refs.reserve(name) ? name : refs.take(name);
      lookup.config.set(row.id as string, ref);
      ownRef.set(row.id as string, ref === name ? undefined : ref);
    });
    universeFile[configKeyOf(resource)] = rows.map((row) =>
      recordOf(CONFIG_RECORD_SCHEMAS[resource], row, {
        references,
        lookup,
        extra: { ref: ownRef.get(row.id as string) },
      }),
    );
    counts[configKeyOf(resource)] = rows.length;
  }

  // ---- entities: by external key, or a ref made from the name --------------------------------
  const universeRefs = new RefAllocator();
  const mapOf = new Map<string, string | null>();
  const ordered = (kind: EntityKind, rows: readonly Row[]) =>
    parentsFirst(rows, selfReferences(referencesOf(kind), 'entity'));
  const assignRefs = (
    refs: RefAllocator,
    kinds: readonly EntityKind[],
    rows: Map<EntityKind, Row[]>,
  ) => {
    const own = new Map<string, string | undefined>();
    const all = kinds.flatMap((kind) => rows.get(kind) ?? []);
    // Keys first, so a ref made from a name never takes one.
    for (const row of all) {
      const key = row.externalKey as string | null;
      if (key === null) continue;
      const ref = refs.reserve(key) ? key : refs.take(key);
      lookup.entity.set(row.id as string, ref);
      own.set(row.id as string, ref === key ? undefined : ref);
    }
    for (const row of all) {
      if (row.externalKey !== null) continue;
      const ref = refs.take(slugRef(row.namePlain as string, row.kind as string));
      lookup.entity.set(row.id as string, ref);
      own.set(row.id as string, ref);
    }
    return own;
  };

  const universeRows = new Map(
    UNIVERSE_KINDS.map((kind) => [kind, ordered(kind, data.entities[kind])]),
  );
  for (const row of [...universeRows.values()].flat()) mapOf.set(row.id as string, null);
  const universeOwn = assignRefs(universeRefs, UNIVERSE_KINDS, universeRows);

  const maps = data.maps.filter((map) => !onlyMapIds || onlyMapIds.includes(map.id));
  const mapRows = new Map<string, Map<EntityKind, Row[]>>();
  const mapOwn = new Map<string, Map<string, string | undefined>>();
  for (const map of maps) {
    const rows = new Map(
      MAP_KINDS.map((kind) => [
        kind,
        ordered(
          kind,
          data.entities[kind].filter((row) => row.mapId === map.id),
        ),
      ]),
    );
    for (const row of [...rows.values()].flat()) mapOf.set(row.id as string, map.id);
    // A map's refs mustn't take a universe-scoped entry's: references in a map file reach both.
    const refs = new RefAllocator();
    for (const ref of universeOwnRefs(universeRows, lookup)) refs.reserve(ref);
    mapRows.set(map.id, rows);
    mapOwn.set(map.id, assignRefs(refs, MAP_KINDS, rows));
  }

  const entityRecord = (
    kind: EntityKind,
    row: Row,
    own: Map<string, string | undefined>,
    objectOrder: Map<string, number>,
  ) => {
    const id = row.id as string;
    const facts = [...(data.facts.get(id) ?? [])].sort(
      (a, b) =>
        (configOrder.get(a.fieldDefinitionId as string) ?? 0) -
        (configOrder.get(b.fieldDefinitionId as string) ?? 0),
    );
    const images = [...(data.images.get(id) ?? [])].sort(
      (a, b) =>
        (a.sortKey as number) - (b.sortKey as number) ||
        String(a.role).localeCompare(String(b.role)) ||
        String(lookup.asset.get(a.assetId as string)).localeCompare(
          String(lookup.asset.get(b.assetId as string)),
        ),
    );
    const members = [...(data.members.get(id) ?? [])].sort(
      (a, b) =>
        (objectOrder.get(a.objectId as string) ?? 0) - (objectOrder.get(b.objectId as string) ?? 0),
    );
    const location = data.locations.get(id);
    return recordOf(ENTITY_RECORD_SCHEMAS[kind], row, {
      references: referencesOf(kind),
      lookup,
      extra: {
        ref: own.get(id),
        facts: facts.map((fact) =>
          recordOf(ExportFact, fact, {
            references: { fieldDefinitionId: 'field_definitions' },
            names: { fieldDefinitionId: 'field' },
            lookup,
          }),
        ),
        images: images.map((image) =>
          recordOf(ExportImage, image, { references: { assetId: 'asset' }, lookup }),
        ),
        links: (data.links.get(id) ?? []).map((link) =>
          recordOf({ shape: { url: 1, label: 1, isSpoiler: 1, sortKey: 1 } }, link),
        ),
        citations: (data.citations.get(id) ?? []).map((citation) =>
          recordOf(
            { shape: { target: 1, sourceUrl: 1, sourceTitle: 1, license: 1, retrievedAt: 1 } },
            // The row's Date, written as the ISO 8601 the import reads (CitationWrite).
            { ...citation, retrievedAt: (citation.retrievedAt as Date).toISOString() },
          ),
        ),
        location:
          location &&
          recordOf(LOCATION_RECORD, location, {
            references: { objectId: 'entity', placeId: 'entity' },
            lookup,
          }),
        members: members.map((member) =>
          recordOf(ExportMember, member, { references: { objectId: 'entity' }, lookup }),
        ),
        waypoints: (data.waypoints.get(id) ?? []).map((waypoint) =>
          lookup.entity.get(waypoint.objectId as string),
        ),
      },
    });
  };

  for (const kind of UNIVERSE_KINDS) {
    const rows = universeRows.get(kind) ?? [];
    universeFile[entityKinds[kind].plural] = rows.map((row) =>
      entityRecord(kind, row, universeOwn, new Map()),
    );
    counts[entityKinds[kind].plural] = rows.length;
  }

  // ---- relations: in the file of their map-scoped end, if they have one ---------------------
  const relationsOf = new Map<string | null, Row[]>();
  for (const relation of data.relations) {
    const from = mapOf.get(relation.fromEntityId as string);
    const to = mapOf.get(relation.toEntityId as string);
    if (from === undefined || to === undefined) continue; // an end on a map left out
    const file = from ?? to ?? null;
    const list = relationsOf.get(file) ?? [];
    list.push(
      recordOf(ExportRelation, relation, {
        references: { fromEntityId: 'entity', toEntityId: 'entity' },
        names: { fromEntityId: 'from', toEntityId: 'to' },
        lookup,
      }),
    );
    relationsOf.set(file, list);
  }
  universeFile.relations = relationsOf.get(null) ?? [];
  counts.relations = data.relations.length;

  const mapFiles = maps.map((map) => {
    const rows = mapRows.get(map.id) ?? new Map<EntityKind, Row[]>();
    const own = mapOwn.get(map.id) ?? new Map<string, string | undefined>();
    const objectOrder = new Map(
      (rows.get('celestial_object') ?? []).map((row, index) => [row.id as string, index]),
    );
    const file: Row = {
      map: recordOf(MAP_FILE_HEADER, map, { references: { underlayAssetId: 'asset' }, lookup }),
    };
    for (const kind of MAP_KINDS) {
      const list = rows.get(kind) ?? [];
      file[entityKinds[kind].plural] = list.map((row) => entityRecord(kind, row, own, objectOrder));
      counts[entityKinds[kind].plural] = (counts[entityKinds[kind].plural] ?? 0) + list.length;
    }
    file.relations = relationsOf.get(map.id) ?? [];
    return { slug: map.slug, file: dropEmpty(file) };
  });
  counts.maps = maps.length;

  return { universe: dropEmpty(universeFile), maps: mapFiles, assets, counts };
}

function universeOwnRefs(rows: Map<EntityKind, Row[]>, lookup: RefLookup): string[] {
  return [...rows.values()].flat().flatMap((row) => lookup.entity.get(row.id as string) ?? []);
}

/** Leaves out empty lists, so a file only lists what it has. */
function dropEmpty(file: Row): Row {
  return Object.fromEntries(
    Object.entries(file).filter(([, value]) => !(Array.isArray(value) && value.length === 0)),
  );
}
