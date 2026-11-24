import { blackbodyColor, HexColor } from '@ge/domain';
import { ARMS, ARM_INFO, FERMI_LOBE_LY, REGIONS, SYSTEMS, type Pos } from './catalog.ts';
import { CHARACTERS, EVENTS } from './events.ts';
import {
  armPoint,
  barRotationDeg,
  equatorialToGalactic,
  galacticToGalactocentric,
  makeFrame,
  R0_LY,
  type ArmFit,
} from './geo.ts';
import { SOLAR, SOLAR_BELTS, SOLAR_STATIONS } from './solar.ts';

/**
 * The Milky Way as Galaxy Explorer content: the universe, its map's generated background, its
 * settings (subtypes, facts, event categories, group types), and one batch of operations for the
 * MCP `batch` tool that creates everything in it.
 */

export const UNIVERSE = {
  slug: 'milky-way',
  name: { format: 'plain', source: 'The Milky Way' },
  description: {
    format: 'markdown',
    source: [
      'Our own Galaxy, as astronomers know it today: about 150 real stars, nebulae, clusters, black holes and satellite galaxies, each placed from its catalogue position and distance, with the spiral arms as traced by maser parallaxes (Reid et al. 2019).',
      '',
      "- **Frame:** the centre is Sagittarius A*. The Sun is 26,670 ly out (8.18 kpc) and 68 ly north of the plane; the bar's near end points 28° from the Sun–centre line.",
      '- **Seen from above you look up from the south galactic pole** (galactic north is down), so the Galaxy turns counter-clockwise on screen and its arms wind as they really do.',
      "- **The background** is the app's generated spiral, fitted to the measured arms; only the arm bands are real traces.",
      '- **Sizes are not to scale.** The Solar System uses real distances in AU; compact systems elsewhere are drawn wider, as each one says. Facts hold the real values.',
    ].join('\n'),
  },
  dateFormatNotes: {
    format: 'plain',
    source: 'Common Era (Gregorian) dates, such as "20 July 1969".',
  },
  settings: { distanceUnitLabels: { galaxy: 'ly', system: 'AU' }, accentColor: '#ffd27f' },
};

/**
 * The generated background (GalaxySettings), fitted to the measured arms by `fit.ts`: four arms
 * whose pitch near the Sun is about 12°, as measured, starting at the ends of a long bar.
 */
export const GALAXY_SETTINGS = {
  seed: 1977,
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
};

export const MAP = {
  slug: 'present-day',
  name: { format: 'plain', source: 'Present day' },
  description: { format: 'plain', source: 'The Galaxy as we see it now.' },
  sortKey: 0,
  galaxySettings: GALAXY_SETTINGS,
};

/** The fitted bar angle is 1° more than Wegg et al.'s 27°: within its error, and the arms fit better. */
export const ROTATION_DEG = barRotationDeg() + 1;
const frame = makeFrame(ROTATION_DEG);

export const SUBTYPES = [
  {
    baseType: 'nebula',
    name: 'Spiral arm',
    icon: 'waves',
    description: 'A spiral arm traced from measured positions of young stars and gas.',
  },
  { baseType: 'anomaly', name: 'Galactic structure', icon: 'orbit' },
  {
    baseType: 'nebula',
    name: 'H II region',
    icon: 'cloud',
    description: 'Hydrogen gas glowing under the light of young, hot stars: a stellar nursery.',
  },
  { baseType: 'nebula', name: 'Star-forming complex', icon: 'cloud' },
  { baseType: 'nebula', name: 'Molecular cloud', icon: 'cloud' },
  { baseType: 'nebula', name: 'Dark nebula', icon: 'cloud-moon' },
  {
    baseType: 'nebula',
    name: 'Supernova remnant',
    icon: 'sparkles',
    description: 'The expanding debris of an exploded star.',
  },
  {
    baseType: 'nebula',
    name: 'Planetary nebula',
    icon: 'circle-dot',
    description:
      'The outer layers shed by a dying Sun-like star, lit by the white dwarf left behind.',
  },
  { baseType: 'nebula', name: 'Superbubble', icon: 'circle' },
  {
    baseType: 'nebula',
    name: 'Open cluster',
    icon: 'sparkle',
    description: 'A loose group of young stars born together.',
  },
  {
    baseType: 'nebula',
    name: 'Globular cluster',
    icon: 'sparkle',
    description: 'A dense ball of hundreds of thousands of ancient stars orbiting in the halo.',
  },
  {
    baseType: 'nebula',
    name: 'Dwarf galaxy',
    icon: 'orbit',
    description: 'A small galaxy orbiting the Milky Way.',
  },
];

