# Galaxy Explorer

A browser app for building and exploring galaxies from any fictional universe, starting with Warhammer 40,000. The owner builds each galaxy by hand in 3D: star systems, sectors, nebulae, planets, places and events. Visitors explore it at three levels: galaxy, system and orbit. Potential spoilers stay hidden until a visitor chooses to see them.

**Status:** the foundation (M0) is in place: a database, an API and a 3D canvas showing a placeholder starfield. The real galaxy view arrives in M2. Progress is tracked in the [plan's status section](docs/plan/README.md#status).

## Documentation

- [Implementation plan](docs/plan/README.md): principles, scope, milestones and open items
- [Decisions](docs/plan/decisions.md): every product and technical decision
- [Agent instructions](AGENTS.md): rules for AI coding agents working in this repository, and the full command list
- [Performance log](docs/perf/README.md): the reference machine, how to measure, and baseline numbers

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

3. Open **http://localhost:5173**. For now it's a placeholder starfield:
   - drag to orbit;
   - scroll or pinch to zoom toward the pointer.

4. Press **Ctrl+C** in the terminal to stop the app. To stop the databases too:

   ```bash
   pnpm db:down
   ```

   Your dev data is kept. The test database starts empty every time.

Other pages:
- http://localhost:5173/?perf=1 adds the **performance HUD**: frame rate, frame times, draw calls and pixel ratio. When nothing moves it reads "idle", because the app draws nothing until something changes. [docs/perf/README.md](docs/perf/README.md#reading-the-hud) explains each row.
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
