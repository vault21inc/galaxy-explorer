/**
 * The Star Trek galaxy: a fan reference map of the Milky Way as the shows draw it. The galaxy
 * is cut into four quadrants by two lines through its core; Earth sits on the line between the
 * Alpha and Beta quadrants. Canon gives few positions, so the Alpha and Beta powers are laid out
 * schematically around Sol, a few thousand light-years across, keeping who borders whom; the far
 * quadrants keep the distances the shows state (the Gamma Quadrant end of the Bajoran wormhole
 * and Ocampa are both about 70,000 ly away). Summaries are this map's own words. `||…||` marks a
 * spoiler (ux.md §6), hidden until the reader asks.
 */

export type Quadrant = 'Alpha' | 'Beta' | 'Gamma' | 'Delta';

/** The great powers, drawn as outlines around their worlds on the map. */
export type Power = 'federation' | 'klingon' | 'romulan' | 'cardassian' | 'dominion' | 'borg';

export interface Body {
  slug: string;
  name: string;
  preset: string;
  palette?: string[];
  /** In AU, schematic. */
  orbit: number;
  scale?: number;
  summary: string;
  wiki?: string;
  extra?: Record<string, unknown>;
  moons?: Omit<Body, 'orbit' | 'moons' | 'stations'>[];
  stations?: { slug: string; name: string; summary: string; wiki?: string }[];
}

export interface World {
  slug: string;
  name: string;
  /** [x, z] in light-years from the galactic core, the map's frame (see `SOL`). */
  at: [number, number];
  quadrant: Quadrant;
  /** Who holds it, as a fact; `power` also puts it inside that power's outline. */
  affiliation?: string;
  power?: Power;
  /** The real star a world is said to orbit, with its real distance, as a fact. */
  realStar?: string;
  summary: string;
  wiki: string;
  priority?: number;
  stars: { slug: string; name: string; tempK: number; at?: [number, number] }[];
  bodies: Body[];
  /** Stations out in the system, not beside a planet: `at` is [x, z] in schematic AU. */
  stations?: { slug: string; name: string; summary: string; wiki?: string; at: [number, number] }[];
}

/**
 * Sol in the map's frame: 26,000 ly from the core, straight "below" it in the top view (+Z),
 * so the Alpha Quadrant (−X) is on its left and the Beta Quadrant (+X) on its right, as the
 * shows' own galaxy charts draw them. Gamma is beyond Alpha, Delta beyond Beta.
 */
export const SOL: [number, number] = [0, 26_000];

/** A place `east` ly toward the Beta side and `out` ly away from the core, from Sol. */
const nearSol = (east: number, out: number): [number, number] => [SOL[0] + east, SOL[1] + out];

const FEDERATION = 'United Federation of Planets';
const yellow = 5_600;

