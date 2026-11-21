/**
 * The Star Wars galaxy: a fan reference map. Each world sits in its grid square on the standard
 * galaxy map (letters west to east, numbers north to south), which is as precise as the sources
 * get, so positions are approximate within a square. Summaries are written for this map, in its
 * own words. `||…||` marks a spoiler (ux.md §6), hidden until the reader asks.
 */

export type Region =
  | 'Deep Core'
  | 'Core Worlds'
  | 'Colonies'
  | 'Inner Rim'
  | 'Expansion Region'
  | 'Mid Rim'
  | 'Hutt Space'
  | 'Outer Rim Territories'
  | 'Wild Space'
  | 'Unknown Regions';

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
  /** Grid square, such as "L-9"; null where no map shows it. */
  grid: string | null;
  /** Where to put it when there's no square: [column, row] in grid units. */
  at?: [number, number];
  region: Region;
  sector?: string;
  summary: string;
  wiki: string;
  priority?: number;
  stars: { slug: string; name: string; tempK: number; at?: [number, number] }[];
  bodies: Body[];
}

const yellow = 5_600;

export const WORLDS: World[] = [
  {
    slug: 'coruscant',
    name: 'Coruscant',
    grid: 'L-9',
    region: 'Core Worlds',
    summary:
      'A planet-wide city: capital of the Republic, then the Empire, and home of the Jedi Temple.',
    wiki: 'Coruscant',
    priority: 10,
    stars: [{ slug: 'coruscant-prime', name: 'Coruscant Prime', tempK: yellow }],
    bodies: [
      {
        slug: 'coruscant-planet',
        name: 'Coruscant',
        preset: 'city',
        orbit: 1.4,
        scale: 0.7,
        summary:
          'Every continent built over, level upon level, down to the ground no one has seen for millennia.',
        extra: { nightLights: { enabled: true, color: '#ffd27f', intensity: 1.4 } },
      },
    ],
  },
  {
    slug: 'chandrila',
    name: 'Chandrila',
    grid: 'L-9',
    region: 'Core Worlds',
    summary: 'A gentle world of lakes and seas, and the New Republic’s first capital.',
    wiki: 'Chandrila',
    stars: [{ slug: 'chandrila-star', name: 'Chandrila', tempK: yellow }],
    bodies: [
      {
        slug: 'chandrila-planet',
        name: 'Chandrila',
        preset: 'ocean',
        orbit: 1.2,
        scale: 0.6,
        summary: 'Rolling hills and lakes; Mon Mothma’s homeworld.',
        extra: { clouds: { enabled: true, coverage: 0.4 } },
      },
    ],
  },
  {
    slug: 'alderaan',
    name: 'Alderaan',
    grid: 'M-10',
    region: 'Core Worlds',
    summary:
      'A peaceful, mountainous world famed for its culture, and Leia Organa’s home. ||Destroyed by the Death Star in 0 BBY.||',
    wiki: 'Alderaan',
    priority: 8,
    stars: [{ slug: 'alderaan-star', name: 'Alderaan', tempK: yellow }],
    bodies: [
      {
        slug: 'alderaan-planet',
        name: 'Alderaan',
        preset: 'ocean',
        orbit: 1.3,
        scale: 0.6,
        summary: 'Snow-capped mountains and grasslands, with no weapons of its own.',
        extra: { clouds: { enabled: true, coverage: 0.5 } },
      },
    ],
  },
  {
    slug: 'corellia',
    name: 'Corellia',
    grid: 'M-11',
    region: 'Core Worlds',
    summary: 'A shipbuilding world of pilots and smugglers, and the start of the Corellian Run.',
    wiki: 'Corellia',
    priority: 7,
    stars: [{ slug: 'corell', name: 'Corell', tempK: yellow }],
    bodies: [
      {
        slug: 'corellia-planet',
        name: 'Corellia',
        preset: 'ocean',
        orbit: 1.1,
        scale: 0.6,
        summary: 'Han Solo’s homeworld, its shipyards turning out freighters and warships.',
        extra: { nightLights: { enabled: true, intensity: 1 } },
      },
    ],
  },
  {
    slug: 'ord-mantell',
    name: 'Ord Mantell',
    grid: 'L-7',
    region: 'Mid Rim',
    summary: 'A rough world of junkyards, gambling and bounty hunters.',
    wiki: 'Ord_Mantell',
    stars: [{ slug: 'ord-mantell-star', name: 'Ord Mantell', tempK: yellow }],
    bodies: [
      {
        slug: 'ord-mantell-planet',
        name: 'Ord Mantell',
        preset: 'barren',
        palette: ['#4a4038', '#7a6a58', '#a89478'],
        orbit: 1.2,
        scale: 0.6,
        summary: 'Scrapyards and spaceports.',
      },
    ],
  },
  {
    slug: 'dantooine',
    name: 'Dantooine',
    grid: 'L-4',
    region: 'Outer Rim Territories',
    summary: 'A remote world of grassy plains, once home to a Rebel base.',
    wiki: 'Dantooine',
    stars: [{ slug: 'dantooine-star', name: 'Dantooine', tempK: yellow }],
    bodies: [
      {
        slug: 'dantooine-planet',
        name: 'Dantooine',
        preset: 'jungle',
        palette: ['#3a5a2a', '#6a8a3a', '#a8b86a'],
        orbit: 1.3,
        scale: 0.6,
        summary: 'Wide plains and scattered trees.',
      },
    ],
  },
  {
    slug: 'mandalore',
    name: 'Mandalore',
    grid: 'O-7',
    region: 'Outer Rim Territories',
    summary: 'Homeworld of the Mandalorians, warriors bound by their creed.',
    wiki: 'Mandalore',
    priority: 7,
    stars: [{ slug: 'mandalore-star', name: 'Mandalore', tempK: yellow }],
    bodies: [
      {
        slug: 'mandalore-planet',
        name: 'Mandalore',
        preset: 'desert',
        palette: ['#4a3a30', '#8a7a6a', '#c8b8a0'],
        orbit: 1.2,
        scale: 0.6,
        summary:
          'Domed cities on a scorched world. ||Glassed by the Empire during the Great Purge.||',
      },
    ],
  },
  {
    slug: 'kashyyyk',
    name: 'Kashyyyk',
    grid: 'P-9',
    region: 'Mid Rim',
    summary: 'The forest world of the Wookiees, Chewbacca’s home.',
    wiki: 'Kashyyyk',
    priority: 8,
    stars: [{ slug: 'kashyyyk-star', name: 'Kashyyyk', tempK: yellow }],
    bodies: [
      {
        slug: 'kashyyyk-planet',
        name: 'Kashyyyk',
        preset: 'jungle',
        palette: ['#1e3a1a', '#2e5a26', '#4a7a36', '#6a5a3a'],
        orbit: 1.2,
        scale: 0.65,
        summary: 'Wroshyr trees kilometres tall, with Wookiee cities in their branches.',
      },
    ],
  },
  {
    slug: 'kessel',
    name: 'Kessel',
    grid: 'T-10',
    region: 'Outer Rim Territories',
    summary: 'A mining world of spice, and the end of the notorious Kessel Run.',
    wiki: 'Kessel',
    stars: [{ slug: 'kessel-star', name: 'Kessel', tempK: 4_200 }],
    bodies: [
      {
        slug: 'kessel-planet',
        name: 'Kessel',
        preset: 'barren',
        palette: ['#3a3a40', '#6a6a70', '#9a8a7a'],
        orbit: 1,
        scale: 0.55,
        summary: 'Spice mines worked by slaves under the Pykes.',
      },
    ],
  },
  {
    slug: 'bothawui',
    name: 'Bothawui',
    grid: 'R-14',
    region: 'Mid Rim',
    summary: 'Homeworld of the Bothans, spies and information brokers.',
    wiki: 'Bothawui',
    stars: [{ slug: 'bothawui-star', name: 'Bothawui', tempK: yellow }],
    bodies: [
      {
        slug: 'bothawui-planet',
        name: 'Bothawui',
        preset: 'jungle',
        orbit: 1.2,
        scale: 0.6,
        summary: 'Forested and temperate.',
      },
    ],
  },
  {
    slug: 'nal-hutta',
    name: 'Nal Hutta',
    grid: 'S-12',
    region: 'Hutt Space',
    summary: 'The Hutt clans’ swampy capital, with the smugglers’ moon Nar Shaddaa.',
    wiki: 'Nal_Hutta',
    priority: 6,
    stars: [{ slug: 'y-toub', name: 'Y’Toub', tempK: 4_800 }],
    bodies: [
      {
        slug: 'nal-hutta-planet',
        name: 'Nal Hutta',
        preset: 'toxic',
        orbit: 1.3,
        scale: 0.7,
        summary: 'Fetid bogs and the Hutts’ palaces.',
        moons: [
          {
            slug: 'nar-shaddaa',
            name: 'Nar Shaddaa',
            preset: 'city',
            scale: 0.8,
            summary: 'The Smugglers’ Moon: a vertical city of crime.',
            wiki: 'Nar_Shaddaa',
          },
        ],
      },
    ],
  },
  {
    slug: 'sullust',
    name: 'Sullust',
    grid: 'M-17',
    region: 'Outer Rim Territories',
    summary: 'A volcanic world whose people live in caves beneath its surface.',
    wiki: 'Sullust',
    stars: [{ slug: 'sullust-star', name: 'Sullust', tempK: yellow }],
    bodies: [
      {
        slug: 'sullust-planet',
        name: 'Sullust',
        preset: 'lava',
        orbit: 1.1,
        scale: 0.6,
        summary: 'Toxic air, lava fields and underground cities.',
      },
    ],
  },
  {
    slug: 'mon-cala',
    name: 'Mon Cala',
    grid: 'U-6',
    region: 'Outer Rim Territories',
    summary: 'An ocean world, home of the Mon Calamari and the Quarren, and of starship builders.',
    wiki: 'Mon_Cala',
    priority: 6,
    stars: [{ slug: 'mon-cala-star', name: 'Mon Cala', tempK: yellow }],
    bodies: [
      {
        slug: 'mon-cala-planet',
        name: 'Mon Cala',
        preset: 'ocean',
        orbit: 1.2,
        scale: 0.7,
        summary: 'Almost all ocean, with floating cities.',
        extra: { seaLevel: 0.98 },
      },
    ],
  },
  {
    slug: 'tatooine',
    name: 'Tatooine',
    grid: 'R-16',
    region: 'Outer Rim Territories',
    sector: 'Arkanis',
    summary:
      'A desert world under twin suns, run by the Hutts, where the Skywalkers’ story begins.',
    wiki: 'Tatooine',
    priority: 10,
    stars: [
      { slug: 'tatoo-i', name: 'Tatoo I', tempK: 5_800, at: [-0.8, 0] },
      { slug: 'tatoo-ii', name: 'Tatoo II', tempK: 4_900, at: [0.8, 0] },
    ],
    bodies: [
      {
        slug: 'tatooine-planet',
        name: 'Tatooine',
        preset: 'desert',
        palette: ['#8a6a3a', '#c9a46a', '#e8cf9a'],
        orbit: 2.4,
        scale: 0.6,
        summary: 'Dunes, moisture farms and Mos Eisley spaceport.',
      },
    ],
  },
  {
    slug: 'geonosis',
    name: 'Geonosis',
    grid: 'R-16',
    region: 'Outer Rim Territories',
    sector: 'Arkanis',
    summary: 'A ringed red desert world of insectoid droid builders, where the Clone Wars began.',
    wiki: 'Geonosis',
    priority: 7,
    stars: [{ slug: 'geonosis-star', name: 'Geonosis', tempK: 5_000 }],
    bodies: [
      {
        slug: 'geonosis-planet',
        name: 'Geonosis',
        preset: 'desert',
        palette: ['#5a1e10', '#9a3a20', '#c86a3a'],
        orbit: 1.4,
        scale: 0.6,
        summary: 'Rock spires, hive factories and asteroid rings.',
        extra: {
          rings: {
            enabled: true,
            innerRadius: 1.5,
            outerRadius: 2.3,
            color: '#8a6a5a',
            opacity: 0.6,
          },
        },
      },
    ],
  },
  {
    slug: 'rodia',
    name: 'Rodia',
    grid: 'R-16',
    region: 'Outer Rim Territories',
    summary: 'The humid jungle homeworld of the Rodians.',
    wiki: 'Rodia',
    stars: [{ slug: 'tyrius', name: 'Tyrius', tempK: yellow }],
    bodies: [
      {
        slug: 'rodia-planet',
        name: 'Rodia',
        preset: 'jungle',
        orbit: 1.1,
        scale: 0.6,
        summary: 'Swamps and jungles.',
      },
    ],
  },
  {
    slug: 'ryloth',
    name: 'Ryloth',
    grid: 'R-17',
    region: 'Outer Rim Territories',
    summary: 'The rocky homeworld of the Twi’leks, on the Corellian Run.',
    wiki: 'Ryloth',
    priority: 6,
    stars: [{ slug: 'ryloth-star', name: 'Ryloth', tempK: yellow }],
    bodies: [
      {
        slug: 'ryloth-planet',
        name: 'Ryloth',
        preset: 'desert',
        palette: ['#5a4a3a', '#9a7a5a', '#c8a888'],
        orbit: 1.2,
        scale: 0.6,
        summary: 'Barren highlands; its people live in caves and canyons.',
      },
    ],
  },
  {
    slug: 'naboo',
    name: 'Naboo',
    grid: 'O-17',
    region: 'Mid Rim',
    sector: 'Chommell',
    summary:
      'A green world of lakes and plains, home of the Gungans and of Padmé Amidala and Palpatine.',
    wiki: 'Naboo',
    priority: 9,
    stars: [{ slug: 'naboo-star', name: 'Naboo', tempK: yellow }],
    bodies: [
      {
        slug: 'naboo-planet',
        name: 'Naboo',
        preset: 'jungle',
        palette: ['#1e4a2a', '#3a7a3a', '#7ab86a'],
        orbit: 1.2,
        scale: 0.65,
        summary: 'Theed’s domes above waterfalls, and Gungan cities beneath the lakes.',
        extra: { clouds: { enabled: true, coverage: 0.4 } },
      },
    ],
  },
  {
    slug: 'kamino',
    name: 'Kamino',
    grid: 'S-15',
    region: 'Wild Space',
    summary:
      'A storm-wrapped ocean world, missing from the Jedi archives, where the clone army was grown.',
    wiki: 'Kamino',
    priority: 7,
    stars: [{ slug: 'kamino-star', name: 'Kamino', tempK: 6_200 }],
    bodies: [
      {
        slug: 'kamino-planet',
        name: 'Kamino',
        preset: 'ocean',
        orbit: 1.3,
        scale: 0.65,
        summary: 'Endless storms over a planet-wide ocean, and stilted cities.',
        extra: { seaLevel: 0.99, clouds: { enabled: true, coverage: 0.85, color: '#c8ccd0' } },
      },
    ],
  },
  {
    slug: 'utapau',
    name: 'Utapau',
    grid: 'N-19',
    region: 'Outer Rim Territories',
    summary: 'A windswept world whose cities hang in deep sinkholes.',
    wiki: 'Utapau',
    stars: [{ slug: 'utapau-star', name: 'Utapau', tempK: yellow }],
    bodies: [
      {
        slug: 'utapau-planet',
        name: 'Utapau',
        preset: 'desert',
        palette: ['#6a5a4a', '#a89070', '#d8c8a8'],
        orbit: 1.2,
        scale: 0.6,
        summary: 'Dry plains pocked with sinkholes.',
      },
    ],
  },
  {
    slug: 'mustafar',
    name: 'Mustafar',
    grid: 'L-19',
    region: 'Outer Rim Territories',
    summary: 'A volcanic world of lava rivers and mining stations.',
    wiki: 'Mustafar',
    priority: 8,
    stars: [{ slug: 'mustafar-star', name: 'Mustafar', tempK: 4_400 }],
    bodies: [
      {
        slug: 'mustafar-planet',
        name: 'Mustafar',
        preset: 'lava',
        orbit: 1,
        scale: 0.55,
        summary: 'Lava falls and ash skies. ||Darth Vader later built his castle here.||',
      },
    ],
  },
  {
    slug: 'dagobah',
    name: 'Dagobah',
    grid: 'M-19',
    region: 'Outer Rim Territories',
    summary: 'A swamp world thick with life and fog, where Yoda hid in exile.',
    wiki: 'Dagobah',
    priority: 8,
    stars: [{ slug: 'dagobah-star', name: 'Dagobah', tempK: yellow }],
    bodies: [
      {
        slug: 'dagobah-planet',
        name: 'Dagobah',
        preset: 'jungle',
        palette: ['#1a2a1a', '#2e3e26', '#4a5a3a', '#6a6a4a'],
        orbit: 1.1,
        scale: 0.6,
        summary: 'Bogs, gnarled trees and mist.',
        extra: { clouds: { enabled: true, coverage: 0.7, color: '#9aa898' } },
      },
    ],
  },
  {
    slug: 'hoth',
    name: 'Hoth',
    grid: 'K-18',
    region: 'Outer Rim Territories',
    sector: 'Anoat',
    summary:
      'A frozen world on the edge of the Anoat sector, where the Rebellion hid its Echo Base.',
    wiki: 'Hoth',
    priority: 9,
    stars: [{ slug: 'hoth-star', name: 'Hoth', tempK: 7_500 }],
    bodies: [
      {
        slug: 'hoth-planet',
        name: 'Hoth',
        preset: 'ice',
        orbit: 3.5,
        scale: 0.6,
        summary: 'Ice plains, blizzards, wampas and tauntauns.',
      },
    ],
  },
  {
    slug: 'bespin',
    name: 'Bespin',
    grid: 'K-18',
    region: 'Outer Rim Territories',
    sector: 'Anoat',
    summary: 'A gas giant mined for tibanna gas, with Cloud City floating in its skies.',
    wiki: 'Bespin',
    priority: 8,
    stars: [{ slug: 'bespin-star', name: 'Bespin', tempK: yellow }],
    bodies: [
      {
        slug: 'bespin-planet',
        name: 'Bespin',
        preset: 'gas_giant',
        palette: ['#c88a5a', '#e8b88a', '#f2d8b8', '#d89a6a'],
        orbit: 2,
        scale: 1.6,
        summary: 'Cloud layers in shades of peach and gold.',
        stations: [
          {
            slug: 'cloud-city',
            name: 'Cloud City',
            summary: 'A floating mining colony run by Lando Calrissian.',
            wiki: 'Cloud_City',
          },
        ],
      },
    ],
  },
  {
    slug: 'endor',
    name: 'Endor',
    grid: 'H-16',
    region: 'Outer Rim Territories',
    sector: 'Moddell',
    summary:
      'A remote gas giant whose forest moon hid the shield generator of the second Death Star.',
    wiki: 'Endor',
    priority: 9,
    stars: [{ slug: 'endor-star', name: 'Endor', tempK: yellow }],
    bodies: [
      {
        slug: 'endor-planet',
        name: 'Endor',
        preset: 'gas_giant',
        palette: ['#5a6a8a', '#8a9ab8', '#c8d0e0'],
        orbit: 2.2,
        scale: 1.6,
        summary: 'A gas giant ringed by moons.',
        moons: [
          {
            slug: 'forest-moon-of-endor',
            name: 'Forest Moon of Endor',
            preset: 'jungle',
            palette: ['#1a3a1a', '#2e5a2a', '#4a7a3a'],
            scale: 1.2,
            summary: 'Towering forests, home of the Ewoks.',
            wiki: 'Forest_moon_of_Endor',
          },
        ],
      },
    ],
  },
  {
    slug: 'yavin',
    name: 'Yavin',
    grid: 'P-6',
    region: 'Outer Rim Territories',
    summary:
      'A red gas giant whose jungle moon, Yavin 4, held the Rebel base at the Battle of Yavin.',
    wiki: 'Yavin',
    priority: 9,
    stars: [{ slug: 'yavin-star', name: 'Yavin', tempK: yellow }],
    bodies: [
      {
        slug: 'yavin-planet',
        name: 'Yavin',
        preset: 'gas_giant',
        palette: ['#8a3a1a', '#c86a3a', '#e8a06a', '#a84a2a'],
        orbit: 2.5,
        scale: 1.8,
        summary: 'A giant of orange and red bands.',
        moons: [
          {
            slug: 'yavin-4',
            name: 'Yavin 4',
            preset: 'jungle',
            scale: 1,
            summary: 'Jungle and ancient Massassi temples.',
            wiki: 'Yavin_4',
          },
        ],
      },
    ],
  },
  {
    slug: 'felucia',
    name: 'Felucia',
    grid: 'R-6',
    region: 'Outer Rim Territories',
    summary: 'A humid world overgrown with giant, brightly coloured fungi.',
    wiki: 'Felucia',
    stars: [{ slug: 'felucia-star', name: 'Felucia', tempK: yellow }],
    bodies: [
      {
        slug: 'felucia-planet',
        name: 'Felucia',
        preset: 'jungle',
        palette: ['#3a6a2a', '#c86aa8', '#e8c86a', '#6ac8a8'],
        orbit: 1.1,
        scale: 0.6,
        summary: 'Fungal forests in every colour.',
      },
    ],
  },
  {
    slug: 'ilum',
    name: 'Ilum',
    grid: 'G-7',
    region: 'Unknown Regions',
    summary:
      'An ice world sacred to the Jedi, whose caves grew the kyber crystals of their lightsabers. ||Later hollowed out into Starkiller Base.||',
    wiki: 'Ilum',
    priority: 6,
    stars: [{ slug: 'ilum-star', name: 'Ilum', tempK: 6_500 }],
    bodies: [
      {
        slug: 'ilum-planet',
        name: 'Ilum',
        preset: 'ice',
        orbit: 1.3,
        scale: 0.55,
        summary: 'Ice, snow and crystal caves.',
      },
    ],
  },
  {
    slug: 'exegol',
    name: 'Exegol',
    grid: null,
    // Deep in the Unknown Regions; no map gives a square.
    at: [2.5, 10.5],
    region: 'Unknown Regions',
    summary:
      'A hidden world of storms and lightning in the Unknown Regions. ||The Sith Eternal’s stronghold, where Palpatine waited.||',
    wiki: 'Exegol',
    priority: 6,
    stars: [{ slug: 'exegol-star', name: 'Exegol', tempK: 3_400 }],
    bodies: [
      {
        slug: 'exegol-planet',
        name: 'Exegol',
        preset: 'barren',
        palette: ['#141418', '#2a2a32', '#4a4a58'],
        orbit: 1.2,
        scale: 0.6,
        summary: 'Black rock under endless lightning.',
        extra: { clouds: { enabled: true, coverage: 0.8, color: '#3a3a4a' } },
      },
    ],
  },
];

