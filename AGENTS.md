# Instructions for coding agents

Galaxy Explorer is a universe-agnostic 3D galaxy builder. The owner builds galaxies by hand in the browser, in three views (galaxy, system, orbit), and the public explores them. The plan lives in `docs/plan/`.

## Before you start a task

1. Read `docs/plan/README.md`, then your task in `docs/plan/milestones/Mx-*.md`, then the sections listed under "Read first".
2. Check `docs/plan/decisions.md`. Don't silently contradict a decision. If the plan is wrong or ambiguous, stop and ask; or, if the fix is clear, change the plan in the same commit and say so in the commit message.
3. Work directly on `main`, one task at a time, with no task branches or PRs (D-22). A task is one commit, or a few if that reads better.
   - Commit messages start with the task ID, for example `M2-T4: resolve bindings per platform`.
   - The message body says what changed and how you verified it. Anything the plan asks to "report" (performance numbers, manual checks, new dependencies) goes there too.
   - Run `pnpm check` and the relevant integration and e2e suites before every commit: `main` must always pass. Then push, and check that CI passes.
   - Pushing to `main` doesn't deploy. A release to the production site is a `v*` tag on a commit whose CI has passed, or a deploy by hand ([docs/ops/deploy.md](docs/ops/deploy.md), D-46).
   - Use the commit message checklist below.
4. Commits use the email `24880568+vault21inc@users.noreply.github.com`, set in the repository's local git config. In a fresh clone, run `git config user.email 24880568+vault21inc@users.noreply.github.com` before your first commit.

## Commands

Run from the repository root. Each one listed here exists and runs; the last table lists the commands later tasks add.