export const WORLDS: World[] = [
  // ---- The Federation -------------------------------------------------------------------
  {
    slug: 'sol',
    name: 'Sol',
    at: nearSol(0, 0),
    quadrant: 'Alpha',
    affiliation: FEDERATION,
    power: 'federation',
    realStar: 'The Sun',
    summary:
      'Humanity’s home system, Sector 001: Starfleet Command, the Federation’s capital and its shipyards.',
    wiki: 'Sol_system',
    priority: 10,
    stars: [{ slug: 'sol-star', name: 'Sol', tempK: 5_772 }],
    bodies: [
      {
        slug: 'earth',
        name: 'Earth',
        preset: 'ocean',
        orbit: 1,
        scale: 0.65,
        summary:
          'Capital of the Federation: its president sits in Paris, and Starfleet Command and the Academy in San Francisco.',
        wiki: 'Earth',
        extra: {
          clouds: { enabled: true, coverage: 0.45 },
          nightLights: { enabled: true, color: '#ffd9a0', intensity: 1 },
        },
        moons: [
          {
            slug: 'luna',
            name: 'Luna',
            preset: 'barren',
            scale: 0.9,
            summary: 'Earth’s moon, settled in domed cities such as Tranquility.',
            wiki: 'Luna',
          },
        ],
        stations: [
          {
            slug: 'spacedock',
            name: 'Spacedock',
            summary: 'Starfleet’s great orbital dock above Earth, big enough to swallow starships.',
            wiki: 'Spacedock_One',
          },
        ],
      },
      {
        slug: 'mars',
        name: 'Mars',
        preset: 'desert',
        palette: ['#6a2e1e', '#a24a2a', '#c8703e', '#e0a070'],
        orbit: 1.6,
        scale: 0.5,
        summary: 'A terraformed colony world, and home of Starfleet’s busiest shipyards.',
        wiki: 'Mars',
        stations: [
          {
            slug: 'utopia-planitia',
            name: 'Utopia Planitia Fleet Yards',
            summary:
              'The shipyards in orbit of Mars, where the Enterprise-D and Voyager were built.',
            wiki: 'Utopia_Planitia_Fleet_Yards',
          },
        ],
      },
      {
        slug: 'jupiter',
        name: 'Jupiter',
        preset: 'gas_giant',
        palette: ['#d8c4a0', '#b08a60', '#e8dcc4', '#a0704a'],
        orbit: 3.2,
        scale: 1.6,
        summary: 'The largest planet; Jupiter Station, a research outpost, orbits it.',
        wiki: 'Jupiter',
        stations: [
          {
            slug: 'jupiter-station',
            name: 'Jupiter Station',
            summary:
              'A Starfleet research station, where Dr. Lewis Zimmerman wrote the Emergency Medical Hologram.',
            wiki: 'Jupiter_Station',
          },
        ],
      },
    ],
  },
  {
    slug: 'vulcan-system',
    name: 'Vulcan',
    at: nearSol(650, -500),
    quadrant: 'Beta',
    affiliation: FEDERATION,
    power: 'federation',
    realStar: '40 Eridani A, about 16 ly from Sol',
    summary:
      'Home of the Vulcans, who made first contact with Earth in 2063 and taught it the stars.',
    wiki: 'Vulcan',
    priority: 9,
    stars: [{ slug: 'vulcans-star', name: 'Nevasa', tempK: 5_100 }],
    bodies: [
      {
        slug: 'vulcan',
        name: 'Vulcan',
        preset: 'desert',
        palette: ['#7a2e1a', '#b0502a', '#d07a40', '#e8b070'],
        orbit: 1.1,
        scale: 0.6,
        summary:
          'A hot, dry world of red deserts and stone cities, where logic replaced the old violence. It has no moon.',
        wiki: 'Vulcan',
      },
    ],
  },
  {
    slug: 'andoria-system',
    name: 'Andoria',
    at: nearSol(900, 350),
    quadrant: 'Beta',
    affiliation: FEDERATION,
    power: 'federation',
    summary:
      'Home of the blue-skinned, antennaed Andorians, a founding world of the Federation, about 11 ly from Sol.',
    wiki: 'Andoria',
    priority: 7,
    stars: [{ slug: 'andorian-star', name: 'Andorian star', tempK: 5_200 }],
    bodies: [
      {
        slug: 'andor',
        name: 'Andor',
        preset: 'gas_giant',
        palette: ['#9ab8d8', '#d8e4f0', '#6a8ab0', '#c0d0e4'],
        orbit: 1.6,
        scale: 1.5,
        summary: 'The ringed gas giant that Andoria circles.',
        moons: [
          {
            slug: 'andoria',
            name: 'Andoria',
            preset: 'ice',
            scale: 1,
            summary:
              'An ice moon whose people live in cities beneath the frozen surface; home of the Andorians and the Aenar.',
            wiki: 'Andoria',
          },
        ],
      },
    ],
  },
  {
    slug: 'tellar-system',
    name: 'Tellar',
    at: nearSol(-700, -400),
    quadrant: 'Alpha',
    affiliation: FEDERATION,
    power: 'federation',
    realStar: '61 Cygni, about 11 ly from Sol',
    summary: 'Home of the argumentative Tellarites, another founder of the Federation.',
    wiki: 'Tellar_Prime',
    stars: [{ slug: '61-cygni', name: '61 Cygni', tempK: 4_500 }],
    bodies: [
      {
        slug: 'tellar-prime',
        name: 'Tellar Prime',
        preset: 'jungle',
        palette: ['#4a4a2a', '#6a6a3a', '#8a7a4a', '#b0a070'],
        orbit: 0.9,
        scale: 0.6,
        summary: 'The Tellarites’ homeworld, where a good argument is a sign of respect.',
        wiki: 'Tellar_Prime',
      },
    ],
  },
  {
    slug: 'wolf-359',
    name: 'Wolf 359',
    at: nearSol(250, -200),
    quadrant: 'Beta',
    affiliation: FEDERATION,
    power: 'federation',
    realStar: 'Wolf 359, about 8 ly from Sol',
    summary:
      'A dim red dwarf near Earth, where a Borg cube destroyed a Starfleet armada of 39 ships in 2367.',
    wiki: 'Wolf_359',
    priority: 7,
    stars: [{ slug: 'wolf-359-star', name: 'Wolf 359', tempK: 2_800 }],
    bodies: [],
  },
  {
    slug: 'betazed-system',
    name: 'Betazed',
    at: nearSol(-1900, -600),
    quadrant: 'Alpha',
    affiliation: FEDERATION,
    power: 'federation',
    summary: 'Home of the telepathic Betazoids, and of Deanna Troi.',
    wiki: 'Betazed',
    priority: 6,
    stars: [{ slug: 'betazed-star', name: 'Betazed', tempK: 6_000 }],
    bodies: [
      {
        slug: 'betazed',
        name: 'Betazed',
        preset: 'ocean',
        orbit: 1.2,
        scale: 0.6,
        summary: 'Lakes, gardens and a people who hear each other’s thoughts.',
        wiki: 'Betazed',
        extra: { clouds: { enabled: true, coverage: 0.35 } },
      },
    ],
  },
  {
    slug: 'risa-system',
    name: 'Risa',
    at: nearSol(-1200, 1100),
    quadrant: 'Alpha',
    affiliation: FEDERATION,
    power: 'federation',
    summary: 'The Federation’s pleasure planet, its weather made perfect by machines.',
    wiki: 'Risa',
    priority: 6,
    stars: [{ slug: 'epsilon-ceti-b', name: 'Epsilon Ceti B', tempK: 5_400 }],
    bodies: [
      {
        slug: 'risa',
        name: 'Risa',
        preset: 'ocean',
        palette: ['#d8c890', '#5aa05a', '#3a7a3a', '#8ab06a'],
        orbit: 1.0,
        scale: 0.6,
        summary: 'Warm seas and beaches, under a weather-control grid.',
        wiki: 'Risa',
        extra: { clouds: { enabled: true, coverage: 0.2 } },
      },
    ],
  },
  {
    slug: 'rigel-system',
    name: 'Rigel',
    at: nearSol(-1500, -1800),
    quadrant: 'Alpha',
    affiliation: FEDERATION,
    power: 'federation',
    realStar: 'Rigel (β Orionis), a blue supergiant',
    summary: 'A blue supergiant with many inhabited worlds, a busy hub of trade.',
    wiki: 'Rigel',
    priority: 5,
    stars: [{ slug: 'rigel', name: 'Rigel', tempK: 12_100 }],
    bodies: [
      {
        slug: 'rigel-v',
        name: 'Rigel V',
        preset: 'desert',
        orbit: 2.4,
        scale: 0.55,
        summary: 'One of Rigel’s inhabited worlds, home of the Rigelians.',
        wiki: 'Rigel_V',
      },
    ],
  },
  {
    slug: 'deneb',
    name: 'Deneb',
    at: nearSol(-2600, -1500),
    quadrant: 'Alpha',
    affiliation: FEDERATION,
    power: 'federation',
    realStar: 'Deneb (α Cygni), about 2,600 ly from Sol',
    summary:
      'A white supergiant on the Federation’s old frontier, where the Enterprise-D began its first mission.',
    wiki: 'Deneb',
    priority: 5,
    stars: [{ slug: 'deneb-star', name: 'Deneb', tempK: 8_500 }],
    bodies: [
      {
        slug: 'deneb-iv',
        name: 'Deneb IV',
        preset: 'barren',
        palette: ['#5a4a3a', '#8a7a64', '#b0a088'],
        orbit: 2.2,
        scale: 0.6,
        summary: 'Home of the Bandi, who built Farpoint Station.',
        wiki: 'Deneb_IV',
        stations: [
          {
            slug: 'farpoint-station',
            name: 'Farpoint Station',
            summary:
              'A starbase the Bandi offered the Federation. Its secret was a living creature, held captive.',
            wiki: 'Farpoint_Station',
          },
        ],
      },
    ],
  },
  {
    slug: 'talos-system',
    name: 'Talos',
    at: nearSol(-2400, 2200),
    quadrant: 'Alpha',
    affiliation: 'Under quarantine',
    power: 'federation',
    summary:
      'Home of the Talosians, whose illusions are so strong that Starfleet forbids any visit on pain of death.',
    wiki: 'Talos_IV',
    stars: [{ slug: 'talos-star', name: 'Talos', tempK: 4_200 }],
    bodies: [
      {
        slug: 'talos-iv',
        name: 'Talos IV',
        preset: 'barren',
        palette: ['#4a3a3a', '#7a5a50', '#a88070'],
        orbit: 1.1,
        scale: 0.6,
        summary: 'A scarred surface over underground caverns, where the Talosians live.',
        wiki: 'Talos_IV',
      },
    ],
  },
  {
    slug: 'ceti-alpha',
    name: 'Ceti Alpha',
    at: nearSol(-600, 2300),
    quadrant: 'Alpha',
    affiliation: FEDERATION,
    power: 'federation',
    summary: 'The system where Captain Kirk marooned Khan Noonien Singh and his people in 2267.',
    wiki: 'Ceti_Alpha_V',
    stars: [{ slug: 'ceti-alpha-star', name: 'Ceti Alpha', tempK: 5_000 }],
    bodies: [
      {
        slug: 'ceti-alpha-v',
        name: 'Ceti Alpha V',
        preset: 'desert',
        palette: ['#8a6a40', '#b08a50', '#d0b07a'],
        orbit: 1.5,
        scale: 0.6,
        summary:
          'A wild but livable world when Khan was left there. ||Then Ceti Alpha VI exploded, and it became a desert.||',
        wiki: 'Ceti_Alpha_V',
      },
    ],
  },
  {
    slug: 'regula',
    name: 'Regula',
    at: nearSol(400, 2400),
    quadrant: 'Beta',
    affiliation: FEDERATION,
    power: 'federation',
    summary: 'A system near the Mutara Nebula, where the Genesis Device was developed.',
    wiki: 'Regula_I',
    stars: [{ slug: 'regula-star', name: 'Regula', tempK: 4_800 }],
    bodies: [
      {
        slug: 'regula-planet',
        name: 'Regula',
        preset: 'barren',
        orbit: 1.4,
        scale: 0.5,
        summary: 'A lifeless planetoid; its caves hid the Genesis cave.',
        stations: [
          {
            slug: 'regula-i',
            name: 'Regula I',
            summary: 'A Federation science station, home of the Genesis project.',
            wiki: 'Regula_I',
          },
        ],
      },
    ],
  },

  // ---- The Klingon Empire ---------------------------------------------------------------
  {
    slug: 'qonos-system',
    name: 'Qo’noS',
    at: nearSol(5200, -1800),
    quadrant: 'Beta',
    affiliation: 'Klingon Empire',
    power: 'klingon',
    summary: 'Throne world of the Klingon Empire, home of its High Council in the First City.',
    wiki: "Qo'noS",
    priority: 9,
    stars: [{ slug: 'qonos-star', name: 'Klingon sun', tempK: 4_900 }],
    bodies: [
      {
        slug: 'qonos',
        name: 'Qo’noS',
        preset: 'jungle',
        palette: ['#2a2a1e', '#4a3a24', '#6a4a2a', '#8a6a4a'],
        orbit: 1.2,
        scale: 0.65,
        summary: 'A harsh, stormy world that bred a warrior people; also written Kronos.',
        wiki: "Qo'noS",
        extra: {
          clouds: { enabled: true, coverage: 0.55, color: '#8a7a6a' },
          nightLights: { enabled: true, color: '#ff8a50', intensity: 0.8 },
        },
        moons: [
          {
            slug: 'praxis',
            name: 'Praxis',
            preset: 'barren',
            scale: 0.8,
            summary: 'The Klingons’ chief energy-producing moon. ||It exploded in 2293.||',
            wiki: 'Praxis',
          },
        ],
      },
    ],
  },
  {
    slug: 'khitomer-system',
    name: 'Khitomer',
    at: nearSol(3900, -3100),
    quadrant: 'Beta',
    affiliation: 'Klingon Empire',
    power: 'klingon',
    summary:
      'A Klingon world near the Romulan border, where the Khitomer Accords made peace with the Federation.',
    wiki: 'Khitomer',
    priority: 6,
    stars: [{ slug: 'khitomer-star', name: 'Khitomer', tempK: yellow }],
    bodies: [
      {
        slug: 'khitomer',
        name: 'Khitomer',
        preset: 'jungle',
        palette: ['#3a4a2a', '#5a6a3a', '#8a8a5a'],
        orbit: 1.1,
        scale: 0.6,
        summary: 'A peace conference in 2293; a Romulan massacre in 2346, which orphaned Worf.',
        wiki: 'Khitomer',
      },
    ],
  },
  {
    slug: 'narendra-system',
    name: 'Narendra',
    at: nearSol(4300, -2500),
    quadrant: 'Beta',
    affiliation: 'Klingon Empire',
    power: 'klingon',
    summary:
      'A Klingon outpost world that the Enterprise-C died defending from a Romulan attack in 2344.',
    wiki: 'Narendra_III',
    stars: [{ slug: 'narendra-star', name: 'Narendra', tempK: yellow }],
    bodies: [
      {
        slug: 'narendra-iii',
        name: 'Narendra III',
        preset: 'barren',
        orbit: 1.3,
        scale: 0.55,
        summary: 'A Klingon outpost.',
        wiki: 'Narendra_III',
      },
    ],
  },
  {
    slug: 'rura-penthe-system',
    name: 'Rura Penthe',
    at: nearSol(6300, -3000),
    quadrant: 'Beta',
    affiliation: 'Klingon Empire',
    power: 'klingon',
    summary: 'A frozen penal asteroid, known as the aliens’ graveyard.',
    wiki: 'Rura_Penthe',
    stars: [{ slug: 'beta-penthe', name: 'Beta Penthe', tempK: 4_200 }],
    bodies: [
      {
        slug: 'rura-penthe',
        name: 'Rura Penthe',
        preset: 'ice',
        orbit: 1.8,
        scale: 0.45,
        summary: 'Dilithium mines under the ice, worked by prisoners; Kirk and McCoy escaped it.',
        wiki: 'Rura_Penthe',
      },
    ],
  },
  {
    slug: 'boreth-system',
    name: 'Boreth',
    at: nearSol(6400, -700),
    quadrant: 'Beta',
    affiliation: 'Klingon Empire',
    power: 'klingon',
    summary:
      'A Klingon monastery world, where the faithful wait for Kahless the Unforgettable to return.',
    wiki: 'Boreth',
    stars: [{ slug: 'boreth-star', name: 'Boreth', tempK: 5_000 }],
    bodies: [
      {
        slug: 'boreth',
        name: 'Boreth',
        preset: 'ice',
        palette: ['#a8b8c8', '#c8d4e0', '#e8f0f8'],
        orbit: 1.4,
        scale: 0.55,
        summary: 'Snow, mountains and the monks who keep time crystals.',
        wiki: 'Boreth',
      },
    ],
  },
  {
    slug: 'hatoria-system',
    name: 'H’atoria',
    at: nearSol(4700, -300),
    quadrant: 'Beta',
    affiliation: 'Klingon Empire',
    power: 'klingon',
    summary: 'A small Klingon colony world near the Federation border.',
    wiki: "H'atoria",
    stars: [{ slug: 'hatoria-star', name: 'H’atoria', tempK: yellow }],
    bodies: [
      {
        slug: 'hatoria',
        name: 'H’atoria',
        preset: 'jungle',
        orbit: 1.2,
        scale: 0.55,
        summary: 'A small Klingon colony.',
        wiki: "H'atoria",
      },
    ],
  },
  {
    slug: 'organia-system',
    name: 'Organia',
    at: nearSol(3300, -800),
    quadrant: 'Beta',
    affiliation: 'Neutral',
    summary:
      'A quiet world on the Federation–Klingon border whose seemingly simple people stopped a war in 2267.',
    wiki: 'Organia',
    stars: [{ slug: 'organia-star', name: 'Organia', tempK: yellow }],
    bodies: [
      {
        slug: 'organia',
        name: 'Organia',
        preset: 'jungle',
        palette: ['#4a6a3a', '#7a9a5a', '#b0c08a'],
        orbit: 1.1,
        scale: 0.6,
        summary:
          'Fields and a medieval village. ||The Organians are beings of pure energy, who simply forbade the fighting.||',
        wiki: 'Organia',
      },
    ],
  },

  // ---- The Romulan Star Empire ----------------------------------------------------------
  {
    slug: 'romulus-system',
    name: 'Romulus',
    at: nearSol(2400, -4200),
    quadrant: 'Beta',
    affiliation: 'Romulan Star Empire',
    power: 'romulan',
    summary:
      'Capital of the Romulan Star Empire, founded by Vulcans who rejected logic. Twin worlds, Romulus and Remus. ||Destroyed by the Hobus supernova in 2387.||',
    wiki: 'Romulus',
    priority: 9,
    stars: [{ slug: 'romii', name: 'Romulan sun', tempK: 6_000 }],
    bodies: [
      {
        slug: 'romulus',
        name: 'Romulus',
        preset: 'ocean',
        palette: ['#3a5a3a', '#5a7a4a', '#8a9a6a', '#b0b08a'],
        orbit: 1.1,
        scale: 0.65,
        summary: 'Green seas and the capital, Ki Baratan, seat of the Senate.',
        wiki: 'Romulus',
        extra: {
          clouds: { enabled: true, coverage: 0.4 },
          nightLights: { enabled: true, color: '#9affc0', intensity: 0.9 },
        },
      },
      {
        slug: 'remus',
        name: 'Remus',
        preset: 'barren',
        palette: ['#1e1e24', '#3a3a44', '#5a5a64'],
        orbit: 1.5,
        scale: 0.55,
        summary:
          'Romulus’s twin, one face always to the sun. The Remans mine dilithium on its dark side.',
        wiki: 'Remus',
      },
    ],
  },
  {
    slug: 'chaltok-system',
    name: 'Chaltok',
    at: nearSol(1500, -4700),
    quadrant: 'Beta',
    affiliation: 'Romulan Star Empire',
    power: 'romulan',
    summary: 'A Romulan research colony, nearly destroyed by a polaric weapons test in the 2260s.',
    wiki: 'Chaltok_IV',
    stars: [{ slug: 'chaltok-star', name: 'Chaltok', tempK: yellow }],
    bodies: [
      {
        slug: 'chaltok-iv',
        name: 'Chaltok IV',
        preset: 'jungle',
        orbit: 1.4,
        scale: 0.55,
        summary: 'Its near-destruction led to the Polaric Test Ban Treaty of 2268.',
        wiki: 'Chaltok_IV',
      },
    ],
  },
  {
    slug: 'rator-system',
    name: 'Rator',
    at: nearSol(3300, -4900),
    quadrant: 'Beta',
    affiliation: 'Romulan Star Empire',
    power: 'romulan',
    summary: 'An inhabited world on the Romulan side of the border.',
    wiki: 'Rator_III',
    stars: [{ slug: 'rator-star', name: 'Rator', tempK: 5_200 }],
    bodies: [
      {
        slug: 'rator-iii',
        name: 'Rator III',
        preset: 'desert',
        orbit: 1.2,
        scale: 0.55,
        summary:
          'A planet in or near Romulan space; a Romulan ruse once tried to lure the Enterprise there.',
        wiki: 'Rator_III',
      },
    ],
  },
  {
    slug: 'nimbus-system',
    name: 'Nimbus',
    at: nearSol(1600, -3000),
    quadrant: 'Beta',
    affiliation: 'Federation, Klingon and Romulan, jointly',
    summary:
      'In the Romulan Neutral Zone: the “Planet of Galactic Peace”, a joint colony that never worked.',
    wiki: 'Nimbus_III',
    stars: [{ slug: 'nimbus-star', name: 'Nimbus', tempK: 5_000 }],
    bodies: [
      {
        slug: 'nimbus-iii',
        name: 'Nimbus III',
        preset: 'desert',
        palette: ['#7a6a4a', '#a08a60', '#c8b088'],
        orbit: 1.3,
        scale: 0.55,
        summary: 'A dusty, lawless settlement, Paradise City.',
        wiki: 'Nimbus_III',
      },
    ],
  },

  // ---- Bajor, Cardassia and the Ferengi -------------------------------------------------
  {
    slug: 'bajor-system',
    name: 'Bajor',
    at: nearSol(-4000, 600),
    quadrant: 'Alpha',
    affiliation: 'Bajoran Republic',
    summary:
      'An ancient, spiritual civilization, free again in 2369 after fifty years of Cardassian occupation. The Bajoran wormhole opens nearby.',
    wiki: 'Bajor',
    priority: 9,
    stars: [{ slug: 'bhavael', name: 'B’hava’el', tempK: yellow }],
    bodies: [
      {
        slug: 'bajor',
        name: 'Bajor',
        preset: 'jungle',
        palette: ['#4a6a3a', '#6a8a4a', '#9aa86a', '#c8c09a'],
        orbit: 1.2,
        scale: 0.65,
        summary: 'Temples, farms and the Orbs of the Prophets.',
        wiki: 'Bajor',
        extra: { clouds: { enabled: true, coverage: 0.4 } },
        moons: [
          {
            slug: 'jeraddo',
            name: 'Jeraddo',
            preset: 'jungle',
            scale: 0.8,
            summary: 'Bajor’s fifth moon, tapped for energy in 2369.',
            wiki: 'Jeraddo',
          },
        ],
      },
    ],
    // Out by the wormhole's mouth in the Denorios Belt, where the station was moved in 2369,
    // not in orbit of Bajor.
    stations: [
      {
        slug: 'deep-space-9',
        name: 'Deep Space 9',
        summary:
          'A Cardassian-built ore station, Terok Nor, run by Starfleet and Bajor after the occupation, and moved to the mouth of the wormhole.',
        wiki: 'Deep_Space_9',
        at: [2.0, -1.0],
      },
    ],
  },
  {
    slug: 'cardassia-system',
    name: 'Cardassia',
    at: nearSol(-5300, 1800),
    quadrant: 'Alpha',
    affiliation: 'Cardassian Union',
    power: 'cardassian',
    summary:
      'Capital of the Cardassian Union, a militarist state run by the Central Command and the Obsidian Order.',
    wiki: 'Cardassia_Prime',
    priority: 8,
    stars: [{ slug: 'cardassian-star', name: 'Cardassia', tempK: 5_400 }],
    bodies: [
      {
        slug: 'cardassia-prime',
        name: 'Cardassia Prime',
        preset: 'desert',
        palette: ['#5a4a3a', '#8a6a4a', '#a8885a', '#c8b088'],
        orbit: 1.0,
        scale: 0.65,
        summary: 'A hot world poor in resources, which drove the Cardassians to conquest.',
        wiki: 'Cardassia_Prime',
        extra: { nightLights: { enabled: true, color: '#ffb060', intensity: 1 } },
      },
    ],
  },
  {
    slug: 'chintoka-system',
    name: 'Chin’toka',
    at: nearSol(-4800, 3000),
    quadrant: 'Alpha',
    affiliation: 'Cardassian Union',
    power: 'cardassian',
    summary:
      'A Cardassian system that the Federation and Klingons took in 2374, their first big win of the Dominion War.',
    wiki: "Chin'toka_system",
    stars: [{ slug: 'chintoka-star', name: 'Chin’toka', tempK: 5_200 }],
    bodies: [
      {
        slug: 'chintoka-ii',
        name: 'Chin’toka II',
        preset: 'barren',
        orbit: 1.1,
        scale: 0.55,
        summary: 'Guarded by automated orbital weapon platforms.',
      },
    ],
  },
  {
    slug: 'septimus-system',
    name: 'Septimus',
    at: nearSol(-6100, 800),
    quadrant: 'Alpha',
    affiliation: 'Cardassian Union',
    power: 'cardassian',
    summary:
      'Headquarters of the Cardassian Eleventh Order, wiped out by a Klingon landing late in the Dominion War.',
    wiki: 'Septimus_III',
    stars: [{ slug: 'septimus-star', name: 'Septimus', tempK: yellow }],
    bodies: [
      {
        slug: 'septimus-iii',
        name: 'Septimus III',
        preset: 'jungle',
        orbit: 1.3,
        scale: 0.55,
        summary: 'Where the Klingons landed fifteen divisions in 2375.',
        wiki: 'Septimus_III',
      },
    ],
  },
  {
    slug: 'ferenginar-system',
    name: 'Ferenginar',
    at: nearSol(-5000, -2000),
    quadrant: 'Alpha',
    affiliation: 'Ferengi Alliance',
    summary: 'Home of the Ferengi, where profit is law and the Rules of Acquisition scripture.',
    wiki: 'Ferenginar',
    priority: 7,
    stars: [{ slug: 'ferenginar-star', name: 'Ferenginar', tempK: 4_800 }],
    bodies: [
      {
        slug: 'ferenginar',
        name: 'Ferenginar',
        preset: 'ocean',
        palette: ['#3a4a2a', '#5a6a3a', '#7a7a4a'],
        orbit: 1.1,
        scale: 0.6,
        summary: 'A swampy world where it never stops raining.',
        wiki: 'Ferenginar',
        extra: { clouds: { enabled: true, coverage: 0.85, color: '#9aa0a0' } },
      },
    ],
  },

  // ---- The Gamma Quadrant ---------------------------------------------------------------
  {
    slug: 'idran',
    name: 'Idran',
    at: [-20_000, -42_000],
    quadrant: 'Gamma',
    summary:
      'A trinary star by the Gamma Quadrant end of the Bajoran wormhole, about 70,000 ly from Bajor.',
    wiki: 'Idran',
    priority: 8,
    stars: [
      { slug: 'idran-star', name: 'Idran', tempK: 9_000 },
      { slug: 'idran-b', name: 'Idran B', tempK: 32_000, at: [1.4, 0.4] },
      { slug: 'idran-c', name: 'Idran C', tempK: 30_000, at: [-1.2, -0.8] },
    ],
    bodies: [],
  },
  {
    slug: 'founders-homeworld-system',
    name: 'Founders’ homeworld',
    at: [-21_600, -40_700],
    quadrant: 'Gamma',
    affiliation: 'The Dominion',
    power: 'dominion',
    summary:
      'Hidden in the Omarion Nebula: home of the Founders, the shapeshifters who rule the Dominion.',
    wiki: "Founders'_homeworld_(first)",
    priority: 7,
    stars: [{ slug: 'omarion-star', name: 'Omarion star', tempK: 4_600 }],
    bodies: [
      {
        slug: 'founders-homeworld',
        name: 'Founders’ homeworld',
        preset: 'ocean',
        palette: ['#5a4a3a', '#7a6a50', '#a89070'],
        orbit: 1.2,
        scale: 0.6,
        summary:
          'A rogue world under a cloudy sky, its sea the Great Link. ||Odo’s people, the Changelings.||',
        wiki: "Founders'_homeworld_(first)",
        extra: { clouds: { enabled: true, coverage: 0.6, color: '#c8a8a0' } },
      },
    ],
  },
  {
    slug: 'karemma-system',
    name: 'Karemma',
    at: [-18_600, -40_300],
    quadrant: 'Gamma',
    affiliation: 'The Dominion',
    power: 'dominion',
    summary: 'Home of the Karemma, traders and members of the Dominion.',
    wiki: 'Karemma',
    stars: [{ slug: 'karemma-star', name: 'Karemma', tempK: yellow }],
    bodies: [
      {
        slug: 'karemma',
        name: 'Karemma',
        preset: 'jungle',
        orbit: 1.1,
        scale: 0.55,
        summary: 'The Karemma homeworld.',
        wiki: 'Karemma',
      },
    ],
  },
  {
    slug: 'teplan-system',
    name: 'Teplan',
    at: [-20_700, -39_100],
    quadrant: 'Gamma',
    affiliation: 'The Dominion',
    power: 'dominion',
    summary:
      'Once a great civilization; for resisting the Dominion, the Jem’Hadar gave its people a Blight.',
    wiki: 'Teplan',
    stars: [{ slug: 'teplan-star', name: 'Teplan', tempK: 5_200 }],
    bodies: [
      {
        slug: 'teplan',
        name: 'Teplan',
        preset: 'desert',
        orbit: 1.2,
        scale: 0.55,
        summary: 'The Teplan homeworld, where Dr. Bashir looked for a cure.',
        wiki: 'Teplan',
      },
    ],
  },

  // ---- The Delta Quadrant ---------------------------------------------------------------
  {
    slug: 'ocampa-system',
    name: 'Ocampa',
    at: [32_000, -36_000],
    quadrant: 'Delta',
    summary:
      'Where a being called the Caretaker pulled USS Voyager in 2371, about 70,000 ly from Earth.',
    wiki: 'Ocampa',
    priority: 8,
    stars: [{ slug: 'ocampa-star', name: 'Ocampa', tempK: 5_900 }],
    bodies: [
      {
        slug: 'ocampa',
        name: 'Ocampa',
        preset: 'desert',
        palette: ['#8a6a40', '#b08a5a', '#d0b080', '#e8d0a8'],
        orbit: 1.0,
        scale: 0.6,
        summary: 'A dried-out world; the Ocampa live underground, where the Caretaker kept them.',
        wiki: 'Ocampa',
        stations: [
          {
            slug: 'caretakers-array',
            name: 'Caretaker’s array',
            summary: 'The Caretaker’s vast station, which pulled ships from across the galaxy.',
            wiki: "Caretaker's_array",
          },
        ],
      },
    ],
  },
  {
    slug: 'talax-system',
    name: 'Talax',
    at: [30_600, -34_500],
    quadrant: 'Delta',
    affiliation: 'Talaxian',
    summary: 'Home of the Talaxians, and of Voyager’s cook and guide, Neelix.',
    wiki: 'Talax',
    stars: [{ slug: 'talax-star', name: 'Talax', tempK: 5_400 }],
    bodies: [
      {
        slug: 'talax',
        name: 'Talax',
        preset: 'ocean',
        orbit: 1.1,
        scale: 0.6,
        summary: 'The Talaxian homeworld, with its colonized moon Rinax in the sky.',
        wiki: 'Talax',
        moons: [
          {
            slug: 'rinax',
            name: 'Rinax',
            preset: 'barren',
            scale: 0.8,
            summary: 'A colony moon, struck by the Haakonians’ metreon cascade in 2356.',
            wiki: 'Rinax',
          },
        ],
      },
    ],
  },
];

