import { schema, type Executor } from '@ge/db';
import {
  isPlanetType,
  isRegionType,
  mediaUrl,
  objectTypes,
  resolveAppearance,
  type Appearance,
  type BaseType,
  type GalaxyObject,
  type GalaxyView,
  type OrbitView,
  type SubjectViewBase,
  type SystemView,
  type ViewLevel,
  type ViewObject,
} from '@ge/domain';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { InvalidRequest, NotFound } from './errors.ts';
import { getMap } from './container-service.ts';
import { named, published } from './view-common.ts';
import { loadGalaxyMarkers, loadSystemMarkers } from './view-markers.ts';
import { loadPins } from './view-pins.ts';
import type { Sunlight } from '@ge/domain';
import { loadRoutes } from './view-routes.ts';
import { entityVisible, type Viewer } from './visibility.ts';

/**
 * The view payloads (architecture.md §6, M1-T9): one request per view, ready to draw.
 * Appearances are resolved with the same `resolveAppearance` the browser uses for previews.
 */

const {
  entities,
  celestialObjects,
  objectGroups,
  groupMembers,
  groupTypes,
  objectSubtypes,
  maps,
  entityImages,
  assets,
} = schema;

const objectColumns = {
  id: entities.id,
  name: entities.name,
  namePlain: entities.namePlain,
  isSpoiler: entities.isSpoiler,
  status: entities.status,
  version: entities.version,
  baseType: celestialObjects.baseType,
  subtypeId: celestialObjects.subtypeId,
  parentId: celestialObjects.parentId,
  orbitCenterId: celestialObjects.orbitCenterId,
  explorable: celestialObjects.explorable,
  x: celestialObjects.x,
  y: celestialObjects.y,
  z: celestialObjects.z,
  appearance: celestialObjects.appearance,
};

function selectObjects(ex: Executor, where: SQL | undefined) {
  return ex
    .select(objectColumns)
    .from(entities)
    .innerJoin(celestialObjects, eq(celestialObjects.entityId, entities.id))
    .where(where)
    .orderBy(asc(entities.id));
}

type ObjectRow = Awaited<ReturnType<typeof selectObjects>>[number];

/** Subtype default appearances of a universe, by subtype id. */
async function subtypeDefaults(ex: Executor, universeId: string): Promise<Map<string, Appearance>> {
  const rows = await ex
    .select({ id: objectSubtypes.id, defaults: objectSubtypes.defaultAppearance })
    .from(objectSubtypes)
    .where(eq(objectSubtypes.universeId, universeId));
  return new Map(rows.map((row) => [row.id, row.defaults]));
}

function toViewObject(
  row: ObjectRow,
  view: ViewLevel,
  subtypes: ReadonlyMap<string, Appearance>,
): ViewObject {
  const { appearance, size } = resolveAppearance({
    baseType: row.baseType as BaseType,
    subtypeDefaults: row.subtypeId ? (subtypes.get(row.subtypeId) ?? null) : null,
    overrides: row.appearance,
    view,
  });
  return {
    id: row.id as ViewObject['id'],
    baseType: row.baseType as BaseType,
    subtypeId: row.subtypeId as ViewObject['subtypeId'],
    ...named(row),
    status: row.status as ViewObject['status'],
    version: row.version,
    explorable: row.explorable,
    position: [row.x, row.y, row.z],
    orbitCenterId: row.orbitCenterId as ViewObject['orbitCenterId'],
    appearance,
    size,
    surfaceTexture: null,
  };
}

