import { blackbodyColor, HexColor } from '@ge/domain';
import type { BuiltIds, UniversePlan } from '../build-universe.ts';
import {
  BORG_SITES,
  CHARACTERS,
  EVENTS,
  POWERS,
  REGIONS,
  ROUTES,
  SOL,
  WORLDS,
  type Power,
} from './catalog.ts';

/**
 * The Star Trek galaxy as Galaxy Explorer content: a public fan map of the Milky Way in the
 * 24th century, with the four quadrants, the great powers as outlines, the Bajoran wormhole and
 * Voyager's road home. One map; events carry Common Era years.
 */

const plain = (source: string) => ({ format: 'plain', source });
const md = (source: string) => ({ format: 'markdown', source });

/** A stable number in [0, 1) from a string, so positions don't change between builds. */
function hash01(text: string, salt: number): number {
  let h = 2_166_136_261 ^ salt;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16_777_619);
  }
  return (h >>> 0) / 4_294_967_296;
}

/** A place on the galaxy at [x, z], a little above or below the plane so it isn't flat. */
const placed = (slug: string, [x, z]: readonly [number, number]) => ({
  x,
  y: Math.round((hash01(slug, 3) - 0.5) * 120),
  z,
});

export const UNIVERSE = {
  slug: 'star-trek',
  name: plain('Star Trek'),
  description: md(
    [
      'The Milky Way of the 24th century: the Federation and its neighbours, the four quadrants, the Bajoran wormhole and Voyager’s long road home.',
      '',
      '- **The quadrants** are quarters of the galaxy cut by two lines through its core. Earth sits on the line between Alpha (left in the top view) and Beta (right).',
      '- **Where things are:** the shows give few positions, so the Federation, Klingon, Romulan and Cardassian worlds are laid out schematically around Sol, a few thousand light-years across, keeping who borders whom. Real stars’ true distances are in the facts. The far quadrants keep the distances the shows state: about 70,000 ly to the Gamma end of the wormhole, and to Ocampa.',
      '- **The powers** are outlines around their worlds; the galactic barrier rings the rim, and the Great Barrier hides the core.',
      '- **Inside a system** the distances are schematic.',
      '- **Spoilers** for the shows and films are hidden until you show them.',
      '',
      '_A fan reference map, not affiliated with Paramount or CBS Studios. Star Trek and its names belong to their owners._',
    ].join('\n'),
  ),
  dateFormatNotes: plain('Years of the Common Era, such as "2364". Stardates are left out.'),
  settings: { distanceUnitLabels: { galaxy: 'ly', system: 'AU' }, accentColor: '#ff9c00' },
};

export const MAP = {
  slug: 'the-galaxy',
  name: plain('The Galaxy'),
  description: plain('The Milky Way in the 24th century, from first contact to the Dominion War.'),
  sortKey: 0,
  // The Milky Way's own look (scripts/content/milky-way): a barred spiral 100,000 ly across.
  galaxySettings: {
    seed: 1701,
    radiusLy: 50_000,
    thicknessLy: 1_000,
    arms: 4,
    armTwist: 1.15,
    armSpread: 0.4,
    bulgeRadiusLy: 4_500,
    barLengthRadii: 0.32,
    starPoints: 50_000,
    colors: {
      core: HexColor.parse('#ffd9a0'),
      arm: HexColor.parse('#b4ccff'),
      dust: HexColor.parse('#3b2a1e'),
    },
  },
};