/** The powers' outlines (groups), in drawing order. */
export const POWERS: { key: Power; name: string; color: string; summary: string; wiki: string }[] =
  [
    {
      key: 'federation',
      name: 'United Federation of Planets',
      color: '#5b9cff',
      summary:
        'An alliance of more than a hundred and fifty worlds, founded in 2161 by Earth, Vulcan, Andoria and Tellar. Its Starfleet explores.',
      wiki: 'United_Federation_of_Planets',
    },
    {
      key: 'klingon',
      name: 'Klingon Empire',
      color: '#e04848',
      summary:
        'A warrior empire ruled by its High Council, enemy and later ally of the Federation.',
      wiki: 'Klingon_Empire',
    },
    {
      key: 'romulan',
      name: 'Romulan Star Empire',
      color: '#36b36a',
      summary: 'A secretive empire behind the Neutral Zone, descended from Vulcan exiles.',
      wiki: 'Romulan_Star_Empire',
    },
    {
      key: 'cardassian',
      name: 'Cardassian Union',
      color: '#d4a537',
      summary: 'A militarist union that occupied Bajor, and joined the Dominion in 2373.',
      wiki: 'Cardassian_Union',
    },
    {
      key: 'dominion',
      name: 'The Dominion',
      color: '#a26bd8',
      summary:
        'A Gamma Quadrant empire run for the Founders by the Vorta and enforced by the Jem’Hadar.',
      wiki: 'Dominion',
    },
    {
      key: 'borg',
      name: 'Borg Collective',
      color: '#7bd84a',
      summary:
        'Cybernetic drones of one hive mind, assimilating whole species into the Collective. Resistance is futile.',
      wiki: 'Borg',
    },
  ];

