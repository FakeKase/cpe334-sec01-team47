# AGENTS.md

YuemPuenMa: equipment borrowing system for the CPE equipment room. Bun workspaces (`client/`, `server/`) driven by Turborepo. `README.md` has setup, layout and the deployment plan.

## Commands

Run from the repository root. Scripts live in each package; the root ones delegate through `turbo run`.

- `bun run db:up` / `bun run db:down`: the development Postgres 16 from `compose-db.yml` on `:5432`. `db:up` also creates `inventory_test` if it is missing; `db:down` keeps the data volume. `docker-compose.yml` is the production-like stack on the same ports; run one at a time.
- `bun run dev`: API on `:3000` and Vite on `:5173` (proxies `/api`). Needs `server/.env` (copy `server/.env.example`).
- `bun run test`: both suites. One package: `bunx turbo run test --filter cpe334-team47-server` (or `-client`).
- `bun run typecheck`, `bun run build`.
- `bun run test:e2e`: Playwright, against an app already running on `:5173`.

## Gotchas

- Client tests run vitest under Node. Keep `node` on `PATH`: under Bun, MSW fails with "Failed to replace a global value" and most client tests break for reasons unrelated to the code.
- Server tests load `server/test/.env.test` and reset every table in `inventory_test` per file, so they run serially. The global setup refuses any database whose name lacks `_test`.
- E2E needs a freshly seeded database with `SEED_DEMO_REQUESTS=false`. The dev database `yuempuenma` holds hand-made demo data the specs collide with; seed a separate database (e.g. `inventory_e2e`) and point the API at it, leaving the dev data intact.
- After editing `server/prisma/schema.prisma`: add a migration (`bunx prisma migrate dev` in `server/`) and run `bunx prisma generate`. Migrations are additive only, because a rollback redeploys code without reverting the schema.
- One lockfile: the root `bun.lock`. Add a dependency with `bun add` inside the package directory. Every Dockerfile builds from the repository root as context and installs with `--filter`, so a new top-level file a container needs means a `COPY` line there.
- The name is `yuempuenma` (display `YuemPuenMa`). `toktickit` is leftover starter-kit naming; replace it wherever it appears.

## Workflow

- Contract first. Each feature has a contract in `docs/sprints/sprint-N/F-xx-*.md` with test IDs (`TEST-nn`) listed in that sprint's `sts.md`. Commit the contract and its failing tests, then the implementation. Requirement IDs (FR, BR, NFR) come from `docs/srs.md`; architecture and API conventions from `docs/system-sds.md`.
- Branch `feat/F-xx-short-name` (or `fix/`, `chore/`, `docs/`) from `staging`; open the PR into `staging`. `main` only takes release PRs from `staging`.
- Conventional Commits with a scope (`feat(server): ...`, `fix(client): ...`). The pre-commit hook runs oxlint and oxfmt (tabs, no semicolons, 120 columns) on staged files.
- Secrets stay in git-ignored `.env` files; fixtures, seeds and examples use synthetic values only.
