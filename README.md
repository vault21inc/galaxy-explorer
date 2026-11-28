# Galaxy Explorer

A browser app for building and exploring galaxies from any fictional universe. Its owners build each galaxy by hand in 3D: star systems, sectors, nebulae, planets, places, people and events. Readers explore it at three levels, the galaxy view, the system view and the orbit view, on a computer or a phone. Potential spoilers stay hidden until a reader chooses to see them.

It's live at **https://galaxyexplorer.perturbatory.com**, where signed-out visitors start in the real Milky Way's Solar System. Accounts are by invitation.

**Status (28 November 2026):** the proof of concept (M0–M6) and the content tools and LLM access (M7) are complete. M8, going public, is done: nightly backups to a Spaces bucket (M8-T7) went live in `v0.20.0`, and their first restore drill against the real bucket is the last step. The live site runs `v0.20.0`. `v0.12.0` brought a usability pass for phones and narrow windows (L3-T1 to L3-T5); `v0.13.0` followed it the next day: on a phone a tap shows a card, not half a screen of details (L3-T8), and when the details are opened the view centres itself in the space above them (L3-T9, D-58); `v0.13.1` makes capture mode on a phone say what to tap and lead through its steps, and `v0.14.0` makes a clip with one tap on Record: a slow turn around the view. `v0.15.0` suggests usernames as an owner shares a universe or hands it over (D-59), and `v0.16.0` draws moons in the plane of their planet's tilted equator, so Saturn's circle in the plane of its rings (D-60). `v0.17.0` gives the Route tool a Finish button and lets the editor add links and “Related to” entries in the details panel. `v0.18.0` flies to a system among its nearest neighbours and to a group by its members, from F, Enter, Search and the List (D-61), and the Milky Way gains a “Solar neighbourhood” group. `v0.19.0` gives search engines a page for every public universe, map and system, with `robots.txt` and a sitemap (D-62). The owner's checks on an iPhone and the phone performance measurements remain ([the phone plan](docs/plan/later/phone-usability.md)). Every change is listed, task by task, in the [plan's status section](docs/plan/README.md#status).

## What you can do today

**Reading a universe**

- **Explore a galaxy:** a procedural spiral or elliptical galaxy with its systems, black holes, stations and markers. Zoom into a system for its stars, planets, belts and stations; zoom into a planet or moon for its globe, with clouds, atmosphere, rings, city lights, and pins for its places and events.
- **Regions, groups and routes:** nebulae and storms as clouds, rifts along a curve; nested groups such as Segmentum › Sector › Sub-sector drawn as outlines or as rings around the galaxy's centre, shown or hidden by layer; routes such as warp lanes drawn through systems in order.
- **Read about anything:** select an object, group, route, place, event or person for its details, pictures (animated GIFs play), facts, links, and the events it took part in. The Events list shows a map's events in date order, each a way to where it happened.
- **Spoilers** stay blacked out until revealed, one at a time or all at once.
- **Find anything:** ⌘/Ctrl + K searches a universe by name and runs commands, such as "Copy link to this view". A link carries the camera, so it opens exactly what you saw.
- **Several eras:** a universe has maps, one per period, and each object can switch to its copies on the others.
- **Learn it:** the Help menu has every key and gesture, and guided tours for readers and editors.
- **Record a clip:** capture mode frames the map for Reels, Stories or feed posts, plays a camera move between two points, and records it to an MP4 at Instagram's exact size.
- **On a phone:** a slim top bar (where you are, Search, More), panels as sheets, touch gestures (one finger turns, two slide, pinch zooms, tap selects, double-tap enters), and capture mode by buttons, where one tap on Record makes a clip of a slow turn around the view. A tap shows the object's card along the bottom; pull it up to read its details, and the map re-centres above them. Editing needs a mouse or trackpad, on any size of screen.

**Building one** (edit mode, E or the Edit button, for a universe's owner and editors)

- Add, move, duplicate and delete objects; group a selection (⌘/Ctrl + G); draw routes; reshape regions with handles; place pins on a globe.
- Edit details with rich text and images; set each planet's look from ten presets or an uploaded map.
- Undo anything, or revert it later from the History panel.
- **Universe settings:** the universe's details; its group types, event categories, object subtypes (Hive World, with a default look) and custom facts (Population); sharing; and import and export.
- **Fill from wiki:** fill an entry's facts and description from a configured wiki page, cited.
- **Import and export** a universe or map as a zip, or many objects at once from a CSV; **clone a map** for another era.
- **Agents:** an MCP server lets LLM agents such as Claude Code build content through the same API, locally (`pnpm mcp`) or remotely with an API token (`pnpm mcp:http`). Every change they make can be reverted.

**Accounts and sharing** (on a server with accounts)

- Accounts come from invite links, with optional two-factor codes. Each universe has an owner and is private, link-only or public; owners add editors and viewers by username. Admins manage accounts and universes from `/admin`. API tokens act for their account, narrowed to read or write and to one universe.
- Links to public pages get a card with a picture in chat apps, without spoilers.

Running locally, there's no sign-in and you can edit everything. Try it with the demo data: after setup, `pnpm db:reset` loads the **Example Universe** (at `/u/example-universe/main`), and `pnpm db:seed stress` adds a 5,000-object map for performance testing (`/u/stress-test/main`).

## Documentation

- [Implementation plan](docs/plan/README.md): principles, scope, milestones, status and the plans to come back to
- [Decisions](docs/plan/decisions.md): every product and technical decision
- [Agent instructions](AGENTS.md): rules for AI coding agents working in this repository, and the full command list
- [Performance log](docs/perf/README.md): the reference machine, how to measure, and the reports
- [Production](docs/ops/production.md), [the droplet](docs/ops/droplet.md) and [releasing](docs/ops/deploy.md): the live site, how it's run, and how a `v*` tag deploys it
- [MCP server](apps/mcp/README.md): adding it to Claude Code or Claude Desktop
- [Capture shots](docs/capture/milky-way.md): camera links for clips of the Milky Way

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

| Do | Mouse or trackpad | Touch | Keyboard |
|---|---|---|---|
| Orbit | drag (Option/Alt + drag in edit mode) | drag with one finger | — |
| Pan | right-drag, or ⌘/Ctrl + drag | drag with two fingers | arrow keys |
| Zoom toward the pointer | scroll, or pinch | pinch | `+` and `−` |
| Select | click; Shift or ⌘/Ctrl + click adds | tap | Esc clears; with nothing selected, Esc goes up one view |
| Enter a system or planet's view | double-click it, or keep zooming in on it until the ring fills | double-tap, or pinch in | Enter |
| Leave a view | keep zooming out until the ring fills, or click a breadcrumb | pinch out, or the name at the top | Esc, or Back |
| Fly to the selection | double-click (anything that opens no view) | double-tap | F |
| Reset the camera | — | — | H |
| Labels: on hover (or selected only), group names, all | the Labels buttons in Layers | the same, in More | L cycles; hold Space for all |
| Show or hide spoilers | the Spoilers button | the Spoilers switch, in More | Shift + S |
| Search, and commands | the Search button | Search | ⌘/Ctrl + K |
| Quality, and how many galaxy stars to draw and how bright | the settings button (top right) | Display, in More | — |
| Every shortcut and gesture, and the tours | the Help button | Help and tours, in More | ? |
| Capture mode, for clips | a command in Search | Record a clip, in More | A, B, P, R, Esc |
| Edit mode | the Edit button | — (needs a mouse or trackpad) | E |

Below 1,280 px wide the top bar's buttons show their icons alone; below 768 px wide, or 500 px high, it becomes the phone's slim bar, with everything else in its More sheet.

In edit mode:
- dragging empty space draws a selection box, with Shift adding to the selection;
- dragging an object moves it, with Shift snapping to the grid;
- right-click opens the object's menu, where Create route runs a route through the selection;
- the Route tool takes clicks on objects in order: ⌫ removes the last, Enter finishes, Esc cancels;
- N adds an object;
- ⌘/Ctrl + D duplicates, ⌘/Ctrl + G groups, and Delete deletes, after a confirmation that counts what goes with it;
- ⌘/Ctrl + Z undoes and ⌘/Ctrl + Shift + Z redoes.

The List button (always open in edit mode) shows everything in the view as a tree of layers, groups, routes, objects and people, usable with the keyboard alone. Press `?` for every shortcut that works today.

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
| `pnpm test:e2e` | browser tests in desktop Chromium and WebKit, and in an emulated Android phone and iPhone (`*.phone.spec.ts`), against a production build | `pnpm db:up`, Playwright's browsers |

The e2e tests start their own API and web servers on other ports, one without accounts and one with, so they can run while `pnpm dev` is running. `-- --project=chromium` runs one browser (the projects are `chromium`, `webkit`, `phone-chromium` and `phone-webkit`). GitHub Actions runs all three commands on every push to `main`, the browser tests in Chromium and the emulated Android phone.

Database commands:
- `pnpm db:migrate` applies new migrations;
- `pnpm db:reset` wipes the dev database, migrates it again and loads the demo universe;
- `pnpm db:seed demo` loads (or refreshes) the small "Example Universe", and `pnpm db:seed stress` adds a 5,000-object map for performance testing;
- `pnpm db:psql` opens a SQL prompt on the dev database.

After pulling new code, run `pnpm db:migrate` before `pnpm dev`: new migrations aren't applied automatically.

Other commands:
- `pnpm perf` measures frame times, draw calls and memory on the stress map in visible Chrome and WebKit windows, and fails on a missed budget. `pnpm perf --edit` does the same in edit mode. Leave the mouse alone while it runs: a pointer over the windows counts as interaction. [docs/perf/README.md](docs/perf/README.md) explains the report.
- `pnpm api:generate` regenerates the typed API client after a route or schema change, and `pnpm api:check` fails if it's out of date (CI runs it).
- `pnpm mcp` and `pnpm mcp:http` run the MCP server for LLM agents ([apps/mcp/README.md](apps/mcp/README.md)).
- `pnpm admin:create-user`, `admin:invite` and `admin:reset-link` make accounts and links on a server with accounts.

Pushing to `main` doesn't deploy. A release is a `v*` tag on a commit whose CI has passed ([docs/ops/deploy.md](docs/ops/deploy.md)).

[AGENTS.md](AGENTS.md#commands) lists every command.

### Ports

| Port | What |
|---|---|
| 5173 | web app (`pnpm dev`) |
| 3100 | API (`pnpm dev`) |
| 5442 | dev database |
| 5443 | test database |
| 3110 | remote MCP server (`pnpm mcp:http`) |
| 4173, 3101 | web app and API started by `pnpm test:e2e` |
| 4174, 3108, 3109 | the same with accounts, and its remote MCP, started by `pnpm test:e2e` |
| 4174, 3103 | web app and API started by `pnpm perf` (so it can't run beside the e2e tests) |

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
- **The e2e tests can't start their servers:** the test database isn't running (`pnpm db:up`), or something holds one of their ports (4173, 4174, 3101, 3108, 3109), often a `pnpm perf` run.
