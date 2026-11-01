# M0: Foundation

**Goal:** a production-shaped but empty repository. One command starts the database, the API and the web app. CI checks every PR. The 3D canvas renders only on demand from day one.

**Depends on:** nothing.
**Read first:** [architecture.md §2, §11, §13](../architecture.md), [rendering.md §1–3](../rendering.md).
**Demo at the end:**
1. `pnpm db:up && pnpm dev` opens a dark canvas with a placeholder starfield that you can orbit.
2. `?perf=1` shows the performance HUD.
3. `/api/health` reports the database as OK.
4. `/api/docs` shows Swagger UI.
5. A test PR shows green CI.

**Out of scope:** any domain tables or features.

---

### M0-T1 Git and GitHub

**What:** put the folder under version control and push it to a private GitHub repository (X4).

- `git init -b main`.
- Add these files:
  - `.gitignore`: `node_modules`, `dist`, `.turbo`, `.env*` except `.env.example`, `.data/`, `coverage`, `playwright-report`, `test-results`;
  - `.editorconfig`;
  - `.nvmrc` with the current Node.js LTS (≥ 24);
  - a short root `README.md`: what the project is, how to run it (filled in by later tasks), and a link to `docs/plan/README.md`.
- Make the first commit with the existing `docs/`, `AGENTS.md` and `CLAUDE.md`.
- `gh repo create galaxy-explorer --private --source . --push`.
- Optional, if the GitHub plan allows it on private repos: protect `main` (require PRs and green CI). This waits until M0-T7, when there are CI checks to require.

