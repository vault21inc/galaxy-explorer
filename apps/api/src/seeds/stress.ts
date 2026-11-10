import { schema, withBatch, type Database, type Executor } from '@ge/db';
import {
  resolveGalaxySettings,
  RouteStyle,
  rt,
  sampleGalaxyPosition,
  seededRandom,
  type BaseType,
} from '@ge/domain';
import { eq, sql } from 'drizzle-orm';
import { SEED_ACTOR } from './demo.ts';
import { ensureConfig, ensureMap, ensureUniverse } from './ensure.ts';

/**
 * `pnpm db:seed stress` (M1-T11): a large map for performance work (rendering.md §2), generated
 * deterministically from a seed. Positions follow the galaxy density function, and groups are
 * spatial clusters: each object joins the group whose center is nearest. Routes (M4-T7) hop
 * from a random system to its nearest unvisited neighbours.
 *
 * It writes in bulk rather than through the entity service, which would take far longer for
 * thousands of rows, but still inside a change batch, so it's audited and revertable. Rows are
 * upserted by external key, so running it again keeps the same ids and content.
 */

export interface StressOptions {
  objects: number;
  groups: number;
  /** Routes through nearby systems (M4-T7). */
  routes: number;
  seed: number;
}

export const STRESS_DEFAULTS: StressOptions = {
  objects: 5_000,
  groups: 300,
  routes: 50,
  seed: 40_000,
};

/** How many systems a stress route passes through: 4, plus up to 4 more. */
const STRESS_ROUTE_MIN_STOPS = 4;
const STRESS_ROUTE_EXTRA_STOPS = 5;

/** Rows per INSERT, to keep each statement's parameters within Postgres's limit. */
const CHUNK = 1_000;

/** Mostly systems, like an authored galaxy, with a few of the other top-level types. */
function baseTypeFor(roll: number): BaseType {
  if (roll < 0.94) return 'system';
  if (roll < 0.97) return 'station';
  if (roll < 0.98) return 'black_hole';
  if (roll < 0.99) return 'nebula';
  return 'anomaly';
}

const pad = (n: number) => String(n).padStart(5, '0');

/** The first few regions of a type get the larger shapes (M4-T6): storms and rifts. */
const STRESS_STORMS = 5;
const STRESS_RIFTS = 3;

/**
 * A region's appearance on the stress map. Most are round clouds; the first anomalies are storms
 * and the first nebulae are rifts, so the stress map exercises every region renderer. Shapes come
 * from the region's place among its type, not from the seed's random stream, so the other
 * objects keep their positions.
 */
function regionAppearance(baseType: BaseType, nth: number) {
  if (baseType === 'anomaly' && nth < STRESS_STORMS) {
    return {
      region: {
        shape: 'storm' as const,
        radius: 3_000 + nth * 400,
        gaps: nth === 0 ? [{ angleDeg: 300, widthDeg: 25 }] : [],
      },
    };
  }
  if (baseType === 'nebula' && nth < STRESS_RIFTS) {
    // A gentle S-curve about 18,000 ly long, turned differently for each rift.
    const turn = nth * 1.1;
    const path = [-9_000, -3_000, 3_000, 9_000].map((along, k): [number, number] => {
      const sideways = (k % 2 === 0 ? 1 : -1) * 1_500;
      return [
        Math.round(along * Math.cos(turn) - sideways * Math.sin(turn)),
        Math.round(along * Math.sin(turn) + sideways * Math.cos(turn)),
      ];
    });
    return { region: { shape: 'rift' as const, radius: 900, path } };
  }
  return { region: { radius: 1_200 } };
}
const {
  entities,
  celestialObjects,
  objectGroups,
  groupMembers,
  routes: routeTable,
  routeWaypoints,
} = schema;