export async function galaxyView(ex: Executor, mapId: string, viewer: Viewer): Promise<GalaxyView> {
  const map = await getMap(ex, mapId, viewer);
  const [mapRow] = await ex
    .select({ name: maps.name, isSpoiler: maps.isSpoiler })
    .from(maps)
    .where(eq(maps.id, mapId));
  const subtypes = await subtypeDefaults(ex, map.universeId);
  const objects = (
    await selectObjects(
      ex,
      and(eq(celestialObjects.mapId, mapId), isNull(celestialObjects.parentId), published(viewer)),
    )
  ).map((row) => toViewObject(row, 'galaxy', subtypes));
  const glyphs = await systemGlyphs(
    ex,
    objects.filter((object) => object.baseType === 'system').map((object) => object.id),
    viewer,
    subtypes,
  );
  const regionTextures = await loadRoleImages(
    ex,
    objects.filter((object) => isRegionType(object.baseType)).map((object) => object.id),
    'region_texture',
  );
  const surfaceTextures = await loadSurfaceTextures(ex, objects);
  const galaxyObjects: GalaxyObject[] = objects.map((object) => ({
    ...object,
    ...(glyphs.get(object.id) ?? { ...NO_GLYPH, stars: [] }),
    regionTexture: regionTextures.get(object.id) ?? null,
    surfaceTexture: surfaceTextures.get(object.id) ?? null,
  }));

  const groupRows = await ex
    .select({
      id: entities.id,
      version: entities.version,
      name: entities.name,
      namePlain: entities.namePlain,
      isSpoiler: entities.isSpoiler,
      status: entities.status,
      groupTypeId: objectGroups.groupTypeId,
      parentGroupId: objectGroups.parentGroupId,
      outlineColor: objectGroups.outlineColor,
      style: objectGroups.style,
    })
    .from(entities)
    .innerJoin(objectGroups, eq(objectGroups.entityId, entities.id))
    .where(and(eq(objectGroups.mapId, mapId), published(viewer)))
    .orderBy(asc(entities.id));
  const shownObjects = new Set<string>(objects.map((object) => object.id));
  const members = await ex
    .select({
      groupId: groupMembers.groupId,
      objectId: groupMembers.objectId,
      isSpoiler: groupMembers.isSpoiler,
    })
    .from(groupMembers)
    .where(eq(groupMembers.mapId, mapId))
    .orderBy(asc(groupMembers.objectId));

  return {
    map: {
      id: map.id,
      universeId: map.universeId,
      ...named({
        name: mapRow?.name ?? map.name,
        namePlain: map.namePlain,
        isSpoiler: map.isSpoiler,
      }),
      galaxySettings: map.galaxySettings,
      underlay: map.underlay,
      underlayAssetId: map.underlayAssetId,
    },
    objects: galaxyObjects,
    groups: groupRows.map((group) => ({
      id: group.id as GalaxyView['groups'][number]['id'],
      version: group.version,
      ...named(group),
      status: group.status as 'draft' | 'published',
      groupTypeId: group.groupTypeId as GalaxyView['groups'][number]['groupTypeId'],
      parentGroupId: group.parentGroupId as GalaxyView['groups'][number]['parentGroupId'],
      outlineColor: group.outlineColor as GalaxyView['groups'][number]['outlineColor'],
      style: group.style,
      // Members a reader can't see (drafts) aren't counted in the outline either.
      members: members
        .filter((member) => member.groupId === group.id && shownObjects.has(member.objectId))
        .map((member) => ({
          objectId: member.objectId as GalaxyView['objects'][number]['id'],
          isSpoiler: member.isSpoiler,
        })),
    })),
    routes: await loadRoutes(ex, mapId, viewer, shownObjects),
    groupTypes: (
      await ex
        .select()
        .from(groupTypes)
        .where(eq(groupTypes.universeId, map.universeId))
        .orderBy(asc(groupTypes.sortKey), asc(groupTypes.name))
    ).map(({ universeId: _universeId, ...type }) => type) as GalaxyView['groupTypes'],
    markers: await loadGalaxyMarkers(ex, mapId, [...shownObjects], viewer),
  };
}

/**
 * The system or orbit view of an object: the subject, its ancestors for breadcrumbs, its direct
 * children, and (orbit views) the pins on it. The subject's base type must open this view.
 */
/** The glyph fields of an object that isn't a system, or a system with nothing inside. */
const NO_GLYPH = { planetCount: 0, spoilerPlanetCount: 0 } as const;

type ImageRef = NonNullable<GalaxyObject['regionTexture']>;

/**
 * The entities' images in a one-per-entity role, by entity: a region's top-down picture
 * (M4-T6) or a planet's surface map (M6-T2), with the URL of the variant drawn (`texture`
 * when the image has it, else `display`) and the image's spoiler flag, which the client
 * applies like every other spoiler. One query for all.
 */
async function loadRoleImages(
  ex: Executor,
  entityIds: readonly string[],
  role: 'region_texture' | 'surface_texture',
): Promise<Map<string, ImageRef>> {
  const found = new Map<string, ImageRef>();
  if (entityIds.length === 0) return found;
  const rows = await ex
    .select({
      entityId: entityImages.entityId,
      assetId: entityImages.assetId,
      isSpoiler: entityImages.isSpoiler,
      variants: assets.variants,
    })
    .from(entityImages)
    .innerJoin(assets, eq(assets.id, entityImages.assetId))
    .where(and(inArray(entityImages.entityId, [...entityIds]), eq(entityImages.role, role)));
  for (const row of rows) {
    found.set(row.entityId, {
      assetId: row.assetId as ImageRef['assetId'],
      url: mediaUrl((row.variants.texture ?? row.variants.display).key),
      isSpoiler: row.isSpoiler,
    });
  }
  return found;
}

/** The planets' and moons' uploaded surface maps (M6-T2), by object. */
function loadSurfaceTextures(ex: Executor, objects: readonly ViewObject[]) {
  return loadRoleImages(
    ex,
    objects.filter((object) => isPlanetType(object.baseType)).map((object) => object.id),
    'surface_texture',
  );
}

