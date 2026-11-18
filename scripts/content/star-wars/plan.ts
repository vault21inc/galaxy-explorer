import { blackbodyColor, HexColor } from '@ge/domain';
import type { BuiltIds, UniversePlan } from '../build-universe.ts';
import { CHARACTERS, EVENTS, ROUTES, WORLDS, type World } from './catalog.ts';

/**
 * The Star Wars galaxy as Galaxy Explorer content: a public fan map built from the standard
 * galaxy grid. One map, era-neutral; events carry BBY/ABY dates.
 */

/** A grid square's side. The galaxy is about 120,000 ly across and the grid ~20 squares wide. */
const SQUARE_LY = 6_000;
/** The galactic centre on the grid, [column, row]: where L/M meets 9/10, beside Coruscant (L-9). */
const CENTER: [number, number] = [12, 9];

const plain = (source: string) => ({ format: 'plain', source });
const md = (source: string) => ({ format: 'markdown', source });
const round = (n: number) => Math.round(n);

/** A stable number in [0, 1) from a string, so positions don't change between builds. */
function hash01(text: string, salt: number): number {
  let h = 2_166_136_261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return (h >>> 0) / 4_294_967_296;
}

/**
 * A world's place in the galaxy frame (ly). Columns run west to east along +X, rows north to
 * south along +Z, which is how the top view shows them. Worlds sharing a square are spread
 * inside it, deterministically, since the grid is as precise as the sources get.
 */
export function placeWorld(world: World) {
  let column: number;
  let row: number;
  if (world.grid) {
    const match = /^([A-Z])-(\d+)$/.exec(world.grid);
    if (!match?.[1] || !match[2]) throw new Error(`Bad grid square ${world.grid}`);
    column = match[1].charCodeAt(0) - 65 + 0.5;
    row = Number(match[2]) - 0.5;
  } else {
    [column, row] = world.at ?? [0, 0];
  }
  const jitter = (salt: number) => (hash01(world.slug, salt) - 0.5) * 0.6;
  return {
    x: round((column + jitter(1) - CENTER[0]) * SQUARE_LY),
    y: round((hash01(world.slug, 3) - 0.5) * 300),
    z: round((row + jitter(2) - CENTER[1]) * SQUARE_LY),
  };
}

export const UNIVERSE = {
  slug: 'star-wars',
  name: plain('Star Wars'),
  description: md(
    [
      'A galaxy far, far away: its best-known worlds, the Corellian Run, and the battles of the Skywalker saga.',
      '',
      '- **Where things are:** each world sits in its square of the standard galaxy grid (letters west to east, numbers north to south), about 6,000 ly a side. Sources give nothing finer, so worlds sharing a square are spread within it. Coruscant is just off the centre; the Unknown Regions fill the west.',
      '- **Regions** (Core Worlds, Mid Rim, Outer Rim Territories…) are in each world’s facts.',
      '- **Inside a system** the distances are schematic.',
      '- **Spoilers** for the films are hidden until you show them.',
      '',
      '_A fan reference map, not affiliated with Lucasfilm. Star Wars and its names belong to Lucasfilm Ltd._',
    ].join('\n'),
  ),
  dateFormatNotes: plain(
    'Years before or after the Battle of Yavin: "32 BBY", "4 ABY". Sorted with BBY as negative.',
  ),
  settings: { distanceUnitLabels: { galaxy: 'ly', system: 'AU' }, accentColor: '#ffe81f' },
};

export const MAP = {
  slug: 'the-galaxy',
  name: plain('The Galaxy'),
  description: plain('The galaxy across the eras of the Skywalker saga.'),
  sortKey: 0,
  galaxySettings: {
    seed: 1138,
    radiusLy: 60_000,
    thicknessLy: 1_200,
    arms: 4,
    armTwist: 1.0,
    armSpread: 0.45,
    bulgeRadiusLy: 7_000,
    barLengthRadii: 0,
    starPoints: 50_000,
    colors: {
      core: HexColor.parse('#fff1cc'),
      arm: HexColor.parse('#a9c8ff'),
      dust: HexColor.parse('#2e2418'),
    },
  },
};

