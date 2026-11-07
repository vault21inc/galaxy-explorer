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
- Docker, from M0-T3 onward

```bash
pnpm install
```

```bash
pnpm check
```

`pnpm check` runs the format check, lint, typecheck and unit tests across the workspace. The database, API and web app are added in M0-T3 to M0-T6.