interface FieldDef {
  key: string;
  label: string;
  valueType: 'number' | 'text' | 'date_text';
  unit?: string;
  appliesToKind: 'celestial_object';
  appliesToBaseType?: string;
}
export const FIELDS: FieldDef[] = [
  {
    key: 'distance_ly',
    label: 'Distance from the Sun',
    valueType: 'number',
    unit: 'ly',
    appliesToKind: 'celestial_object',
  },
  {
    key: 'constellation',
    label: 'Constellation',
    valueType: 'text',
    appliesToKind: 'celestial_object',
  },
  {
    key: 'galactic_coords',
    label: 'Galactic coordinates',
    valueType: 'text',
    appliesToKind: 'celestial_object',
  },
  { key: 'spiral_arm', label: 'Spiral arm', valueType: 'text', appliesToKind: 'celestial_object' },
  {
    key: 'spectral_type',
    label: 'Spectral type',
    valueType: 'text',
    appliesToKind: 'celestial_object',
    appliesToBaseType: 'star',
  },
  {
    key: 'mass_sun',
    label: 'Mass',
    valueType: 'number',
    unit: 'M☉',
    appliesToKind: 'celestial_object',
  },
  {
    key: 'mass_earth',
    label: 'Mass',
    valueType: 'number',
    unit: 'M⊕',
    appliesToKind: 'celestial_object',
    appliesToBaseType: 'planet',
  },
  {
    key: 'radius_km',
    label: 'Mean radius',
    valueType: 'number',
    unit: 'km',
    appliesToKind: 'celestial_object',
  },
  {
    key: 'radius_earth',
    label: 'Radius',
    valueType: 'number',
    unit: 'R⊕',
    appliesToKind: 'celestial_object',
    appliesToBaseType: 'planet',
  },
  {
    key: 'orbit_au',
    label: 'Orbit (semi-major axis)',
    valueType: 'number',
    unit: 'AU',
    appliesToKind: 'celestial_object',
  },
  {
    key: 'diameter_ly',
    label: 'Diameter',
    valueType: 'number',
    unit: 'ly',
    appliesToKind: 'celestial_object',
    appliesToBaseType: 'nebula',
  },
  {
    key: 'discovered',
    label: 'Discovered',
    valueType: 'date_text',
    appliesToKind: 'celestial_object',
  },
  {
    key: 'orbit_km',
    label: 'Orbit (semi-major axis)',
    valueType: 'number',
    unit: 'km',
    appliesToKind: 'celestial_object',
    appliesToBaseType: 'moon',
  },
];

export const CATEGORIES = [
  { name: 'Supernova', icon: 'sparkles', color: '#ff9a5c' },
  { name: 'Discovery', icon: 'telescope', color: '#4fd1ff' },
  { name: 'Landing', icon: 'rocket', color: '#c8a24a' },
  { name: 'Observation', icon: 'eye', color: '#b48cff' },
];

/**
 * Neighbourhoods: named sets of systems close enough together to be looked at as one place. The
 * Galaxy is 100,000 ly across and these are tens, so each is a way there by name: choosing one
 * in Search or the List flies the camera to its members (D-61).
 */
export const NEIGHBOURHOOD = 'Neighbourhood';
export const GROUP_TYPES = [
  { name: NEIGHBOURHOOD, layer: 'Neighbourhoods', defaultColor: '#7fd4ff' },
];