/**
 * Objects drawn straight on the galaxy, not inside a system: regions, barriers, and the Borg's
 * structures, whose positions are [x, z] in the map's frame like a world's.
 */
export const REGIONS = {
  /** The four quadrants, as faint clouds inside each quarter of the disc. */
  quadrants: [
    {
      slug: 'alpha-quadrant',
      name: 'Alpha Quadrant',
      at: [-15_500, 15_500],
      color: '#4a6ab0',
      summary:
        'The quarter of the galaxy left of Earth’s line to the core: Cardassia, Bajor, the Ferengi and half the Federation.',
      wiki: 'Alpha_Quadrant',
    },
    {
      slug: 'beta-quadrant',
      name: 'Beta Quadrant',
      at: [15_500, 15_500],
      color: '#b04a4a',
      summary:
        'The quarter right of Earth’s line to the core: Vulcan, the Klingon and Romulan empires.',
      wiki: 'Beta_Quadrant',
    },
    {
      slug: 'gamma-quadrant',
      name: 'Gamma Quadrant',
      at: [-15_500, -15_500],
      color: '#4aa080',
      summary:
        'The far quarter beyond Alpha, reached in a moment through the Bajoran wormhole: the Dominion’s domain.',
      wiki: 'Gamma_Quadrant',
    },
    {
      slug: 'delta-quadrant',
      name: 'Delta Quadrant',
      at: [15_500, -15_500],
      color: '#8a5ab8',
      summary: 'The far quarter beyond Beta: Borg space, and USS Voyager’s long road home.',
      wiki: 'Delta_Quadrant',
    },
  ],
  nebulae: [
    {
      slug: 'mutara-nebula',
      name: 'Mutara Nebula',
      at: nearSol(250, 2750),
      radius: 420,
      color: '#b05aa0',
      summary:
        'A charged cloud that blinds sensors and shields, where Kirk fought Khan in 2285 and the Genesis planet formed.',
      wiki: 'Mutara_Nebula',
    },
    {
      slug: 'briar-patch',
      name: 'Briar Patch',
      at: nearSol(1800, 1600),
      radius: 550,
      color: '#c07a5a',
      summary:
        'A tangled nebula that hides the Ba’ku planet and its rejuvenating metaphasic rings.',
      wiki: 'Briar_Patch',
    },
    {
      slug: 'omarion-nebula',
      name: 'Omarion Nebula',
      at: [-21_600, -40_700],
      radius: 600,
      color: '#7a5a8a',
      summary: 'A nebula deep in the Gamma Quadrant, hiding the Founders’ first homeworld.',
      wiki: 'Omarion_Nebula',
    },
    {
      slug: 'nekrit-expanse',
      name: 'Nekrit Expanse',
      at: [27_500, -30_500],
      radius: 1_400,
      color: '#6a7aa0',
      summary: 'A vast, uncharted nebula that Voyager crossed in 2373, leaving Kazon space behind.',
      wiki: 'Nekrit_Expanse',
    },
    {
      slug: 'the-void',
      name: 'The Void',
      at: [21_500, -23_500],
      radius: 1_200,
      color: '#1a1a2a',
      summary:
        'A starless expanse some 2,500 ly across, which would have taken Voyager two dark years to cross. She found a way out sooner.',
      wiki: 'The_Void',
    },
  ],
} as const;