/** Stars a system's galaxy glyph shows at most (D-29). */
const GLYPH_STARS = 3;

/**
 * What each system's galaxy-view glyph shows (D-28, D-29): its planets, counted apart by spoiler
 * flag so hidden ones stay hidden, and up to 3 of its stars, largest first, with their resolved
 * colors. One query for every system; only what the reader may see (drafts with includeDrafts).
 */
async function systemGlyphs(
  ex: Executor,
  systemIds: readonly string[],
  viewer: Viewer,
  subtypes: ReadonlyMap<string, Appearance>,
): Promise<Map<string, Pick<GalaxyObject, 'planetCount' | 'spoilerPlanetCount' | 'stars'>>> {
  const glyphs = new Map<
    string,
    Pick<GalaxyObject, 'planetCount' | 'spoilerPlanetCount' | 'stars'>
  >();
  if (systemIds.length === 0) return glyphs;
  const children = await selectObjects(
    ex,
    and(
      inArray(celestialObjects.parentId, [...systemIds]),
      inArray(celestialObjects.baseType, ['planet', 'star']),
      published(viewer),
    ),
  );
  const stars = new Map<string, { color: string; size: number; isSpoiler: boolean }[]>();
  for (const child of children) {
    const parentId = child.parentId ?? '';
    const glyph = glyphs.get(parentId) ?? { planetCount: 0, spoilerPlanetCount: 0, stars: [] };
    glyphs.set(parentId, glyph);
    if (child.baseType === 'planet') {
      if (child.isSpoiler) glyph.spoilerPlanetCount++;
      else glyph.planetCount++;
      continue;
    }
    // A star's size in its system view is what makes it the largest; its color, the glyph's.
    const { appearance, size } = resolveAppearance({
      baseType: 'star',
      subtypeDefaults: child.subtypeId ? (subtypes.get(child.subtypeId) ?? null) : null,
      overrides: child.appearance,
      view: 'system',
    });
    const list = stars.get(parentId) ?? [];
    list.push({ color: appearance.color, size: size ?? 1, isSpoiler: child.isSpoiler });
    stars.set(parentId, list);
  }
  for (const [systemId, list] of stars) {
    const glyph = glyphs.get(systemId);
    if (!glyph) continue;
    list.sort((a, b) => b.size - a.size);
    const largest = list[0]?.size ?? 1;
    glyph.stars = list.slice(0, GLYPH_STARS).map((star) => ({
      color: star.color as GalaxyObject['stars'][number]['color'],
      sizeShare: largest > 0 ? Math.min(1, star.size / largest) : 1,
      isSpoiler: star.isSpoiler,
    }));
  }
  return glyphs;
}

async function subjectView(
  ex: Executor,
  id: string,
  level: 'system' | 'orbit',
  viewer: Viewer,
): Promise<SubjectViewBase> {
  const [subject] = await selectObjects(ex, and(eq(entities.id, id), entityVisible(viewer)));
  if (!subject) throw new NotFound('object', id);
  const type = objectTypes[subject.baseType as BaseType];
  if (type.explorableAs !== level) {
    const opens = type.explorableAs ? `opens the ${type.explorableAs} view` : "doesn't open a view";
    throw new InvalidRequest(
      `${subject.namePlain} is a ${type.label.toLowerCase()}, which ${opens}, not the ${level} view.`,
    );
  }
  const [entity] = await ex
    .select({ mapId: entities.mapId, universeId: entities.universeId })
    .from(entities)
    .where(eq(entities.id, id));
  const mapId = entity?.mapId ?? '';
  const [map] = await ex.select().from(maps).where(eq(maps.id, mapId));
  if (!map) throw new NotFound('map', mapId);
  const subtypes = await subtypeDefaults(ex, map.universeId);

  const ancestors: SystemView['ancestors'] = [];
  for (let parentId = subject.parentId; parentId !== null;) {
    const [parent] = await selectObjects(ex, eq(entities.id, parentId));
    if (!parent) break;
    ancestors.unshift({
      id: parent.id as ViewObject['id'],
      baseType: parent.baseType as BaseType,
      ...named(parent),
    });
    parentId = parent.parentId;
  }

  const children = (
    await selectObjects(ex, and(eq(celestialObjects.parentId, id), published(viewer)))
  ).map((child) => toViewObject(child, level, subtypes));
  const subjectObject = toViewObject(subject, level, subtypes);
  // A system's planets' moons and stations, as their planet's orbit view has them.
  const planetIds = children
    .filter((child) => child.baseType === 'planet')
    .map((child) => child.id);
  const satellites =
    level === 'system' && planetIds.length > 0
      ? (
          await selectObjects(
            ex,
            and(inArray(celestialObjects.parentId, planetIds), published(viewer)),
          )
        ).map((row) => ({
          ...toViewObject(row, 'orbit', subtypes),
          parentId: row.parentId as ViewObject['id'],
        }))
      : [];
  const surfaces = await loadSurfaceTextures(ex, [subjectObject, ...children, ...satellites]);
  const withSurface = (object: ViewObject): ViewObject => ({
    ...object,
    surfaceTexture: surfaces.get(object.id) ?? null,
  });
  return {
    map: {
      id: map.id as ViewObject['id'],
      universeId: map.universeId as ViewObject['id'],
      ...named(map),
    },
    ancestors,
    subject: {
      ...withSurface(subjectObject),
      parentId: subject.parentId as ViewObject['subtypeId'],
    },
    children: children.map(withSurface),
    satellites: satellites.map((satellite) => ({ ...satellite, ...withSurface(satellite) })),
  };
}