export interface Neighbourhood {
  key: string;
  name: string;
  summary: string;
  color: string;
  /** The Solar System and every catalogue system within this many light-years of it. */
  withinLy: number;
}
export const NEIGHBOURHOODS: Neighbourhood[] = [
  {
    key: 'solar-neighbourhood',
    name: 'Solar neighbourhood',
    summary:
      'The Sun and the catalogue’s stars within 40 light-years of it, from Alpha Centauri (4.4 ly) out to Arcturus (37 ly). The real neighbourhood holds a few hundred more stars, most of them faint red dwarfs.',
    color: '#7fd4ff',
    withinLy: 40,
  },
];

/** A neighbourhood's members: the keys the systems were created under, nearest first. */
export function neighbourhoodMembers(n: Neighbourhood): { key: string; name: string }[] {
  return [
    { key: 'solar-system', name: 'Solar System' },
    ...SYSTEMS.filter((sys) => sys.pos.d <= n.withinLy)
      .sort((a, b) => a.pos.d - b.pos.d)
      .map(({ key, name }) => ({ key, name })),
  ];
}

export interface SettingIds {
  universeId: string;
  mapId: string;
  subtypes: Record<string, string>;
  fields: Record<string, string>;
  categories: Record<string, string>;
  groupTypes: Record<string, string>;
}

export type Operation = Record<string, unknown>;

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;
const plain = (source: string) => ({ format: 'plain', source });
const md = (source: string) => ({ format: 'markdown', source });
const rad = (deg: number) => (deg * Math.PI) / 180;

/** A catalogue position in the map's galaxy frame (light-years), with its galactic l and b. */
export function place(pos: Pos) {
  const g = 'ra' in pos ? equatorialToGalactic(pos.ra, pos.dec) : { lDeg: pos.l, bDeg: pos.b };
  const f = frame(galacticToGalactocentric(g.lDeg, g.bDeg, pos.d));
  return { x: round(f.x), y: round(f.y), z: round(f.z), lDeg: g.lDeg, bDeg: g.bDeg };
}

/** An arm's measured stretch as points in the galaxy frame. */
export function armPath(arm: ArmFit, points = 40) {
  return Array.from({ length: points }, (_, i) =>
    frame(armPoint(arm, arm.betaFromDeg + ((arm.betaToDeg - arm.betaFromDeg) * i) / (points - 1))),
  );
}

/**
 * A moon's drawn distance, in planet radii. The system view spaces moons by their planet's drawn
 * size, so real distances (the Moon 60 radii, Iapetus 61) would scatter them across other
 * planets' orbits. Compressed logarithmically: the order holds and all stay within ~4 radii.
 * The real distance is kept as a fact.
 */
export const moonDrawRadii = (realRadii: number) => round(1.3 + 0.6 * Math.log(realRadii), 2);

/**
 * A moon's drawn distance. The rings keep their real radii while moon distances are squeezed,
 * so a moon really outside the rings (Enceladus, 4.09 Saturn radii) would be drawn inside
 * them: such a moon stays just beyond the rings' outer edge instead.
 */
function moonDistance(planet: { planet: Record<string, unknown> }, realRadii: number): number {
  const rings = planet.planet.rings as { enabled?: boolean; outerRadius?: number } | undefined;
  const outer = rings?.enabled ? (rings.outerRadius ?? 0) : 0;
  const drawn = moonDrawRadii(realRadii);
  return realRadii > outer && drawn < outer + 0.2 ? round(outer + 0.2, 2) : drawn;
}

function need(map: Record<string, string>, key: string, what: string): string {
  const id = map[key];
  if (id === undefined) throw new Error(`No ${what} "${key}"`);
  return id;
}