/** The Borg's structures, drawn as stations straight on the galaxy. */
export const BORG_SITES = [
  {
    slug: 'unicomplex',
    name: 'Borg Unicomplex',
    at: [16_500, -14_500] as [number, number],
    summary:
      'The vast home of the Borg Queen, in Unimatrix 01: thousands of joined structures, hundreds of cubes, trillions of drones.',
    wiki: 'Unicomplex',
  },
  {
    slug: 'transwarp-hub',
    name: 'Borg transwarp hub',
    at: [13_500, -11_000] as [number, number],
    summary:
      'A hub of transwarp conduits that reach all four quadrants in minutes. ||Voyager rode one home in 2378 and wrecked it behind her.||',
    wiki: 'Transwarp_hub',
  },
];

/** Routes through objects in order (their slugs). */
export const ROUTES = [
  {
    slug: 'bajoran-wormhole',
    name: 'Bajoran wormhole',
    summary:
      'The only known stable wormhole, built by the beings Bajorans call the Prophets: from Bajor to the Gamma Quadrant, 70,000 ly in moments.',
    color: '#7ad8ff',
    dashed: true,
    stops: ['bajor-system', 'idran'],
    wiki: 'Bajoran_wormhole',
  },
  {
    slug: 'voyagers-journey',
    name: 'Voyager’s journey',
    summary:
      'USS Voyager’s seven-year road home from Ocampa, drawn through the places on this map it passed, not along its full path.',
    color: '#ffd166',
    dashed: false,
    stops: ['ocampa-system', 'talax-system', 'nekrit-expanse', 'the-void', 'transwarp-hub'],
    wiki: 'USS_Voyager',
  },
  {
    slug: 'transwarp-conduit',
    name: 'Transwarp conduit to Earth',
    summary:
      'The Borg conduit Voyager took on its last day in the Delta Quadrant, coming out beside Earth.',
    color: '#7bd84a',
    dashed: true,
    stops: ['transwarp-hub', 'sol'],
    wiki: 'Transwarp_conduit',
  },
];

