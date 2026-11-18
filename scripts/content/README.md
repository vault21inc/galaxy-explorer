# Content builders

Scripts that build whole universes the way an outside agent would: over HTTP, through the REST API and the MCP server's tools, never the database. Each change they make is a change batch, labelled `MCP: …` in the History panel, so it can be reverted like any agent's work.

`client.ts` is the connection. It reads:

| Variable | Default | |
|---|---|---|
| `GE_API_URL` | `http://127.0.0.1:3100` | the site's origin, such as `https://galaxyexplorer.perturbatory.com` |
| `GE_MCP_URL` | `${GE_API_URL}/mcp`, or `http://127.0.0.1:3110/mcp` locally | the MCP endpoint (`pnpm mcp:http` locally) |
| `GE_API_TOKEN_FILE` or `GE_API_TOKEN` | none | a **write** token for **all universes** from the account page (one for a single universe can't make a new one). Keep it in a file so it stays out of your shell history |

`build-universe.ts` holds the steps every builder shares. The universe and its map go through the REST API, because MCP has no tools for them. Then the settings (object subtypes, fact fields, event categories, group types) go through MCP tools, and everything else goes in one `batch`: a dry run, then for real. A build refuses to run if the universe's slug is taken there. New universes start private; making one public is its owner's, on the universe's settings page.

## The Milky Way

The real Galaxy: about 150 stars, nebulae, clusters, black holes and satellite galaxies at their catalogue positions, the spiral arms as measured, the Solar System, and dated events with the people involved. It's live on production as `/u/milky-way`.

```bash
pnpm --filter @ge/content milky-way plot     # out/plot.svg: a top-down check picture
pnpm --filter @ge/content milky-way fit      # refit the generated background to the measured arms
GE_API_URL=https://galaxyexplorer.perturbatory.com GE_API_TOKEN_FILE=~/.config/galaxy-explorer/prod-token \
  pnpm --filter @ge/content milky-way build  # make the universe (private), its settings and content
```

| File | Holds |
|---|---|
| `geo.ts` | the coordinate chain: RA/Dec → galactic l, b → galactocentric → the map's frame |
| `catalog.ts` | the stars, regions and the arm fits (Reid et al. 2019, ApJ 885, 131, table 2) |
| `solar.ts` | the Solar System: real AU and mean longitudes at J2000, moons, belts, stations |
| `events.ts` | events (Common Era dates) and people |
| `plan.ts` | the universe, the map's background, the settings, and the batch's operations |
| `check.ts` | the background fit and the check plot |

### Choices to know

- **Galactic north is −Y.** The app's generated spiral (`packages/domain/src/galaxy/density.ts`) winds the mirror way of the real arms when seen from +Y. A proper rotation (not a mirror) that puts north at −Y keeps the real geometry and matches it. The top view then looks up from the south galactic pole. If GalaxySettings ever gains a winding direction, flip `makeFrame` and the Fermi bubbles' signs.
- **The bar's near end is on +X**, where the generated bar and its first arm start, 28° from the Sun–centre line (measured: 27°; `fit` prefers 28°).
- **The Sun is 26,670 ly from Sgr A\*** (GRAVITY 2019) **and 68 ly above the plane.**
- **Spiral arms are nebulae of shape `rift`**, drawn only along the measured stretch.
- **Moons are drawn closer than they are.** The system view spaces moons by their planet's drawn size, so real distances (the Moon at 60 radii) would scatter them across other orbits. `moonDrawRadii` compresses them logarithmically. The real orbit is a fact.
- **Compact systems** (Alpha Centauri, TRAPPIST-1 and others) are drawn wider than they are, and their descriptions say so.
- Every Wikipedia link was checked against Wikipedia's API when it was added.

## Star Wars

A fan reference map of the galaxy far, far away: about 30 of its best-known worlds with their stars, planets, moons and Cloud City; the Corellian Run; the Arkanis and Anoat sectors; the Unknown Regions; and the saga's battles and duels (dated BBY/ABY) with the people in them. Film spoilers are marked, so readers see them only when they ask. It's live on production as `/u/star-wars`.

```bash
GE_API_URL=https://galaxyexplorer.perturbatory.com GE_API_TOKEN_FILE=~/.config/galaxy-explorer/prod-token \
  pnpm --filter @ge/content star-wars build
```

| File | Holds |
|---|---|
| `catalog.ts` | the worlds (grid square, region, sector, stars, bodies), the route, people and events |
| `plan.ts` | the universe, the map's background, the settings, and the batch's operations |

- **Positions come from the standard galaxy grid,** letters west to east along +X, numbers north to south along +Z, 6,000 ly a square, with the centre where L/M meets 9/10, beside Coruscant (L-9). The sources give nothing finer, so worlds sharing a square are spread inside it by a hash of their slug, the same on every build. Exegol has no square: it's placed deep in the west.
- **Regions are facts, not outlines.** Group outlines are convex hulls, and a hull around the Outer Rim covers the whole disc. Rings would fix that ([ring-shaped groups](../../docs/plan/later/ring-shaped-groups.md)). The two sectors with more than one world on the map are groups.
- **Summaries are this map's own words**, and links go to Wookieepedia (each checked when added). The universe's description says it's a fan map, not affiliated with Lucasfilm.
