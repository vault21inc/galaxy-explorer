# Galaxy Explorer

A browser app for building and exploring galaxies from any fictional universe, starting with Warhammer 40,000. The owner builds each galaxy by hand in 3D: star systems, sectors, nebulae, planets, places and events. Visitors explore it at three levels: galaxy, system and orbit. Potential spoilers stay hidden until a visitor chooses to see them.

**Status (10 November 2026):** the galaxy view can be explored and edited. You can place and edit systems, planets, stations, black holes and regions, organize them into nested groups shown as outlines, and draw routes between them. Milestones M0–M3 are done. M4 (groups, regions and routes) is done except the owner's sector-tracing trial. M5 has begun: zooming into a system marked explorable (or double-clicking it, or pressing Enter) opens its own view, and zooming out, Back, Esc and the breadcrumbs return to the galaxy at the same camera position. Inside, stars glow in their temperature's color and light their planets, with orbit rings and asteroid belts. In edit mode you can add and arrange stars, planets and belts inside a system with the same tools as the galaxy, and set a planet to orbit one star of a binary. The orbit view comes in M6. Progress is tracked task by task in the [plan's status section](docs/plan/README.md#status).

## What you can do today

- **Explore a galaxy:** a procedural spiral or elliptical galaxy with your objects on it. Each kind of body has its own look: systems as stars ringed by their planets (binaries and triples in each star's color), black holes as lensed accretion discs, stations and markers as icons.
- **Regions:** nebulae and anomalies as round or flat clouds, storms seen from above (the Eye of Terror, with a gap in its rim for the Cadian Gate, from a generated or uploaded picture), and rifts along a curve (the Great Rift).
- **Groups:** nested groups such as Segmentum › Sector › Sub-sector, drawn as colored outlines with their names, shown or hidden by layer.
- **Routes:** lines through systems in order, such as a trade lane or a warp route, solid or dashed, with their names on the line.
- **Read about anything:** select an object, group or route for its details, images, facts and links. Potential spoilers stay blacked out until you reveal them, one at a time or all at once.
- **Build it, in edit mode (E):**
  - add, move, duplicate and delete objects;
  - edit their details, with rich text and images;
  - group a selection (⌘/Ctrl + G);
  - draw routes with the Route tool, or through a selection in the order you picked it;
  - reshape regions with handles on the map;
  - change the galaxy's look, or trace over an uploaded map image;
  - undo anything, or revert it later from the History panel.
- **Universe settings** (from the universe menu): the universe's details, and its group types, event categories, object subtypes and custom fields.

Try it with the demo data: after setup, `pnpm db:reset` loads the **Example Universe** (at `/u/example-universe/main`) and `pnpm db:seed stress` adds a 5,000-object map for performance testing (`/u/stress-test/main`).

## Documentation

- [Implementation plan](docs/plan/README.md): principles, scope, milestones and open items
- [Decisions](docs/plan/decisions.md): every product and technical decision
- [Agent instructions](AGENTS.md): rules for AI coding agents working in this repository, and the full command list
- [Performance log](docs/perf/README.md): the reference machine, how to measure, and baseline numbers
- [Private preview](docs/ops/preview.md): putting the app on one password-protected server for invited testers, before M8's public site

## Getting started

### What you need

- **Node.js 26**, the version in `.nvmrc`. With nvm, run `nvm install` in the repository.
- **Docker Desktop**, for the two Postgres databases.
- **pnpm**, which comes with Node through Corepack. Turn Corepack on once, and pnpm will use the version pinned in `package.json`:

```bash
corepack enable
```

### First-time setup

Run these once, in the repository folder.

1. Install the dependencies:

   ```bash
   pnpm install
   ```

2. Create your local settings file. The defaults work as they are; `.env` is git-ignored:

   ```bash
   cp .env.example .env
   ```

3. Only if you'll run the browser tests, download Playwright's browsers (about 250 MB):

   ```bash
   pnpm --filter @ge/web exec playwright install chromium webkit
   ```

4. Only if you'll commit, set the repository's commit email:

   ```bash
   git config user.email 24880568+vault21inc@users.noreply.github.com
   ```

### Running the app

1. Start Docker Desktop, then start the databases. They keep running until you stop them or Docker quits:

   ```bash
   pnpm db:up
   ```

2. Start the API and the web app. Both reload when you change their code:

   ```bash
   pnpm dev
   ```

3. Open **http://localhost:5173** and choose a universe. If the list is empty, load the demo with `pnpm db:reset` (it wipes the dev database first) or start your own from the home page.

4. Press **Ctrl+C** in the terminal to stop the app. To stop the databases too:

   ```bash
   pnpm db:down
   ```

   Your dev data is kept. The test database starts empty every time.

### Controls

| Do | Mouse or trackpad | Keyboard |
|---|---|---|
| Orbit | drag (Option/Alt + drag in edit mode) | — |
| Pan | right-drag, or ⌘/Ctrl + drag | arrow keys |
| Zoom toward the pointer | scroll, or pinch | `+` and `−` |
| Select | click; Shift or ⌘/Ctrl + click adds | Esc clears; with nothing selected, Esc goes up one view |
| Enter a system or planet's view | double-click it, or keep zooming in on it until the ring fills | Enter |
| Leave a view | keep zooming out until the ring fills, or click a breadcrumb | Esc, or Back |
| Fly to the selection | double-click (anything that opens no view) | F |
| Reset the camera | — | H |
| Labels: hover only, group names, all | — | L cycles; hold Space for all |
| Show or hide spoilers | the Spoilers button | Shift + S |
| Quality, and how many galaxy stars to draw and how bright | the settings button (top right) | — |
| Every shortcut and gesture | the Help button | ? |
| Edit mode | the Edit button | E |

In edit mode:
- dragging empty space draws a selection box, with Shift adding to the selection;
- dragging an object moves it, with Shift snapping to the grid;
- right-click opens the object's menu, where Create route runs a route through the selection;
- the Route tool takes clicks on objects in order: ⌫ removes the last, Enter finishes, Esc cancels;
- N adds an object;
- ⌘/Ctrl + D duplicates, ⌘/Ctrl + G groups, and Delete deletes, after a confirmation that counts what goes with it;
- ⌘/Ctrl + Z undoes and ⌘/Ctrl + Shift + Z redoes.

The List button (always open in edit mode) shows everything in the view as a tree of layers, groups, routes and objects, usable with the keyboard alone. Press `?` for every shortcut that works today; [ux.md](docs/plan/ux.md#4-keyboard-shortcuts) also lists what's still to come.

### Other pages

- **Universe settings:** `/u/<universe>/settings`, also in the universe menu.
- Add `?perf=1` to any page for the **performance HUD**: frame rate, frame times, draw calls and pixel ratio. When nothing moves it reads "idle", because the app draws nothing until something changes. [docs/perf/README.md](docs/perf/README.md#reading-the-hud) explains each row.
- http://127.0.0.1:3100/api/health reports whether the API can reach its database.
- http://127.0.0.1:3100/api/docs is the interactive API documentation.

### Checking your work

| Command | Runs | Needs |
|---|---|---|
| `pnpm check` | format check, lint, typecheck and unit tests | nothing |
| `pnpm test:integration` | database and API tests; each test gets its own throwaway database | `pnpm db:up` |
| `pnpm test:e2e` | browser tests in Chromium and WebKit, against a production build | `pnpm db:up`, Playwright's browsers |

The e2e tests start their own API and web server on different ports, so they can run while `pnpm dev` is running. GitHub Actions runs all three on every push to `main`.

Database commands:
- `pnpm db:migrate` applies new migrations;
- `pnpm db:reset` wipes the dev database, migrates it again and loads the demo universe;
- `pnpm db:seed demo` loads (or refreshes) the small "Example Universe", and `pnpm db:seed stress` adds a 5,000-object map for performance testing;
- `pnpm db:psql` opens a SQL prompt on the dev database.

After pulling new code, run `pnpm db:migrate` before `pnpm dev`: new migrations aren't applied automatically.

Other commands:
- `pnpm perf` measures frame times, draw calls and memory on the stress map in visible Chrome and WebKit windows, and fails on a missed budget. `pnpm perf --edit` does the same in edit mode. Leave the mouse alone while it runs: a pointer over the windows counts as interaction. [docs/perf/README.md](docs/perf/README.md) explains the report.
- `pnpm api:generate` regenerates the typed API client after a route or schema change, and `pnpm api:check` fails if it's out of date (CI runs it).

[AGENTS.md](AGENTS.md#commands) lists every command.

### Ports

| Port | What |
|---|---|
| 5173 | web app (`pnpm dev`) |
| 3100 | API (`pnpm dev`) |
| 5442 | dev database |
| 5443 | test database |
| 4173, 3101 | web app and API started by `pnpm test:e2e` |

Everything listens on this machine only (127.0.0.1 or localhost), not on your network.

### Troubleshooting

- **`pnpm: command not found`:** run `corepack enable`.
- **`pnpm db:up` fails:** Docker Desktop isn't running, or another program holds port 5442 or 5443.
- **`pnpm dev` says a port is in use:** something else is on 5173 or 3100, often an earlier `pnpm dev` still running. This shows what's there:

  ```bash
  lsof -nP -iTCP:5173 -iTCP:3100 -sTCP:LISTEN
  ```

- **The page loads but `/api/health` says `"db": "down"`:** the databases aren't running. Run `pnpm db:up`.
- **`DATABASE_URL is not set` or `TEST_DATABASE_URL is not set`:** create `.env` from `.env.example`.
- **The databases stopped by themselves:** quitting or restarting Docker Desktop stops them. Run `pnpm db:up` again; your data is kept.
- **Errors about a missing column or table after pulling:** run `pnpm db:migrate`.
- **The e2e tests can't start their server:** the test database isn't running (`pnpm db:up`), or something holds port 4173 or 3101.