export const CHARACTERS = [
  {
    slug: 'zefram-cochrane',
    name: 'Zefram Cochrane',
    summary: 'The inventor of warp drive, whose first flight in 2063 brought the Vulcans to Earth.',
    wiki: 'Zefram_Cochrane',
  },
  {
    slug: 'jonathan-archer',
    name: 'Jonathan Archer',
    summary: 'Captain of the first Enterprise, NX-01, and later a founder of the Federation.',
    wiki: 'Jonathan_Archer',
  },
  {
    slug: 'james-t-kirk',
    name: 'James T. Kirk',
    summary: 'Captain of the USS Enterprise on its five-year mission.',
    wiki: 'James_T._Kirk',
  },
  {
    slug: 'spock',
    name: 'Spock',
    summary:
      'Half-Vulcan, half-human science officer of the Enterprise, later an ambassador to the Romulans.',
    wiki: 'Spock',
  },
  {
    slug: 'khan',
    name: 'Khan Noonien Singh',
    summary: 'A genetically engineered tyrant from Earth’s past, found asleep in space by Kirk.',
    wiki: 'Khan_Noonien_Singh',
  },
  {
    slug: 'jean-luc-picard',
    name: 'Jean-Luc Picard',
    summary: 'Captain of the Enterprise-D and -E. ||Assimilated by the Borg as Locutus in 2366.||',
    wiki: 'Jean-Luc_Picard',
  },
  {
    slug: 'data',
    name: 'Data',
    summary: 'An android officer of the Enterprise who longed to be human.',
    wiki: 'Data',
  },
  {
    slug: 'worf',
    name: 'Worf',
    summary: 'The first Klingon in Starfleet, orphaned at Khitomer, later on Deep Space 9.',
    wiki: 'Worf',
  },
  {
    slug: 'q',
    name: 'Q',
    summary: 'An all-powerful being of the Q Continuum who puts humanity on trial, for fun.',
    wiki: 'Q',
  },
  {
    slug: 'benjamin-sisko',
    name: 'Benjamin Sisko',
    summary:
      'Commander of Deep Space 9 and, to the Bajorans, the Emissary of the Prophets. He lost his wife at Wolf 359.',
    wiki: 'Benjamin_Sisko',
  },
  {
    slug: 'kira-nerys',
    name: 'Kira Nerys',
    summary: 'A former Bajoran resistance fighter, first officer of Deep Space 9.',
    wiki: 'Kira_Nerys',
  },
  {
    slug: 'odo',
    name: 'Odo',
    summary:
      'Deep Space 9’s shapeshifting security chief, who knew nothing of his people. ||They are the Founders.||',
    wiki: 'Odo',
  },
  {
    slug: 'kathryn-janeway',
    name: 'Kathryn Janeway',
    summary: 'Captain of USS Voyager, stranded in the Delta Quadrant.',
    wiki: 'Kathryn_Janeway',
  },
  {
    slug: 'seven-of-nine',
    name: 'Seven of Nine',
    summary: 'A human drone freed from the Borg Collective, who joined Voyager’s crew.',
    wiki: 'Seven_of_Nine',
  },
];