| Command | Does |
|---|---|
| `pnpm db:up` / `pnpm db:down` | start or stop the dev (127.0.0.1:5442) and test (127.0.0.1:5443) Postgres containers |
| `pnpm db:psql` | open `psql` on the dev database |
| `pnpm dev` | the API (http://127.0.0.1:3100) and the web app (http://localhost:5173) in watch mode |
| `pnpm check` | format check, lint, typecheck and unit tests; **must pass before you commit** |
| `pnpm format` / `pnpm format:check` | format code with Prettier / only check it (Markdown is left alone) |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | the parts of `pnpm check`, one at a time |
| `pnpm test:integration` | API and DB tests (`*.int.test.ts`) against the test Postgres; unit tests are `*.test.ts` |
| `pnpm test:e2e` | Playwright end-to-end tests in Chromium and WebKit (`-- --project=chromium` for one browser). They build the web app with the test hooks, serve it with the production security headers (any CSP violation fails the test) and start their own API on port 3101, without rate limits, using the `ge_e2e` database on the test server, and a second API with accounts on port 3108 (`ge_e2e_auth`, served at http://localhost:4174) for `accounts.spec.ts`. Specs named `*.phone.spec.ts` run only in the phone projects, `phone-chromium` (a Pixel 7) and `phone-webkit` (an iPhone 14), and every other spec only in the desktop ones (`-- --project=phone-webkit` for one). Install the browsers once with `pnpm --filter @ge/web exec playwright install chromium webkit`. CI runs `chromium` and `phone-chromium` with software rendering and leaves out `leaks.spec.ts`, which `pnpm perf` covers |
| `pnpm build` | production build of the web app into `apps/web/dist` |
| `pnpm db:migrate` / `pnpm db:reset` | apply migrations (and fill any missing search indexes, D-37) / drop, create and migrate the dev database, then seed the demo universe (local databases only) |
| `pnpm db:seed demo` / `pnpm db:seed stress` | seed the demo universe / the 5,000-object performance map (`--objects`, `--groups`, `--routes`, `--seed`; `--closed` makes no system open a view, as `pnpm perf` seeds it). Idempotent: re-running changes nothing |
| `pnpm db:generate` | generate a migration from `packages/db/src/schema` with drizzle-kit; add `--custom` for an empty one to write by hand |
| `pnpm api:generate` | regenerate `packages/api-client` (`openapi.json` and `src/generated/schema.ts`) from the API's routes; **run it after changing any route or API schema, and commit the result** |
| `pnpm api:check` | regenerate the client and fail if it differs from what's committed (CI runs this) |
| `pnpm perf` | the scripted performance run on the owner's Mac: builds the app, seeds the stress map into its own `ge_perf` database, drives Chrome and WebKit visibly through the galaxy view and then (view mode) a busy system, its transitions, the orbit view of one of its planets (with 16 pins), the look editor's slider preview, 20 galaxy ↔ system and 20 galaxy → system → orbit round trips (the GPU memory leak checks, which CI doesn't run), times a 5,000-object CSV import through the API (M7-T4), writes `docs/perf/<date>-M2.md` and fails on a missed budget ([docs/perf/README.md](docs/perf/README.md)). `PERF_LABEL=M5` names a later milestone's report. `pnpm perf --edit` runs it in edit mode with the underlay shown and 100 objects selected (`<date>-M3-edit.md`) |

Added by later tasks; update this file when you add one:

| Command | Does | Added in |
|---|---|---|
| `pnpm mcp` | the MCP server over stdio, for LLM agents: tools generated from the registries, calling the API at `GE_API_URL` (default http://127.0.0.1:3100, so run `pnpm dev` too). How to add it to Claude Code and Claude Desktop: [apps/mcp/README.md](apps/mcp/README.md) | M7-T7 |
| `pnpm mcp:http` | the same MCP server over Streamable HTTP, at http://127.0.0.1:3110/mcp (`GE_MCP_HOST`, `GE_MCP_PORT`), for agents elsewhere. Each request needs an API token from the account page, unless the API has no accounts and it listens on a loopback address ([apps/mcp/README.md](apps/mcp/README.md)) | M8-T2 |
| `pnpm admin:create-user [--admin]` | make an account on the command line: asks for a username and password, and whether to set up two-factor codes (yes by default for an admin, D-47); with codes, it prints the QR code and secret and saves the account only after one valid code. The first admin is made this way. Needs `GE_PUBLIC_URL` and `GE_SESSION_SECRET` | M8-T1 |
| `pnpm admin:invite [--admin]` | print an invite link (7 days, single use) to `/link/{token}`. Needs `GE_PUBLIC_URL` | M8-T1 |
| `pnpm admin:reset-link <username>` | print a reset link (24 hours, single use) for a new password, with new two-factor codes or none. Needs `GE_PUBLIC_URL` | M8-T1 |
| `pnpm headers:caddy` | write `ops/caddy/security-headers.caddy` from `packages/domain/src/security/headers.ts`, and `ops/caddy/link-previews.caddy` from `packages/domain/src/link-preview.ts` (M8-T9); run it after changing either and commit the result (a unit test fails while one is stale) | M8-T3 |
| `pnpm test:stack` | the golden path and the stack's own checks (`e2e/stack.spec.ts`) against the production stack, in Chromium and WebKit: `docker/compose.prod.yml` started apart with `VITE_TEST_HOOKS=1`, and `GE_STACK_ENV_FILE` naming its env file ([docs/ops/production.md](docs/ops/production.md)) | M8-T4 |

## Non-negotiables

### DRY through registries

- Entity kinds, object types, view levels, relation types, settings resources, renderers, input bindings and panel sections each have **one** registry (architecture.md §3).
- Routes, forms, query hooks, MCP tools, import/export, clone rules and generic tests are **derived** from the registries. Never hand-write per-kind CRUD, forms or tests. If you're about to write the same handler for a second kind, extend the registry instead.
- Zod schemas in `packages/domain` are the single source of truth for shapes. Infer types (`z.infer`, Drizzle, the generated client) and never re-declare them.

### Layering

- `packages/domain` is pure: no database, React or three.js.
- `packages/db` → domain. `apps/api` → db + domain. `apps/web` → domain + api-client, **never db or api**. `apps/mcp` → domain + api-client.

### Database

- Change the schema only with a new migration. Never edit an applied migration.
- Every content table has the audit trigger, and every write runs inside `withBatch()`. A write outside a batch fails, by design.
- Relationships are columns with foreign keys; same-map references are composite foreign keys. jsonb holds only Zod-validated presentation and settings documents (data-model.md §2, §4).
- Foreign keys are written in SQL at the end of the migration, not in the Drizzle schema, because they must be deferrable and Drizzle can't say so ([packages/db/migrations/README.md](packages/db/migrations/README.md)). Check lists and format checks are generated from `@ge/domain` registries and patterns, never typed by hand.
- New map-scoped tables go into `AUDITED_TABLES` and `CLONE_SPEC`. The consistency tests enforce this.

### Rendering performance

Details are in rendering.md §2.

- Use `frameloop="demand"` and call `invalidate()` on change. Nothing renders while nothing moves.
- DPR is capped at 1.5 by default. No full-screen post-processing. No per-frame noise shaders: bake textures instead.
- Never put per-frame data in React state. Never allocate inside `useFrame`.
- Instance or merge anything repeated more than about 20 times. Labels go through the label layer only.
- Dispose of what you create with `new`.
- Rendering commits report draw calls and median and p95 frame times, before and after.

### Security

- HTML in rich text is sanitized on the server with `RICH_TEXT_POLICY`. Markdown is rendered without raw HTML.
- Services check universe and map scope. Never trust ids from the client.
- Every route that touches a universe goes through `universeAccess`, in the access guard (`apps/api/src/http/access-guard.ts`): the universe comes from the rows the path names, and a universe the requester can't read is a 404, never a 403. A route about no single universe declares it with `routeAccess()` (`x-ge-access`), and the admin routes with `{ scope: 'admin' }`, which is a 404 to everyone but a signed-in admin; a new kind of path parameter is taught to `http/route-universe.ts` first. An account or sharing route declares `session: true`: an API token gets a 403 there, as on every `/auth/` route but `GET /auth/token` (M8-T2). A token's narrowing (`read`, one universe) lives in `universeAccess`, so never check a token's scope anywhere else. A child row (a link, a relation) is found through its parent in the path, never by its own id alone. The access contract suite fails on any route it can't classify.
- Every route has a rate limit (M8-T3, D-43). A route that takes uploads, checks a password or a link, or tells whether a username exists declares a stricter tier with `rateLimit()` (`x-ge-rate-limit`); the tier test fails on a route its rules don't expect.
- The Content-Security-Policy allows no inline scripts and no eval. The headers live in `packages/domain/src/security/headers.ts` (then run `pnpm headers:caddy`). e2e specs import `test` from `./test.ts`, which fails a test on any CSP violation; a lint rule says so.
- Who may reach a universe (its owner, visibility, share key and members) isn't content: it's changed only by the owner's sharing routes, which need a session and log to `access_events`, and History never sees or reverts it (D-41).
- No secrets in git. Configuration comes from env and is validated at boot.
- With `GE_AUTH_MODE=none`, the API binds to 127.0.0.1 only.

### Code style

- TypeScript strict, with no `any` and no non-null `!` outside tests.
- Put units in names: `distanceLy`, `radiusSu`, `sizePx`, `latDeg`, `durationMs`.
- **Comment the why.** The owner is an experienced developer who is new to three.js. Explain every non-obvious piece of 3D math, shader code and camera logic in plain words, and link the relevant section of `docs/plan/rendering.md`.
- Rendering tunables go in `apps/web/src/render/tuning.ts`, with units and comments, not as inline magic numbers.
- Prefer small files (under about 300 lines), one component per file, and clear names over cleverness.
- Add a dependency only when it removes real work, and mention it in the commit message. Pin it exactly. A tool used by several packages gets its version once, in the `catalog:` section of `pnpm-workspace.yaml`.

### Testing

- Unit-test pure logic. Integration-test the API and DB against real Postgres; don't mock the database. `withTestDb` from `@ge/db/testing` gives each test a fresh, migrated database. Writes need `withBatch`; tests about constraints rather than history can pass `{ ambientBatch: true }` instead. Write Playwright e2e tests for user flows.
- Verify 3D behavior through `window.__GE_TEST__` (rendering.md §14), not pixel guesses.
- A new entity kind or settings resource must pass the generic contract suite **without new per-kind test code**.

### Words

- Say "event", never "scene", in UI text, API names and docs. three.js's `Scene` class in code is fine.
- The three levels are the galaxy view, system view and orbit view.

## Commit message checklist

With no pull requests (D-22), the commit message is where a task is explained. The first line is `Mx-Ty: what changed`, in the imperative. The body covers, where they apply:

- [ ] **Task:** the task ID, and which "Done when" items this commit meets (they're checked off in the milestone file too).
- [ ] **Changes:** what changed and why, briefly, including anything that differs from the plan.
- [ ] **Tests:** which tests were added or updated, and which suites you ran.
- [ ] **Performance** (rendering tasks): draw calls and median and p95 frame times, before and after, and the machine they're from ([docs/perf/README.md](docs/perf/README.md)).
- [ ] **Dependencies:** each one added, with its version and why.
- [ ] **Docs:** which plan docs or `AGENTS.md` sections were updated.
- [ ] **Decisions:** any D-entry added or changed in `decisions.md`.

End with the `Co-Authored-By:` line if an agent wrote the change.

## Definition of done

- [ ] The task's "Done when" items are met and checked off in the milestone file.
- [ ] Tests are added or updated; `pnpm check` and the relevant integration and e2e suites pass.
- [ ] Docs (`docs/plan/*`, `AGENTS.md`) are updated if behavior, commands or decisions changed.
- [ ] A feature that readers or editors see adds or updates its guided-tour step (`apps/web/src/help/tours.ts`, M8-T10), and marks any control the step points at with `data-tour`.
- [ ] No performance budget regressed. For rendering tasks, the numbers are in the commit message.
