# Galaxy Explorer

A browser app for building and exploring galaxies from any fictional universe, starting with Warhammer 40,000. The owner builds each galaxy by hand in 3D: star systems, sectors, nebulae, planets, places and events. Visitors explore it at three levels: galaxy, system and orbit. Potential spoilers stay hidden until a visitor chooses to see them.

**Status:** planning is complete; the foundation milestone (M0) is in progress.

## Documentation

- [Implementation plan](docs/plan/README.md): principles, scope, milestones and open items
- [Decisions](docs/plan/decisions.md): every product and technical decision
- [Agent instructions](AGENTS.md): rules for AI coding agents working in this repository

## Getting started

Prerequisites:
- Node.js, at the version in `.nvmrc` (26)
- pnpm, through Corepack: `corepack enable` once; the version comes from `package.json`
- Docker

```bash
pnpm install
```

```bash
cp .env.example .env
```

```bash
pnpm db:up
```

```bash
pnpm dev
```

- `pnpm db:up` starts the dev database on 127.0.0.1:5442 and the test database on 127.0.0.1:5443. `pnpm db:down` stops them; dev data is kept, test data isn't.
- `pnpm dev` starts the API on http://127.0.0.1:3100 and restarts it on changes:
  - http://127.0.0.1:3100/api/health reports whether it can reach the database;
  - http://127.0.0.1:3100/api/docs is the interactive API documentation.
- `pnpm check` runs the format check, lint, typecheck and unit tests across the workspace.
- `pnpm test:integration` runs the tests that need the test database.
- The web app arrives in M0-T6.