const SETTINGS: Pick<UniversePlan, 'subtypes' | 'fields' | 'categories' | 'groupTypes'> = {
  subtypes: [
    {
      baseType: 'nebula',
      name: 'Quadrant',
      icon: 'map',
      description: 'A quarter of the galaxy, drawn as a faint cloud.',
    },
    {
      baseType: 'nebula',
      name: 'Border zone',
      icon: 'shield',
      description: 'A strip of space no one may enter, kept by treaty.',
    },
    { baseType: 'anomaly', name: 'Barrier', icon: 'zap' },
  ],
  fields: [
    { key: 'quadrant', label: 'Quadrant', valueType: 'text', appliesToKind: 'celestial_object' },
    {
      key: 'affiliation',
      label: 'Affiliation',
      valueType: 'text',
      appliesToKind: 'celestial_object',
    },
    { key: 'star', label: 'Real star', valueType: 'text', appliesToKind: 'celestial_object' },
  ],
  categories: [
    { name: 'Battle', icon: 'swords', color: '#e5484d' },
    { name: 'First contact', icon: 'radio', color: '#4fd1ff' },
    { name: 'Diplomacy', icon: 'handshake', color: '#ffd166' },
    { name: 'Exploration', icon: 'telescope', color: '#7aa2ff' },
    { name: 'Disaster', icon: 'flame', color: '#ff8a3d' },
  ],
  groupTypes: [
    { name: 'Power', layer: 'Political', defaultColor: '#5b9cff' },
    { name: 'Barrier', layer: 'Galactic', defaultColor: '#d070ff' },
  ],
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
    creates.push({ op: 'create', kind, ...scope, data: { ...data, externalKey: `st-${slug}` } });
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
        data: {
          url: `https://memory-alpha.fandom.com/wiki/${encodeURI(wiki)}`,
          label: 'Memory Alpha',
        },
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
  const quadrantOf = ([x, z]: readonly [number, number]) =>
    `${z < 0 ? (x < 0 ? 'Gamma' : 'Delta') : x < 0 ? 'Alpha' : 'Beta'} Quadrant`;

  // The quadrants: one faint disc inside each quarter, so its label sits in the middle of it.
  for (const q of REGIONS.quadrants) {
    link(
      create('celestial_object', q.slug, {
        name: plain(q.name),
        summary: plain(q.summary),
        baseType: 'nebula',
        subtypeId: need(ids.subtypes, 'Quadrant', 'subtype'),
        x: q.at[0],
        y: 0,
        z: q.at[1],
        appearance: {
          labelPriority: 9,
          region: { shape: 'disc', radius: 12_000, density: 0.07, color: q.color },
        },
      }),
      q.wiki,
    );
  }

  // The Great Barrier: a storm of energy around the galactic core.
  link(
    create('celestial_object', 'great-barrier', {
      name: plain('Great Barrier'),
      summary: plain(
        'An energy field around the galactic core that no probe had come back from, until a stolen Enterprise crossed it in 2287 looking for Sha Ka Ree.',
      ),
      baseType: 'anomaly',
      subtypeId: need(ids.subtypes, 'Barrier', 'subtype'),
      x: 0,
      y: 0,
      z: 0,
      appearance: {
        labelPriority: 7,
        region: {
          shape: 'storm',
          radius: 3_000,
          density: 0.5,
          color: '#5a3a8a',
          rimColor: '#c8a0ff',
          innerRadius: 0.5,
          filaments: 0.7,
        },
      },
    }),
    'Great_Barrier',
  );

  // The Romulan Neutral Zone: a band between the Federation and the Romulans (a rift).
  const zoneAt = [SOL[0] + 1_450, SOL[1] - 2_900] as const;
  const zone = create('celestial_object', 'romulan-neutral-zone', {
    name: plain('Romulan Neutral Zone'),
    summary: plain(
      'The strip of space between the Federation and the Romulan Star Empire, set by treaty in 2160. Crossing it is an act of war.',
    ),
    baseType: 'nebula',
    subtypeId: need(ids.subtypes, 'Border zone', 'subtype'),
    ...placed('romulan-neutral-zone', zoneAt),
    appearance: {
      labelPriority: 6,
      region: {
        shape: 'rift',
        radius: 260,
        density: 0.5,
        color: '#5aa070',
        path: [
          [-1_850, 200],
          [-550, -200],
          [850, -200],
          [1_850, 200],
        ],
      },
    },
  });
  facts(zone, { quadrant: 'Beta Quadrant' });
  link(zone, 'Romulan_Neutral_Zone');

  for (const nebula of REGIONS.nebulae) {
    const id = create('celestial_object', nebula.slug, {
      name: plain(nebula.name),
      summary: plain(nebula.summary),
      baseType: 'nebula',
      ...placed(nebula.slug, nebula.at),
      appearance: {
        labelPriority: 5,
        region: { shape: 'sphere', radius: nebula.radius, density: 0.45, color: nebula.color },
      },
    });
    facts(id, { quadrant: quadrantOf(nebula.at) });
    link(id, nebula.wiki);
  }

  // The Badlands: plasma storms on the Cardassian border, the Maquis's hiding place.
  const badlandsAt = [SOL[0] - 3_300, SOL[1] + 2_000] as const;
  const badlands = create('celestial_object', 'badlands', {
    name: plain('Badlands'),
    summary: plain(
      'A region of plasma storms near the Cardassian border, where the Maquis hid, and where Voyager was lost chasing them.',
    ),
    baseType: 'anomaly',
    ...placed('badlands', badlandsAt),
    appearance: {
      labelPriority: 5,
      region: {
        shape: 'storm',
        radius: 500,
        density: 0.6,
        color: '#8a2a2a',
        rimColor: '#ff9a5a',
        innerRadius: 0.3,
        filaments: 0.8,
      },
    },
  });
  facts(badlands, { quadrant: 'Alpha Quadrant' });
  link(badlands, 'Badlands');

  for (const world of WORLDS) {
    const primary = world.stars[0];
    if (!primary) throw new Error(`${world.slug} has no star`);
    const system = create('celestial_object', world.slug, {
      name: plain(world.name),
      summary: md(world.summary),
      baseType: 'system',
      explorable: world.bodies.length > 0,
      ...placed(world.slug, world.at),
      appearance: { color: blackbodyColor(primary.tempK), labelPriority: world.priority ?? 5 },
    });
    facts(system, {
      quadrant:
        world.slug === 'sol'
          ? 'Alpha Quadrant, on the line with the Beta Quadrant'
          : `${world.quadrant} Quadrant`,
      affiliation: world.affiliation,
      star: world.realStar,
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
        // A little smaller than the default, so the nearest planet's orbit clears it.
        appearance: { star: { temperatureK: star.tempK }, scale: { system: 0.75 } },
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
      (body.stations ?? []).forEach((station, i) => {
        const id = create('celestial_object', station.slug, {
          name: plain(station.name),
          summary: plain(station.summary),
          baseType: 'station',
          parentId: planet,
          // Beside the planet, a second one on the other side.
          x: i === 0 ? 1.15 : -1.15,
          y: 0.1,
          z: 0,
        });
        link(id, station.wiki);
      });
    }
  }

  // The Borg's structures, straight on the galaxy: they belong to no star system.
  for (const site of BORG_SITES) {
    const id = create('celestial_object', site.slug, {
      name: plain(site.name),
      summary: md(site.summary),
      baseType: 'station',
      ...placed(site.slug, site.at),
      appearance: { color: '#7bd84a', labelPriority: 7 },
    });
    facts(id, { quadrant: quadrantOf(site.at), affiliation: 'Borg Collective' });
    link(id, site.wiki);
  }

  // The powers' outlines around their worlds.
  const members: Record<Power, string[]> = {
    federation: [],
    klingon: [],
    romulan: [],
    cardassian: [],
    dominion: [],
    borg: BORG_SITES.map((site) => site.slug),
  };
  for (const world of WORLDS) if (world.power) members[world.power].push(world.slug);
  for (const power of POWERS) {
    const id = create('group', power.key, {
      name: plain(power.name),
      summary: plain(power.summary),
      groupTypeId: need(ids.groupTypes, 'Power', 'group type'),
      outlineColor: power.color,
    });
    aspects.push({
      op: 'addMembers',
      id,
      data: members[power.key].map((slug) => ({ objectId: ref(slug) })),
    });
    link(id, power.wiki);
  }

  // The galactic barrier: a band just inside the rim, with no members (D-53's pinned ring).
  link(
    create('group', 'galactic-barrier', {
      name: plain('Galactic barrier'),
      summary: plain(
        'A field of negative energy around the rim of the galaxy, glowing pink and purple up close. The first Enterprise to touch it lost its helmsman to it.',
      ),
      groupTypeId: need(ids.groupTypes, 'Barrier', 'group type'),
      outlineColor: '#d070ff',
      style: {
        shape: 'ring',
        fillOpacity: 0.1,
        ring: { center: [0, 0], innerRadiusLy: 47_000, outerRadiusLy: 49_500, labelDeg: 120 },
      },
    }),
    'Galactic_barrier',
  );

  for (const route of ROUTES) {
    const id = create('route', route.slug, {
      name: plain(route.name),
      summary: plain(route.summary),
      style: { color: route.color, widthPx: 2, dashed: route.dashed },
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
      isSpoiler: 'isSpoiler' in event ? event.isSpoiler : false,
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
  title: 'the Star Trek galaxy',
  universe: UNIVERSE,
  map: MAP,
  ...SETTINGS,
  operations: buildOperations,
};
