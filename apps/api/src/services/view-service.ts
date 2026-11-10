import { schema, type Executor } from '@ge/db';
import {
  objectTypes,
  resolveAppearance,
  type Appearance,
  type BaseType,
  type GalaxyObject,
  type GalaxyView,
  type OrbitView,
  type SystemView,
  type ViewLevel,
  type ViewObject,
} from '@ge/domain';
import { and, asc, eq, inArray, isNull, type SQL } from 'drizzle-orm';
import { InvalidRequest, NotFound } from './errors.ts';
import { getMap } from './container-service.ts';
import { named, published } from './view-common.ts';
import { loadPins } from './view-pins.ts';
import { entityVisible, type Viewer } from './visibility.ts';

/**
 * The view payloads (architecture.md §6, M1-T9): one request per view, ready to draw.
 * Appearances are resolved with the same `resolveAppearance` the browser uses for previews.
 */

const { entities, celestialObjects, objectGroups, groupMembers, groupTypes, objectSubtypes, maps } =
  schema;

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
    appearance,
    size,
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
  const galaxyObjects: GalaxyObject[] = objects.map((object) => ({
    ...object,
    ...(glyphs.get(object.id) ?? { ...NO_GLYPH, stars: [] }),
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
    routes: [],
    groupTypes: (
      await ex
        .select()
        .from(groupTypes)
        .where(eq(groupTypes.universeId, map.universeId))
        .orderBy(asc(groupTypes.sortKey), asc(groupTypes.name))
    ).map(({ universeId: _universeId, ...type }) => type) as GalaxyView['groupTypes'],
  };
}

/**
 * The system or orbit view of an object: the subject, its ancestors for breadcrumbs, its direct
 * children, and (orbit views) the pins on it. The subject's base type must open this view.
 */
/** The glyph fields of an object that isn't a system, or a system with nothing inside. */
const NO_GLYPH = { planetCount: 0, spoilerPlanetCount: 0 } as const;

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
): Promise<SystemView> {
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

  const children = await selectObjects(
    ex,
    and(eq(celestialObjects.parentId, id), published(viewer)),
  );
  return {
    map: { id: map.id as ViewObject['id'], ...named(map) },
    ancestors,
    subject: {
      ...toViewObject(subject, level, subtypes),
      parentId: subject.parentId as ViewObject['subtypeId'],
    },
    children: children.map((child) => toViewObject(child, level, subtypes)),
  };
}

export function systemView(ex: Executor, id: string, viewer: Viewer): Promise<SystemView> {
  return subjectView(ex, id, 'system', viewer);
}

export async function orbitView(ex: Executor, id: string, viewer: Viewer): Promise<OrbitView> {
  const view = await subjectView(ex, id, 'orbit', viewer);
  return { ...view, pins: await loadPins(ex, id, viewer) };
}

/**
 * `spoilers=exclude` for view payloads: names become their redacted form, memberships flagged
 * as spoilers are left out of outlines, and pins whose location is a spoiler aren't sent at all
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