/** Dates are years of the Common Era; Starfleet's stardates don't sort across the shows. */
export const EVENTS = [
  {
    slug: 'first-contact',
    name: 'First contact with the Vulcans',
    category: 'First contact',
    date: '2063',
    sort: 2063,
    at: 'earth',
    people: ['zefram-cochrane'],
    summary:
      'Cochrane’s first warp flight draws a passing Vulcan ship, which lands in Bozeman, Montana.',
    wiki: 'First_contact',
  },
  {
    slug: 'founding-of-the-federation',
    name: 'Founding of the Federation',
    category: 'Diplomacy',
    date: '2161',
    sort: 2161,
    at: 'earth',
    people: ['jonathan-archer'],
    summary:
      'Earth, Vulcan, Andoria and Tellar sign the charter of the United Federation of Planets in San Francisco.',
    wiki: 'United_Federation_of_Planets',
  },
  {
    slug: 'battle-of-the-mutara-nebula',
    name: 'Battle of the Mutara Nebula',
    category: 'Battle',
    date: '2285',
    sort: 2285,
    at: 'mutara-nebula',
    people: ['james-t-kirk', 'spock', 'khan'],
    summary:
      'Kirk lures Khan’s stolen Reliant into the nebula, where neither ship can see. ||Spock gives his life to save the Enterprise.||',
    wiki: 'Battle_of_the_Mutara_Nebula',
  },
  {
    slug: 'praxis-explosion',
    name: 'Explosion of Praxis',
    category: 'Disaster',
    date: '2293',
    sort: 2293.1,
    at: 'praxis',
    people: [],
    summary:
      'The Klingons’ energy moon explodes, crippling the Empire and forcing it to seek peace.',
    wiki: 'Praxis',
  },
  {
    slug: 'khitomer-accords',
    name: 'Khitomer Accords',
    category: 'Diplomacy',
    date: '2293',
    sort: 2293.2,
    at: 'khitomer',
    people: ['james-t-kirk', 'spock'],
    summary: 'Peace between the Federation and the Klingon Empire, saved from assassins by Kirk.',
    wiki: 'Khitomer_Accords',
  },
  {
    slug: 'encounter-at-farpoint',
    name: 'Encounter at Farpoint',
    category: 'Exploration',
    date: '2364',
    sort: 2364,
    at: 'farpoint-station',
    people: ['jean-luc-picard', 'data', 'q'],
    summary:
      'The Enterprise-D’s first mission, a station too good to be true, and Q’s trial of humanity.',
    wiki: 'Farpoint_Station',
  },
  {
    slug: 'battle-of-wolf-359',
    name: 'Battle of Wolf 359',
    category: 'Battle',
    date: '2367',
    sort: 2367,
    at: 'wolf-359',
    people: ['jean-luc-picard', 'benjamin-sisko'],
    summary:
      'One Borg cube destroys 39 Starfleet ships on its way to Earth. ||It is led by Picard, assimilated as Locutus.||',
    wiki: 'Battle_of_Wolf_359',
  },
  {
    slug: 'discovery-of-the-wormhole',
    name: 'Discovery of the Bajoran wormhole',
    category: 'Exploration',
    date: '2369',
    sort: 2369,
    at: 'deep-space-9',
    people: ['benjamin-sisko', 'kira-nerys', 'odo'],
    summary:
      'Sisko finds the first stable wormhole, and moves Deep Space 9 to its mouth. ||Its makers name him their Emissary.||',
    wiki: 'Bajoran_wormhole',
  },
  {
    slug: 'voyager-lost',
    name: 'Voyager is lost',
    category: 'Exploration',
    date: '2371',
    sort: 2371,
    at: 'caretakers-array',
    people: ['kathryn-janeway'],
    summary:
      'The Caretaker pulls Voyager across the galaxy. Janeway destroys his array to protect the Ocampa, stranding her crew.',
    wiki: 'USS_Voyager',
  },
  {
    slug: 'battle-of-sector-001',
    name: 'Battle of Sector 001',
    category: 'Battle',
    date: '2373',
    sort: 2373,
    at: 'earth',
    people: ['jean-luc-picard', 'worf', 'data'],
    summary:
      'Another Borg cube reaches Earth; the Enterprise-E follows its sphere back in time to 2063.',
    wiki: 'Battle_of_Sector_001',
  },
  {
    slug: 'first-battle-of-chintoka',
    name: 'First Battle of Chin’toka',
    category: 'Battle',
    date: '2374',
    sort: 2374,
    at: 'chintoka-system',
    people: ['benjamin-sisko', 'worf'],
    summary: 'The Federation and Klingons strike into Cardassian space and take the system.',
    wiki: "First_Battle_of_Chin'toka",
  },
  {
    slug: 'battle-of-cardassia',
    name: 'Battle of Cardassia',
    category: 'Battle',
    date: '2375',
    sort: 2375,
    at: 'cardassia-prime',
    people: ['benjamin-sisko', 'kira-nerys', 'odo'],
    summary:
      'The last battle of the Dominion War. ||The Cardassians turn on the Dominion, and the Founders surrender.||',
    wiki: 'Battle_of_Cardassia',
  },
  {
    slug: 'voyager-comes-home',
    name: 'Voyager comes home',
    category: 'Exploration',
    date: '2378',
    sort: 2378,
    at: 'transwarp-hub',
    people: ['kathryn-janeway', 'seven-of-nine'],
    summary:
      '||With help from her own future, Janeway takes Voyager through a Borg transwarp hub to Earth, and destroys the hub behind her.||',
    isSpoiler: true,
    wiki: 'Transwarp_hub',
  },
  {
    slug: 'hobus-supernova',
    name: 'The Hobus supernova',
    category: 'Disaster',
    date: '2387',
    sort: 2387,
    at: 'romulus',
    people: ['spock'],
    summary: '||A supernova destroys Romulus; Spock’s attempt to save it fails.||',
    isSpoiler: true,
    wiki: 'Hobus',
  },
];