**Done when:**
- [x] The repository exists on GitHub, is private, and has `main` pushed: [vault21inc/galaxy-explorer](https://github.com/vault21inc/galaxy-explorer), 2026-11-01.
- [ ] `git status` is clean after `pnpm install` in later tasks; the ignore rules are correct.

### M0-T2 Workspace scaffold

**What:** a pnpm and Turborepo monorepo laid out as in [architecture.md §2](../architecture.md#2-packages-and-layering).

- Add `pnpm-workspace.yaml` and a `turbo.json` with the tasks `build`, `dev`, `lint`, `typecheck`, `test`, `test:integration`.
- `packages/config` holds:
  - `tsconfig.base.json` (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, ES2023 target);
  - an ESLint flat config (typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, `no-floating-promises`, plus the **layer import restrictions** from architecture §2);
  - a Prettier config.
- Stub packages, each with `package.json`, `tsconfig.json` and `src/index.ts`, all private: `@ge/domain`, `@ge/db`, `@ge/api-client`, `@ge/api` (apps/api) and `@ge/web` (apps/web).
- Root scripts:
  - `dev`, `build`, `lint`, `typecheck`, `test`, `test:integration`, `test:e2e`, `format`;
  - `check` = lint + typecheck + test.
- Use the latest stable versions of every tool at this point, and pin them: exact versions in `package.json`, `packageManager` set for pnpm.

**Done when:**
- [ ] `pnpm install && pnpm check` passes.
- [ ] An import from `@ge/db` inside `apps/web` fails lint. Prove it with a lint-rule test or a fixture file excluded from the build.

### M0-T3 Local database

**What:** Postgres 18 in Docker for development and for tests.

- `docker/compose.dev.yml`:
  - `db`: `postgres:18`, bound to `127.0.0.1:5432`, named volume `ge-pgdata`, with a healthcheck;
  - `db-test`: `postgres:18` on `127.0.0.1:5433`, data on tmpfs, `fsync=off` and `synchronous_commit=off` for speed.
- Scripts: `db:up`, `db:down`, `db:psql`.
- `.env.example` with `DATABASE_URL` and `TEST_DATABASE_URL` (architecture §11). The setup reads `.env` through a small loader (`dotenv-flow` or Node's `--env-file`).

**Done when:**
- [ ] `pnpm db:up` brings both databases up healthy.
- [ ] `select uuidv7();` works in both, which proves Postgres 18.

### M0-T4 API skeleton

**What:** a Fastify server that every later task builds on.

- `buildServer(config)` factory, so tests use `app.inject()` without a port. `src/main.ts` starts it on `GE_HOST:GE_PORT` (default `127.0.0.1:3000`) and shuts down gracefully.
- Config comes from env, validated with Zod (architecture §11); startup fails with a readable message if it's invalid.
- Plugins:
  - pino logging with authorization and cookie redaction;
  - `fastify-type-provider-zod`;
  - `@fastify/swagger` and `@fastify/swagger-ui` (`/api/docs`, `/api/openapi.json`);
  - `@fastify/compress`;
  - `@fastify/sensible`.
- An error handler that maps errors to RFC 9457 problem+json (architecture §12), including 404 for unknown routes.
- `GET /api/health` returns `{ data: { status: 'ok', db: 'ok' | 'down', version } }` and checks the database with `select 1`.

**Done when:**
- [ ] Integration test: health returns 200 with `db: 'ok'` against the test database.
- [ ] An unknown route returns 404 problem+json.
- [ ] The OpenAPI document validates (`@apidevtools/swagger-parser` in a test) and lists `/api/health`.

### M0-T5 DB package, migrations and test databases

**What:** Drizzle wiring, a migration runner, and fast isolated test databases.

- `packages/db`:
  - `drizzle.config.ts` (`casing: 'snake_case'`);
  - `src/client.ts`, which creates a `pg` Pool and a Drizzle instance from a URL;
  - `src/migrate.ts`.
- Scripts: `db:generate` (drizzle-kit), `db:migrate`, `db:reset` (drop, create, migrate; seeding is added in M1-T11).
- Test harness (`packages/db/src/testing/`):
  1. Global setup migrates a template database `ge_template` on the test server once per run.
  2. Each test file gets `create database ge_t_<random> template ge_template` and drops it afterwards.
  3. It exports `withTestDb(async (db) => …)` for db and api tests.

**Done when:**
- [ ] `pnpm db:migrate` runs, as a no-op until M1.
- [ ] A sample integration test using `withTestDb` passes, and its database is gone afterwards.

### M0-T6 Web skeleton with on-demand rendering

**What:** the app shell and the canvas set up the way rendering.md §3 requires.

- Vite + React + TypeScript.
- Tailwind and shadcn/ui, initialized with the dark tokens from ux.md §11.
- React Router with placeholder routes `/` and `/u/:universeSlug/:mapSlug`.
- TanStack Query provider; zustand installed.
- `render/stage.tsx`:
  - `<Canvas frameloop="demand">` with `dpr={[1, 1.5]}`, `<PerformanceMonitor>` and `<AdaptiveDpr>`;
  - drei `<CameraControls>`;
  - a placeholder sky of 5,000 points.
- `render/tuning.ts` with its first constants, each commented.
- Dev HUD (r3f-perf) behind `?perf=1`.
- `window.__GE_TEST__` (dev and `VITE_TEST_HOOKS=1` builds only) with `frameCount`, `renderInfo()`, `frameStats()` and `resetFrameStats()` (rendering.md §14).
- The Vite dev server proxies `/api` and `/media` to the API.

**Done when:**
- [ ] Orbiting the camera renders frames, and frames stop when it settles.
- [ ] An e2e test (M0-T7) confirms idle adds **0 frames** over 3 s.
- [ ] The HUD toggles with `?perf=1`.

### M0-T7 Tests and CI

**What:** the test runners and a GitHub Actions pipeline.

- Vitest:
  - a unit project per package;
  - an `integration` project for db and api using `TEST_DATABASE_URL` and the M0-T5 harness.
- Playwright:
  - projects `chromium` and `webkit`;
  - `webServer` starts the api and the web app with `VITE_TEST_HOOKS=1`;
  - first e2e test: the app loads, and idle renders no frames.
- `@axe-core/playwright` for accessibility checks, starting with the shell.
- `.github/workflows/ci.yml`, in order:
  1. checkout;
  2. set up pnpm with its cache, and Node from `.nvmrc`;
  3. `pnpm install --frozen-lockfile`;
  4. lint, typecheck, unit tests;
  5. integration tests (`postgres:18` service container);
  6. build;
  7. e2e on Chromium only, with software GL;
  8. upload the Playwright report as an artifact if anything failed.
- Renovate or Dependabot, weekly, grouping minor updates.

**Done when:**
- [ ] A PR shows green CI, and a deliberately failing test turns it red with the report attached.

### M0-T8 Agent docs, PR template and performance baseline

**What:** keep the agent instructions true, and start the performance log.

- Update the command list in `AGENTS.md` to match the scripts that actually exist.
- `.github/pull_request_template.md`, with:
  - the task ID;
  - acceptance criteria checked;
  - tests added;
  - performance numbers (rendering PRs);
  - docs updated;
  - decisions changed.
- `docs/perf/README.md`:
  - the reference machine: Mac model, chip, RAM, display, macOS version, browser versions (the owner fills this in);
  - how to run `pnpm perf` (created in M2-T8);
  - the baseline numbers for the empty canvas from the HUD.

**Done when:**
- [ ] The files are merged, and `AGENTS.md` commands all run.

---

## Milestone acceptance

- [ ] Every M0 task is checked off.
- [ ] Following the demo steps from a fresh clone works on the owner's Mac.
- [ ] CI is green on `main`.