/** A hyperspace route through worlds in order (their slugs). */
export const ROUTES = [
  {
    slug: 'corellian-run',
    name: 'Corellian Run',
    summary:
      'One of the great trade routes, from Coruscant past Corellia out to the Outer Rim. Drawn through the worlds on this map it’s known to pass, not along its full path.',
    color: '#ffe81f',
    stops: ['coruscant', 'corellia', 'ryloth'],
    wiki: 'Corellian_Run',
  },
];

export const CHARACTERS = [
  {
    slug: 'luke-skywalker',
    name: 'Luke Skywalker',
    summary: 'A farm boy from Tatooine who became a Jedi Knight.',
    wiki: 'Luke_Skywalker',
  },
  {
    slug: 'leia-organa',
    name: 'Leia Organa',
    summary: 'Princess of Alderaan, senator and Rebel leader. ||Luke’s twin sister.||',
    wiki: 'Leia_Skywalker_Organa_Solo',
  },
  {
    slug: 'han-solo',
    name: 'Han Solo',
    summary: 'A Corellian smuggler, captain of the Millennium Falcon.',
    wiki: 'Han_Solo',
  },
  {
    slug: 'chewbacca',
    name: 'Chewbacca',
    summary: 'A Wookiee warrior from Kashyyyk, Han Solo’s co-pilot.',
    wiki: 'Chewbacca',
  },
  {
    slug: 'anakin-skywalker',
    name: 'Anakin Skywalker',
    summary:
      'A slave boy from Tatooine who became a Jedi Knight. ||He fell to the dark side and became Darth Vader.||',
    wiki: 'Anakin_Skywalker',
  },
  {
    slug: 'darth-vader',
    name: 'Darth Vader',
    summary: 'The Emperor’s armoured enforcer. ||Luke and Leia’s father, Anakin Skywalker.||',
    wiki: 'Anakin_Skywalker',
  },
  {
    slug: 'obi-wan-kenobi',
    name: 'Obi-Wan Kenobi',
    summary: 'A Jedi Master, Anakin’s teacher, later an exile on Tatooine.',
    wiki: 'Obi-Wan_Kenobi',
  },
  {
    slug: 'yoda',
    name: 'Yoda',
    summary: 'Grand Master of the Jedi Order, later in exile on Dagobah.',
    wiki: 'Yoda',
  },
  {
    slug: 'padme-amidala',
    name: 'Padmé Amidala',
    summary: 'Queen, then senator, of Naboo.',
    wiki: 'Padmé_Amidala',
  },
  {
    slug: 'palpatine',
    name: 'Sheev Palpatine',
    summary:
      'Senator of Naboo, then Supreme Chancellor and Emperor. ||Secretly the Sith Lord Darth Sidious.||',
    wiki: 'Darth_Sidious',
  },
  {
    slug: 'lando-calrissian',
    name: 'Lando Calrissian',
    summary: 'A gambler and Han’s old friend, administrator of Cloud City.',
    wiki: 'Lando_Calrissian',
  },
  {
    slug: 'rey',
    name: 'Rey',
    summary: 'A scavenger from Jakku who trained as a Jedi.',
    wiki: 'Rey_Skywalker',
  },
];