export async function systemView(ex: Executor, id: string, viewer: Viewer): Promise<SystemView> {
  return {
    ...(await subjectView(ex, id, 'system', viewer)),
    markers: await loadSystemMarkers(ex, id, viewer),
  };
}

export async function orbitView(ex: Executor, id: string, viewer: Viewer): Promise<OrbitView> {
  const view = await subjectView(ex, id, 'orbit', viewer);
  return {
    ...view,
    pins: await loadPins(ex, id, viewer),
    sunlight: await loadSunlight(ex, view, viewer),
  };
}

/**
 * The orbit view's sunlight (M6-T3): which star lights the body, from where. The body is the
 * subject when it sits in a system, or its planet when it's a moon (a moon is so close to its
 * planet, seen from the star, that their directions agree). The star is the one it orbits
 * (orbitCenterId), else the system's largest, among those the reader may see.
 */
async function loadSunlight(
  ex: Executor,
  view: SubjectViewBase,
  viewer: Viewer,
): Promise<OrbitView['sunlight']> {
  const parent = view.ancestors.at(-1);
  const grandparent = view.ancestors.at(-2);
  let body: { position: readonly number[]; orbitCenterId: string | null };
  let systemId: string;
  if (parent?.baseType === 'system') {
    body = view.subject;
    systemId = parent.id;
  } else if (parent?.baseType === 'planet' && grandparent?.baseType === 'system') {
    const [planet] = await selectObjects(ex, eq(entities.id, parent.id));
    if (!planet) return null;
    body = { position: [planet.x, planet.y, planet.z], orbitCenterId: planet.orbitCenterId };
    systemId = grandparent.id;
  } else {
    return null;
  }
  const [system] = await ex
    .select({ universeId: entities.universeId })
    .from(entities)
    .where(eq(entities.id, systemId));
  if (!system) return null;
  const subtypes = await subtypeDefaults(ex, system.universeId);
  const stars = (
    await selectObjects(
      ex,
      and(
        eq(celestialObjects.parentId, systemId),
        eq(celestialObjects.baseType, 'star'),
        published(viewer),
      ),
    )
  ).map((row) => toViewObject(row, 'system', subtypes));
  const star =
    stars.find((candidate) => candidate.id === body.orbitCenterId) ??
    [...stars].sort((a, b) => (b.size ?? 0) - (a.size ?? 0))[0];
  if (!star) return null;
  const [bx = 0, by = 0, bz = 0] = body.position;
  const [sx, sy, sz] = star.position;
  const length = Math.hypot(sx - bx, sy - by, sz - bz);
  if (length === 0) return null;
  return {
    direction: [(sx - bx) / length, (sy - by) / length, (sz - bz) / length],
    color: star.appearance.color ?? ('#ffffff' as Sunlight['color']),
  };
}

/**
 * `spoilers=exclude` for view payloads: names become their redacted form, memberships flagged
 * as spoilers are left out of outlines, and pins and markers whose location is a spoiler aren't sent at all
 * (ux.md §6). Flags stay, so the client still draws redacted records as redacted.
 */
export function excludeViewSpoilers<T extends object>(view: T): T {
  const result = scrubNames(view) as Record<string, unknown>;
  if (Array.isArray(result.groups)) {
    result.groups = (result.groups as GalaxyView['groups']).map((group) => ({
      ...group,
      members: group.members.filter((member) => !member.isSpoiler),
    }));
  }
  if (Array.isArray(result.pins)) {
    result.pins = (result.pins as OrbitView['pins']).filter((pin) => !pin.locationSpoiler);
  }
  if (Array.isArray(result.markers)) {
    result.markers = (result.markers as GalaxyView['markers']).filter(
      (marker) => !marker.locationSpoiler,
    );
  }
  return result as T;
}

/** Replaces every `namePlain` with the `nameRedacted` next to it, at any depth. */
function scrubNames(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubNames);
  if (typeof value !== 'object' || value === null) return value;
  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(value)) result[key] = scrubNames(field);
  if (typeof result.nameRedacted === 'string') result.namePlain = result.nameRedacted;
  return result;
}