const SETTINGS: Pick<UniversePlan, 'subtypes' | 'fields' | 'categories' | 'groupTypes'> = {
  subtypes: [
    {
      baseType: 'nebula',
      name: 'Region',
      icon: 'map',
      description: 'A stretch of the galaxy, drawn as a faint cloud.',
    },
  ],
  fields: [
    { key: 'region', label: 'Region', valueType: 'text', appliesToKind: 'celestial_object' },
    { key: 'grid', label: 'Grid square', valueType: 'text', appliesToKind: 'celestial_object' },
    { key: 'sector', label: 'Sector', valueType: 'text', appliesToKind: 'celestial_object' },
  ],
  categories: [
    { name: 'Battle', icon: 'swords', color: '#e5484d' },
    { name: 'Duel', icon: 'zap', color: '#ff9a5c' },
    { name: 'Jedi', icon: 'sparkles', color: '#4fd1ff' },
  ],
  groupTypes: [{ name: 'Sector', layer: 'Administrative', defaultColor: '#ffe81f' }],
};

function need(map: Record<string, string>, key: string, what: string): string {
  const id = map[key];
  if (id === undefined) throw new Error(`No ${what} "${key}"`);
  return id;
}

export function buildOperations(ids: BuiltIds): Record<string, unknown>[] {
  const creates: Record<string, unknown>[] = [];
  const aspects: Record<string, unknown>[] = [];
  const refs = new Map<string, string>();
  const create = (kind: string, slug: string, data: Record<string, unknown>) => {
    const ref = `$op:${String(creates.length)}`;
    refs.set(slug, ref);
    const scope = kind === 'character' ? { universeId: ids.universeId } : { mapId: ids.mapId };
    creates.push({ op: 'create', kind, ...scope, data: { ...data, externalKey: `sw-${slug}` } });
    return ref;
  };
  const ref = (slug: string) => {
    const found = refs.get(slug);
    if (found === undefined) throw new Error(`Nothing created as "${slug}"`);
    return found;
  };
  const link = (id: string, wiki?: string) => {
    if (wiki) {
      aspects.push({
        op: 'addLink',
        id,
        data: { url: `https://starwars.fandom.com/wiki/${encodeURI(wiki)}`, label: 'Wookieepedia' },
      });
    }
  };
  const facts = (id: string, values: Record<string, string | undefined>) => {
    const data = Object.entries(values)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .map(([key, text]) => ({
        fieldDefinitionId: need(ids.fields, key, 'field'),
        value: { type: 'text', text: plain(text) },
      }));
    if (data.length > 0) aspects.push({ op: 'setFacts', id, data });
  };
  // Inside a system, a body goes round at `r` (schematic AU), at an angle from its name.
  const around = (slug: string, r: number) => {
    const angle = hash01(slug, 7) * 2 * Math.PI;
    return {
      x: Math.round(r * Math.cos(angle) * 100) / 100,
      y: 0,
      z: Math.round(-r * Math.sin(angle) * 100) / 100,
    };
  };

  // The Unknown Regions: the uncharted west, as one faint cloud.
  create('celestial_object', 'unknown-regions', {
    name: plain('Unknown Regions'),
    summary: plain(
      'The uncharted west of the galaxy, behind a maze of hyperspace anomalies; home to the Chiss and, much later, the First Order’s refuge.',
    ),
    baseType: 'nebula',
    subtypeId: need(ids.subtypes, 'Region', 'subtype'),
    x: -42_000,
    y: 0,
    z: 6_000,
    appearance: {
      labelPriority: 8,
      region: {
        shape: 'disc',
        radius: 22_000,
        density: 0.12,
        color: '#3a3f5a',
        rimColor: '#6a7090',
      },
    },
  });

  for (const world of WORLDS) {
    const primary = world.stars[0];
    if (!primary) throw new Error(`${world.slug} has no star`);
    const system = create('celestial_object', world.slug, {
      name: plain(world.name),
      summary: md(world.summary),
      baseType: 'system',
      explorable: true,
      ...placeWorld(world),
      appearance: { color: blackbodyColor(primary.tempK), labelPriority: world.priority ?? 5 },
    });
    facts(system, {
      region: world.region,
      grid: world.grid ?? 'none (Unknown Regions)',
      sector: world.sector ? `${world.sector} sector` : undefined,
    });
    link(system, world.wiki);
    for (const star of world.stars) {
      create('celestial_object', star.slug, {
        name: plain(star.name),
        baseType: 'star',
        parentId: system,
        x: star.at?.[0] ?? 0,
        y: 0,
        z: star.at?.[1] ?? 0,
        appearance: { star: { temperatureK: star.tempK } },
      });
    }
    for (const body of world.bodies) {
      const planet = create('celestial_object', body.slug, {
        name: plain(body.name),
        summary: md(body.summary),
        baseType: 'planet',
        parentId: system,
        explorable: true,
        ...around(body.slug, body.orbit),
        appearance: {
          scale: { system: body.scale ?? 0.6 },
          planet: {
            preset: body.preset,
            ...(body.palette ? { palette: body.palette } : {}),
            ...body.extra,
          },
        },
      });
      link(planet, body.wiki);
      (body.moons ?? []).forEach((moon, i) => {
        const id = create('celestial_object', moon.slug, {
          name: plain(moon.name),
          summary: md(moon.summary),
          baseType: 'moon',
          parentId: planet,
          explorable: true,
          ...around(moon.slug, 2.6 + i * 0.8),
          appearance: {
            scale: { orbit: moon.scale ?? 1 },
            planet: { preset: moon.preset, ...(moon.palette ? { palette: moon.palette } : {}) },
          },
        });
        link(id, moon.wiki);
      });
      for (const station of body.stations ?? []) {
        const id = create('celestial_object', station.slug, {
          name: plain(station.name),
          summary: plain(station.summary),
          baseType: 'station',
          parentId: planet,
          x: 1.15,
          y: 0.1,
          z: 0,
        });
        link(id, station.wiki);
      }
    }
  }

  // Sectors with more than one world on the map: compact, so their outlines read well.
  const sectors = new Map<string, string[]>();
  for (const world of WORLDS) {
    if (world.sector) sectors.set(world.sector, [...(sectors.get(world.sector) ?? []), world.slug]);
  }
  for (const [sector, members] of sectors) {
    if (members.length < 2) continue;
    const id = create('group', `${sector.toLowerCase()}-sector`, {
      name: plain(`${sector} sector`),
      groupTypeId: need(ids.groupTypes, 'Sector', 'group type'),
      outlineColor: '#ffe81f',
    });
    aspects.push({ op: 'addMembers', id, data: members.map((slug) => ({ objectId: ref(slug) })) });
  }

  for (const route of ROUTES) {
    const id = create('route', route.slug, {
      name: plain(route.name),
      summary: plain(route.summary),
      style: { color: route.color, widthPx: 2, dashed: false },
    });
    aspects.push({ op: 'setWaypoints', id, data: route.stops.map(ref) });
    link(id, route.wiki);
  }

  for (const person of CHARACTERS) {
    link(
      create('character', person.slug, { name: plain(person.name), summary: md(person.summary) }),
      person.wiki,
    );
  }
  for (const event of EVENTS) {
    const id = create('event', event.slug, {
      name: plain(event.name),
      summary: md(event.summary),
      isSpoiler: event.isSpoiler ?? false,
      categoryId: need(ids.categories, event.category, 'event category'),
      dateText: event.date,
      dateSort: event.sort,
    });
    aspects.push({ op: 'setLocation', id, data: { mode: 'object', objectId: ref(event.at) } });
    for (const who of event.people) {
      aspects.push({
        op: 'addRelation',
        id: ref(who),
        data: { relationType: 'participant', toEntityId: id },
      });
    }
    link(id, event.wiki);
  }
  return [...creates, ...aspects];
}

export const PLAN: UniversePlan = {
  title: 'the Star Wars galaxy',
  universe: UNIVERSE,
  map: MAP,
  ...SETTINGS,
  operations: buildOperations,
};