export async function seedStress(db: Database, options: Partial<StressOptions> = {}) {
  const { objects, groups, routes, seed } = { ...STRESS_DEFAULTS, ...options };
  const description = `Seed: stress (${String(objects)} objects, ${String(groups)} groups, ${String(routes)} routes)`;
  const { result } = await withBatch(db, SEED_ACTOR, description, async (tx, batchId) => {
    const universe = await ensureUniverse(tx, {
      slug: 'stress-test',
      name: rt.plain('Stress Test'),
    });
    const galaxySettings = { seed, radiusLy: 60_000, arms: 4, armTwist: 1.3, armSpread: 0.3 };
    const map = await ensureMap(tx, universe.id, {
      slug: 'main',
      name: rt.plain('Stress Map'),
      galaxySettings,
    });
    const groupTypeId = await ensureConfig(tx, 'group_types', universe.id, {
      name: 'Sector',
      layer: 'Administrative',
      defaultColor: '#4fd1ff',
    });
    const scope = { universeId: universe.id, mapId: map.id };
    const density = resolveGalaxySettings(galaxySettings);

    // Objects.
    const random = seededRandom(seed);
    const objectRows = Array.from({ length: objects }, (_, index) => {
      const baseType = baseTypeFor(random());
      const position = sampleGalaxyPosition(density, random);
      return {
        key: `stress-object-${pad(index)}`,
        name: `${baseType === 'system' ? 'System' : baseType.replace('_', ' ')} ${pad(index)}`,
        baseType,
        position,
      };
    });
    const objectIds = await upsertEntities(tx, scope, 'celestial_object', objectRows);
    // Each region's place among regions of its type, for its shape.
    const seen = new Map<BaseType, number>();
    const regionNth = objectRows.map((row) => {
      const nth = seen.get(row.baseType) ?? 0;
      seen.set(row.baseType, nth + 1);
      return nth;
    });
    for (let start = 0; start < objectRows.length; start += CHUNK) {
      const chunk = objectRows.slice(start, start + CHUNK).map((row, offset) => ({
        entityId: objectIds.get(row.key) ?? '',
        mapId: map.id,
        baseType: row.baseType,
        explorable: row.baseType === 'system',
        x: row.position[0],
        y: row.position[1],
        z: row.position[2],
        appearance:
          row.baseType === 'nebula' || row.baseType === 'anomaly'
            ? regionAppearance(row.baseType, regionNth[start + offset] ?? 0)
            : {},
      }));
      await tx
        .insert(celestialObjects)
        .values(chunk)
        .onConflictDoUpdate({
          target: celestialObjects.entityId,
          set: {
            baseType: sql`excluded.base_type`,
            parentId: sql`null`,
            explorable: sql`excluded.explorable`,
            x: sql`excluded.x`,
            y: sql`excluded.y`,
            z: sql`excluded.z`,
            appearance: sql`excluded.appearance`,
          },
        });
    }

    // Groups: centers sampled from the same density (a separate stream), objects to the nearest.
    const centerRandom = seededRandom(seed + 1);
    const centers = Array.from({ length: groups }, () =>
      sampleGalaxyPosition(density, centerRandom),
    );
    const groupRows = centers.map((_, index) => ({
      key: `stress-group-${pad(index)}`,
      name: `Sector ${pad(index)}`,
    }));
    const groupIds = await upsertEntities(tx, scope, 'group', groupRows);
    await tx
      .insert(objectGroups)
      .values(
        groupRows.map((row, index) => ({
          entityId: groupIds.get(row.key) ?? '',
          mapId: map.id,
          groupTypeId,
          outlineColor: `#${(0x404040 + ((index * 2_654_435_761) % 0xbfbfbf)).toString(16).padStart(6, '0')}`,
        })),
      )
      .onConflictDoUpdate({
        target: objectGroups.entityId,
        set: {
          groupTypeId: sql`excluded.group_type_id`,
          outlineColor: sql`excluded.outline_color`,
        },
      });

    const nearest = (position: readonly number[]) => {
      let best = 0;
      let bestDistance = Infinity;
      for (const [index, center] of centers.entries()) {
        const distance =
          ((position[0] ?? 0) - center[0]) ** 2 + ((position[2] ?? 0) - center[2]) ** 2;
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      }
      return best;
    };
    // Rebuilt each run: membership rows have no id, so this leaves identical rows.
    await tx.delete(groupMembers).where(eq(groupMembers.mapId, map.id));
    const memberRows = objectRows.map((row) => ({
      groupId: groupIds.get(groupRows[nearest(row.position)]?.key ?? '') ?? '',
      groupTypeId,
      mapId: map.id,
      objectId: objectIds.get(row.key) ?? '',
    }));
    for (let start = 0; start < memberRows.length; start += CHUNK) {
      await tx.insert(groupMembers).values(memberRows.slice(start, start + CHUNK));
    }

    // Routes: each starts at a random system and hops to the nearest system it hasn't visited.
    const routeRandom = seededRandom(seed + 2);
    const systems = objectRows.filter((row) => row.baseType === 'system');
    const routeRows = Array.from({ length: systems.length > 1 ? routes : 0 }, (_, index) => {
      const hops = STRESS_ROUTE_MIN_STOPS + Math.floor(routeRandom() * STRESS_ROUTE_EXTRA_STOPS);
      const stops = [systems[Math.floor(routeRandom() * systems.length)] ?? systems[0]];
      while (stops.length < Math.min(hops, systems.length)) {
        const last = stops.at(-1)?.position ?? [0, 0, 0];
        let next = systems[0];
        let nextDistance = Infinity;
        for (const candidate of systems) {
          if (stops.includes(candidate)) continue;
          const distance =
            (candidate.position[0] - last[0]) ** 2 + (candidate.position[2] - last[2]) ** 2;
          if (distance < nextDistance) {
            next = candidate;
            nextDistance = distance;
          }
        }
        stops.push(next);
      }
      return { key: `stress-route-${pad(index)}`, name: `Route ${pad(index)}`, stops };
    });
    const routeIds = await upsertEntities(tx, scope, 'route', routeRows);
    if (routeRows.length > 0) {
      await tx
        .insert(routeTable)
        .values(
          routeRows.map((row, index) => ({
            entityId: routeIds.get(row.key) ?? '',
            mapId: map.id,
            style: RouteStyle.parse({
              color: index % 2 === 0 ? '#c8a24a' : '#7fd4a0',
              dashed: index % 3 === 0,
            }),
          })),
        )
        .onConflictDoUpdate({ target: routeTable.entityId, set: { style: sql`excluded.style` } });
    }
    // Rebuilt each run, like memberships.
    await tx.delete(routeWaypoints).where(eq(routeWaypoints.mapId, map.id));
    const waypointRows = routeRows.flatMap((row) =>
      row.stops.map((stop, seq) => ({
        routeId: routeIds.get(row.key) ?? '',
        seq,
        mapId: map.id,
        objectId: objectIds.get(stop?.key ?? '') ?? '',
      })),
    );
    if (waypointRows.length > 0) await tx.insert(routeWaypoints).values(waypointRows);

    await tx
      .update(schema.changeBatches)
      .set({ universeId: universe.id })
      .where(eq(schema.changeBatches.id, batchId));
    return { universeId: universe.id, mapId: map.id, objects, groups, routes: routeRows.length };
  });
  return result;
}

/** Inserts or updates entities by external key, in chunks; returns their ids by key. */
async function upsertEntities(
  tx: Executor,
  scope: { universeId: string; mapId: string },
  kind: 'celestial_object' | 'group' | 'route',
  rows: readonly { key: string; name: string }[],
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (let start = 0; start < rows.length; start += CHUNK) {
    const saved = await tx
      .insert(entities)
      .values(
        rows.slice(start, start + CHUNK).map((row) => ({
          ...scope,
          kind,
          name: rt.plain(row.name),
          namePlain: row.name,
          externalKey: row.key,
        })),
      )
      .onConflictDoUpdate({
        // The partial unique index on (universe, map, external_key): the predicate must match it.
        target: [entities.universeId, entities.mapId, entities.externalKey],
        targetWhere: sql`external_key is not null`,
        set: { name: sql`excluded.name`, namePlain: sql`excluded.name_plain` },
      })
      .returning({ id: entities.id, key: entities.externalKey });
    for (const row of saved) ids.set(row.key ?? '', row.id);
  }
  return ids;
}