/** Dates as the galaxy counts them: years before (BBY) or after (ABY) the Battle of Yavin. */
export const EVENTS = [
  {
    slug: 'battle-of-naboo',
    name: 'Battle of Naboo',
    category: 'Battle',
    date: '32 BBY',
    sort: -32,
    at: 'naboo-planet',
    people: ['padme-amidala', 'anakin-skywalker', 'obi-wan-kenobi', 'palpatine'],
    summary: 'The Trade Federation’s invasion of Naboo is broken on the ground and in orbit.',
    wiki: 'Battle_of_Naboo',
  },
  {
    slug: 'first-battle-of-geonosis',
    name: 'First Battle of Geonosis',
    category: 'Battle',
    date: '22 BBY',
    sort: -22,
    at: 'geonosis-planet',
    people: ['obi-wan-kenobi', 'anakin-skywalker', 'padme-amidala', 'yoda'],
    summary:
      'The Republic’s new clone army meets the Separatist droids: the first battle of the Clone Wars.',
    wiki: 'First_Battle_of_Geonosis',
  },
  {
    slug: 'battle-of-kashyyyk',
    name: 'Battle of Kashyyyk',
    category: 'Battle',
    date: '19 BBY',
    sort: -19.1,
    at: 'kashyyyk-planet',
    people: ['yoda', 'chewbacca'],
    summary:
      'Wookiees and clones hold their world against a droid invasion. ||Then the clones turn on the Jedi.||',
    wiki: 'Battle_of_Kashyyyk',
  },
  {
    slug: 'duel-on-mustafar',
    name: 'Duel on Mustafar',
    category: 'Duel',
    date: '19 BBY',
    sort: -19,
    at: 'mustafar-planet',
    people: ['obi-wan-kenobi', 'anakin-skywalker'],
    summary:
      '||Obi-Wan fights his fallen apprentice Anakin among the lava rivers, and leaves him for dead.||',
    isSpoiler: true,
    wiki: 'Duel_on_Mustafar',
  },
  {
    slug: 'destruction-of-alderaan',
    name: 'Destruction of Alderaan',
    category: 'Battle',
    date: '0 BBY',
    sort: -0.1,
    at: 'alderaan-planet',
    people: ['leia-organa'],
    summary: '||The Death Star destroys Alderaan to show the Empire’s power.||',
    isSpoiler: true,
    wiki: 'Destruction_of_Alderaan',
  },
  {
    slug: 'battle-of-yavin',
    name: 'Battle of Yavin',
    category: 'Battle',
    date: '0 BBY',
    sort: 0,
    at: 'yavin-4',
    people: ['luke-skywalker', 'han-solo', 'leia-organa', 'darth-vader'],
    summary:
      'Rebel starfighters attack the Death Star from Yavin 4. ||Luke’s torpedoes destroy it.||',
    wiki: 'Battle_of_Yavin',
  },
  {
    slug: 'battle-of-hoth',
    name: 'Battle of Hoth',
    category: 'Battle',
    date: '3 ABY',
    sort: 3,
    at: 'hoth-planet',
    people: ['luke-skywalker', 'han-solo', 'leia-organa', 'darth-vader'],
    summary: 'Imperial walkers storm Echo Base; the Rebels escape.',
    wiki: 'Battle_of_Hoth',
  },
  {
    slug: 'training-on-dagobah',
    name: 'Luke trains on Dagobah',
    category: 'Jedi',
    date: '3 ABY',
    sort: 3.1,
    at: 'dagobah-planet',
    people: ['luke-skywalker', 'yoda'],
    summary: 'Yoda teaches Luke the ways of the Force in the swamps.',
    wiki: 'Dagobah',
  },
  {
    slug: 'duel-on-bespin',
    name: 'Duel on Cloud City',
    category: 'Duel',
    date: '3 ABY',
    sort: 3.2,
    at: 'cloud-city',
    people: ['luke-skywalker', 'darth-vader', 'lando-calrissian', 'han-solo'],
    summary: 'Luke faces Darth Vader. ||Vader reveals he is Luke’s father.||',
    wiki: 'Duel_on_Bespin',
  },
  {
    slug: 'battle-of-endor',
    name: 'Battle of Endor',
    category: 'Battle',
    date: '4 ABY',
    sort: 4,
    at: 'forest-moon-of-endor',
    people: [
      'luke-skywalker',
      'han-solo',
      'leia-organa',
      'chewbacca',
      'lando-calrissian',
      'darth-vader',
      'palpatine',
    ],
    summary:
      'The Rebel fleet attacks the second Death Star while a strike team fights on the forest moon. ||The Emperor falls, and Anakin is redeemed.||',
    wiki: 'Battle_of_Endor',
  },
  {
    slug: 'battle-of-exegol',
    name: 'Battle of Exegol',
    category: 'Battle',
    date: '35 ABY',
    sort: 35,
    at: 'exegol-planet',
    people: ['rey', 'palpatine'],
    summary: 'The galaxy’s ships answer a call to Exegol. ||Rey defeats Palpatine for good.||',
    isSpoiler: true,
    wiki: 'Battle_of_Exegol',
  },
];