/** Every operation, in order: creates first (later ones refer back as "$op:N"), then aspects. */
export function buildOperations(ids: SettingIds): Operation[] {
  const creates: Operation[] = [];
  const aspects: Operation[] = [];
  const refs = new Map<string, string>();

  const create = (kind: string, key: string, data: Record<string, unknown>) => {
    const ref = `$op:${String(creates.length)}`;
    refs.set(key, ref);
    const scope = kind === 'character' ? { universeId: ids.universeId } : { mapId: ids.mapId };
    creates.push({ op: 'create', kind, ...scope, data: { ...data, externalKey: `mw-${key}` } });
    return ref;
  };
  const ref = (key: string) => {
    const found = refs.get(key);
    if (found === undefined) throw new Error(`Nothing created as "${key}"`);
    return found;
  };
  const facts = (id: string, values: Record<string, string | number | undefined>) => {
    const data = [];
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined || value === '') continue;
      const def = FIELDS.find((f) => f.key === key);
      if (!def) throw new Error(`No field "${key}"`);
      data.push({
        fieldDefinitionId: need(ids.fields, key, 'field'),
        value:
          def.valueType === 'number'
            ? { type: 'number', number: Number(value) }
            : def.valueType === 'date_text'
              ? { type: 'date_text', text: String(value) }
              : { type: 'text', text: plain(String(value)) },
      });
    }
    if (data.length > 0) aspects.push({ op: 'setFacts', id, data });
  };
  const link = (id: string, wiki?: string) => {
    if (wiki) {
      aspects.push({
        op: 'addLink',
        id,
        data: { url: `https://en.wikipedia.org/wiki/${encodeURI(wiki)}`, label: 'Wikipedia' },
      });
    }
  };
  const galCoords = (l: number, b: number) =>
    `l ${String(round(l, 2))}°, b ${String(round(b, 2))}°`;

  // ---- the centre ------------------------------------------------------------------------
  const sgr = create('celestial_object', 'sagittarius-a-star', {
    name: plain('Sagittarius A*'),
    summary: md(
      'The supermassive black hole at the centre of the Milky Way: **4.3 million** solar masses, imaged by the Event Horizon Telescope in 2022.',
    ),
    baseType: 'black_hole',
    x: 0,
    y: 0,
    z: 0,
    appearance: { scale: { galaxy: 2 }, labelPriority: 10 },
  });
  facts(sgr, {
    distance_ly: R0_LY,
    constellation: 'Sagittarius',
    mass_sun: 4_300_000,
    galactic_coords: galCoords(359.944, -0.046),
    discovered: '1974',
  });
  link(sgr, 'Sagittarius_A*');
  for (const [key, name, sign] of [
    ['fermi-bubble-north', 'Fermi Bubble (north)', -1],
    ['fermi-bubble-south', 'Fermi Bubble (south)', 1],
  ] as const) {
    const id = create('celestial_object', key, {
      name: plain(name),
      summary: plain(
        'One of two lobes of hot gas, bright in gamma rays, reaching about 25,000 ly from the plane; probably blown by Sgr A* or a burst of star formation a few million years ago.',
      ),
      baseType: 'anomaly',
      subtypeId: need(ids.subtypes, 'Galactic structure', 'subtype'),
      x: 0,
      // Galactic north is −Y in this map (geo.ts, makeFrame).
      y: sign * FERMI_LOBE_LY,
      z: 0,
      appearance: {
        labelPriority: 3,
        region: {
          radius: FERMI_LOBE_LY,
          shape: 'sphere',
          density: 0.06,
          color: '#9f7fff',
          rimColor: '#d0c0ff',
          filaments: 0.2,
        },
      },
    });
    link(id, 'Fermi_bubbles');
  }

  // ---- spiral arms: rift bands along the measured stretches ------------------------------
  const armWiki: Record<string, string> = {
    'local-arm': 'Orion_Arm',
    'sagittarius-carina-arm': 'Carina–Sagittarius_Arm',
  };
  for (const arm of ARMS) {
    const points = armPath(arm);
    const anchor = points[Math.floor(points.length / 2)] ?? { x: 0, z: 0 };
    const path = points
      .filter((_, i) => i % 2 === 0 || i === points.length - 1)
      .map((p) => [round(p.x - anchor.x, 0), round(p.z - anchor.z, 0)]);
    const id = create('celestial_object', arm.key, {
      name: plain(arm.name),
      summary: plain(ARM_INFO[arm.key] ?? ''),
      description: md(
        `Traced from maser parallaxes of young stars (Reid et al. 2019): a log spiral with a kink at ${String(arm.rKinkKpc)} kpc from the centre, pitch ${String(arm.pitchBeforeDeg)}° then ${String(arm.pitchAfterDeg)}°. Only the measured stretch is drawn.`,
      ),
      baseType: 'nebula',
      subtypeId: need(ids.subtypes, 'Spiral arm', 'subtype'),
      x: round(anchor.x, 0),
      y: 0,
      z: round(anchor.z, 0),
      appearance: {
        labelPriority: 7,
        region: {
          shape: 'rift',
          radius: round(Math.max(arm.widthKpc * 3262, 600), 0),
          density: 0.18,
          color: '#9fbfff',
          path,
        },
      },
    });
    link(id, armWiki[arm.key] ?? arm.name.replace(/ /g, '_'));
  }

  // ---- the Solar System ------------------------------------------------------------------
  const sunPos = place({ l: 0, b: 0, d: 0 });
  const sol = create('celestial_object', 'solar-system', {
    name: plain('Solar System'),
    summary: md(
      'Home: the Sun, eight planets, five recognised dwarf planets and countless smaller bodies, about **26,700 ly** from the centre of the Galaxy, in the Local Arm.',
    ),
    description: md(
      'Planets sit at their real average distances from the Sun (in AU), each at its mean longitude on 1 January 2000. Sizes are not to scale. Moon distances are compressed so each moon stays beside its planet; their real orbits are in the facts.',
    ),
    baseType: 'system',
    explorable: true,
    x: sunPos.x,
    y: sunPos.y,
    z: sunPos.z,
    appearance: { color: blackbodyColor(5772), labelPriority: 10 },
  });
  facts(sol, { distance_ly: 0, spiral_arm: 'Local Arm', galactic_coords: 'origin' });
  link(sol, 'Solar_System');
  const sun = create('celestial_object', 'sun', {
    name: plain('Sun'),
    summary: plain('A G-type main-sequence star, 4.6 billion years old.'),
    baseType: 'star',
    parentId: sol,
    x: 0,
    y: 0,
    z: 0,
    appearance: { star: { temperatureK: 5772 }, scale: { system: 0.35 } },
  });
  facts(sun, { spectral_type: 'G2V', mass_sun: 1, radius_km: 695_700 });
  link(sun, 'Sun');
  // Seen from ecliptic north (+Y), bodies go counter-clockwise: angles run from +X toward −Z.
  const inPlane = (r: number, deg: number, places: number) => ({
    x: round(r * Math.cos(rad(deg)), places),
    y: 0,
    z: round(-r * Math.sin(rad(deg)), places),
  });
  for (const p of SOLAR) {
    const id = create('celestial_object', p.key, {
      name: plain(p.name),
      summary: plain(p.summary),
      baseType: 'planet',
      parentId: sol,
      explorable: true,
      ...inPlane(p.orbitAu, p.longitudeDeg, 3),
      appearance: {
        scale: { system: p.scale },
        planet: p.planet,
        ...(p.color ? { color: p.color } : {}),
      },
    });
    facts(id, {
      orbit_au: p.orbitAu,
      radius_km: p.radiusKm,
      mass_earth: p.massEarth,
      discovered: p.discovered,
    });
    link(id, p.wiki);
    p.moons.forEach((m, i) => {
      const moon = create('celestial_object', m.key, {
        name: plain(m.name),
        summary: plain(m.summary),
        baseType: 'moon',
        parentId: id,
        explorable: true,
        // Spread around the planet by the golden angle, so neighbours don't line up.
        ...inPlane(moonDistance(p, m.distanceRadii), i * 137.5 + 20, 2),
        appearance: { scale: { orbit: m.scale }, planet: m.planet },
      });
      facts(moon, {
        radius_km: m.radiusKm,
        orbit_km: Math.round(m.distanceRadii * p.radiusKm),
        discovered: m.discovered,
      });
      link(moon, m.wiki);
    });
    for (const st of SOLAR_STATIONS.filter((s) => s.parent === p.key)) {
      link(
        create('celestial_object', st.key, {
          name: plain(st.name),
          summary: plain(st.summary),
          baseType: 'station',
          parentId: id,
          x: st.distanceRadii,
          y: 0,
          z: 0,
        }),
        st.wiki,
      );
    }
  }
  for (const b of SOLAR_BELTS) {
    const id = create('celestial_object', b.key, {
      name: plain(b.name),
      summary: plain(b.summary),
      baseType: 'asteroid_belt',
      parentId: sol,
      ...inPlane(b.au, b.angleDeg, 2),
      appearance: { scale: { system: b.scale } },
    });
    link(id, b.wiki);
  }
  const earthLongitude = SOLAR.find((p) => p.key === 'earth')?.longitudeDeg ?? 0;
  for (const st of SOLAR_STATIONS.filter((s) => s.parent === 'solar-system')) {
    const id = create('celestial_object', st.key, {
      name: plain(st.name),
      summary: plain(st.summary),
      baseType: 'station',
      parentId: sol,
      ...inPlane(st.distanceRadii, earthLongitude, 3),
      ...(st.scale ? { appearance: { scale: { system: st.scale } } } : {}),
    });
    link(id, st.wiki);
  }

  // ---- other star systems ----------------------------------------------------------------
  for (const sys of SYSTEMS) {
    const p = place(sys.pos);
    const primary = sys.stars[0];
    if (!primary) throw new Error(`${sys.key} has no star`);
    const notes = [
      sys.description,
      sys.schematic
        ? '_Distances inside this system are drawn to a schematic scale; real values are in the facts._'
        : undefined,
    ].filter(Boolean);
    const id = create('celestial_object', sys.key, {
      name: plain(sys.name),
      summary: plain(sys.summary),
      description: notes.length > 0 ? md(notes.join('\n\n')) : null,
      baseType: 'system',
      explorable: true,
      x: p.x,
      y: p.y,
      z: p.z,
      appearance: {
        color: blackbodyColor(Math.min(primary.tempK, 40_000)),
        labelPriority: sys.priority ?? 4,
      },
    });
    facts(id, {
      distance_ly: sys.pos.d,
      constellation: sys.constellation,
      galactic_coords: galCoords(p.lDeg, p.bDeg),
      spiral_arm: sys.arm,
      discovered: sys.discovered,
    });
    link(id, sys.wiki);
    const stars = new Map<string, { id: string; at: [number, number] }>();
    for (const st of sys.stars) {
      const at = st.at ?? [0, 0];
      const sid = create('celestial_object', st.key, {
        name: plain(st.name),
        summary: st.summary ? plain(st.summary) : null,
        baseType: 'star',
        parentId: id,
        x: at[0],
        y: 0,
        z: at[1],
        appearance: {
          star: { temperatureK: Math.min(st.tempK, 50_000) },
          ...(st.scale ? { scale: { system: st.scale } } : {}),
        },
      });
      stars.set(st.key, { id: sid, at });
      facts(sid, { spectral_type: st.spectral, mass_sun: st.massSun });
      if (st.wiki && st.wiki !== sys.wiki) link(sid, st.wiki);
    }
    (sys.planets ?? []).forEach((pl, i) => {
      const center = stars.get(pl.around ?? primary.key);
      const offset = inPlane(pl.drawAt ?? pl.orbitAu, i * 137.5 + 40, 3);
      const pid = create('celestial_object', pl.key, {
        name: plain(pl.name),
        summary: pl.summary ? plain(pl.summary) : null,
        baseType: 'planet',
        parentId: id,
        explorable: true,
        ...(pl.around && center ? { orbitCenterId: center.id } : {}),
        x: round((center?.at[0] ?? 0) + offset.x, 3),
        y: 0,
        z: round((center?.at[1] ?? 0) + offset.z, 3),
        appearance: {
          scale: { system: pl.scale ?? 0.6 },
          planet: { preset: pl.preset, ...(pl.palette ? { palette: pl.palette } : {}) },
        },
      });
      facts(pid, { orbit_au: pl.orbitAu, radius_earth: pl.radiusEarth, mass_earth: pl.massEarth });
      link(pid, pl.wiki);
    });
    for (const b of sys.belts ?? []) {
      create('celestial_object', b.key, {
        name: plain(b.name),
        summary: b.summary ? plain(b.summary) : null,
        baseType: 'asteroid_belt',
        parentId: id,
        x: b.at,
        y: 0,
        z: 0,
        appearance: { scale: { system: b.scale } },
      });
    }
    for (const bh of sys.blackHoles ?? []) {
      const bid = create('celestial_object', bh.key, {
        name: plain(bh.name),
        summary: bh.summary ? plain(bh.summary) : null,
        baseType: 'black_hole',
        parentId: id,
        x: bh.at[0],
        y: 0,
        z: bh.at[1],
      });
      facts(bid, { mass_sun: bh.massSun });
    }
  }

  // ---- regions: nebulae, clusters, remnants, dwarf galaxies -------------------------------
  for (const r of REGIONS) {
    const p = place(r.pos);
    const id = create('celestial_object', r.key, {
      name: plain(r.name),
      summary: plain(r.summary),
      baseType: r.baseType ?? 'nebula',
      subtypeId: need(ids.subtypes, r.subtype, 'subtype'),
      x: p.x,
      y: p.y,
      z: p.z,
      appearance: {
        labelPriority: r.priority ?? 4,
        color: r.color,
        region: {
          radius: r.radiusLy,
          shape: r.shape ?? 'sphere',
          color: r.color,
          ...(r.rim ? { rimColor: r.rim } : {}),
          ...(r.density === undefined ? {} : { density: r.density }),
        },
      },
    });
    facts(id, {
      distance_ly: r.pos.d,
      constellation: r.constellation,
      galactic_coords: r.pos.d > 0 ? galCoords(p.lDeg, p.bDeg) : undefined,
      spiral_arm: r.arm,
      diameter_ly: round(r.radiusLy * 2, 1),
    });
    link(id, r.wiki);
  }

  // ---- neighbourhoods: groups of nearby systems ---------------------------------------------
  for (const n of NEIGHBOURHOODS) {
    const id = create('group', n.key, {
      name: plain(n.name),
      summary: plain(n.summary),
      groupTypeId: need(ids.groupTypes, NEIGHBOURHOOD, 'group type'),
      outlineColor: n.color,
    });
    aspects.push({
      op: 'addMembers',
      id,
      data: neighbourhoodMembers(n).map((member) => ({ objectId: ref(member.key) })),
    });
  }

  // ---- people and events -----------------------------------------------------------------
  for (const c of CHARACTERS) {
    link(create('character', c.key, { name: plain(c.name), summary: plain(c.summary) }), c.wiki);
  }
  for (const e of EVENTS) {
    const id = create('event', e.key, {
      name: plain(e.name),
      summary: plain(e.summary),
      categoryId: need(ids.categories, e.category, 'event category'),
      dateText: e.dateText,
      dateSort: e.dateSort,
    });
    const at = ref(e.at);
    aspects.push({
      op: 'setLocation',
      id,
      data: e.surface
        ? { mode: 'surface', objectId: at, latDeg: e.surface[0], lonDeg: e.surface[1] }
        : { mode: 'object', objectId: at },
    });
    for (const who of e.people ?? []) {
      aspects.push({
        op: 'addRelation',
        id: ref(who),
        data: { relationType: 'participant', toEntityId: id },
      });
    }
    link(id, e.wiki);
  }

  return [...creates, ...aspects];
}
