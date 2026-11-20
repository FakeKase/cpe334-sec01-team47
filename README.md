# YeumPeunMa

An inventory and borrowing system for the CPE equipment room. Borrowers browse the catalog and request equipment for a period. A Custodian approves or rejects each request, and the system prevents double booking.

CPE 334 Software Engineering, Section 01, Team 47. Code identifiers, the database and the containers use the spelling `yuempuenma`.

**Status.** Sprint 1 (SR-01 and F-01 to F-05: login and roles, catalog, submit a request, my requests, review requests) is implemented. The plan for the later sprints is in [`docs/sprints/plan.md`](docs/sprints/plan.md). Deployment to Google Cloud (SR-02) is not done yet; see "Deployment" below.

## Technology

| Layer | Technology |
|---|---|
| Client | React 19, Vite, React Router, Tailwind CSS 4 |
| API | Bun, Elysia, Zod |
| Database | PostgreSQL 16 with Prisma (migrations and seed) |
| Tests | Vitest (unit, API, component), React Testing Library with MSW, Playwright (end-to-end) |
| Quality | oxlint, oxfmt, commitlint, husky and lint-staged (run on every commit) |
| Packaging | Docker and Docker Compose |

## Repository layout

| Path | Contents |
|---|---|
| `client/` | React app: `src/pages`, `src/components`, `src/auth`, `src/api`, component tests next to the pages |
| `server/` | API: `src` (routes, services, domain rules, middleware), `prisma` (schema, migrations, seed), `test` (unit and API tests) |
| `e2e/` | Playwright specs and helpers. Configuration is in `playwright.config.ts`. |
| `docs/` | Specification, design, plan, contracts and test specification (see "Documentation") |
| `deploy/` | Scripts for the planned Cloud Run deployment and their offline tests |
| `Dockerfile`, `server/Dockerfile`, `client/Dockerfile`, `client/nginx.conf`, `docker-compose.yml` | Container images (all built from the repository root) and the local stack |
| `compose-db.yml` | The development database: PostgreSQL alone, for running the API and tests on the host (`bun run db:up`) |
| `turbo.json`, `AGENTS.md` | Task runner configuration and the shared instructions for AI coding agents (`CLAUDE.md` imports it) |
| `.github/` | Workflows (`ci-docker.yml` CI, `deploy.yml` deploy, `pr-test-res.yml` PR test report and its scripts) and the Dependabot configuration |

## Run, seed and test locally

**Requirements:** [Bun](https://bun.sh) 1.3 or newer, [Docker](https://www.docker.com) (for PostgreSQL 16), and, for the end-to-end spec only, Playwright's Chromium (one-time: `bunx playwright install chromium`).

1. **Install.** `bun install` at the repository root. The repository is a Bun workspace (`client`, `server`) with one lockfile, and [Turborepo](https://turborepo.com) runs the package scripts. Client tests also need Node on `PATH` (vitest under Bun breaks MSW).
2. **Database.** `bun run db:up` starts PostgreSQL from `compose-db.yml` on `localhost:5432` and creates the `inventory_test` database for the API tests if it is missing. `bun run db:down` stops it and keeps the data.
3. **Environment.** Copy `server/.env.example` to `server/.env` and set the values. `DATABASE_URL`, `ADMIN_PASSWORD` (the Custodian's password) and `DEMO_USER_PASSWORD` (the Borrowers' password) are required; the example file explains every variable. Use synthetic values. `.env` is git-ignored and must never be committed. `client/.env.example` is only needed when the API runs on another origin.
4. **Migrate and seed.** In `server/`: `bunx prisma migrate deploy`, then `bun run prisma:seed`. The seed creates 4 categories, 12 items (one `MAINTENANCE`, one `RETIRED`), the Custodian `custodian@example.test` and, when `SEED_DEMO_DATA=true`, the Borrowers `borrower1@example.test` and `borrower2@example.test`. `SEED_DEMO_REQUESTS=true` adds one approved demo booking on `CPE-0201`.
5. **Run.** `bun run dev` at the root starts the API on `:3000` and the UI on `:5173` (which proxies `/api`). `docker compose up --build` runs the production-like stack from `docker-compose.yml` instead (built images, nginx, `NODE_ENV=production`). It publishes the same ports as `bun run db:up` and `bun run dev`, so stop those first.
6. **Build.** `bun run build` and `bun run typecheck` at the root.
7. **Test.**
   - `bun run test` at the root runs the API, unit and component suites. To run one, add `--filter cpe334-team47-server` (or `-client`) to `bunx turbo run test`.
   - API and unit tests need their own database, because every test file resets the tables. `bun run db:up` creates `inventory_test`; with another Postgres, create an empty database with that name yourself. The `test` script loads `server/test/.env.test` (`bun --env-file=test/.env.test`), which wins over `server/.env`, so the tests never touch your development database. To use another host or port, export `DATABASE_URL` in the shell before running; an exported value wins. The global setup refuses to run against a database whose name does not contain `_test`.
   - End-to-end test (needs the API and the client running on a freshly seeded database with `SEED_DEMO_REQUESTS=false`): `bun run test:e2e` at the repository root. The spec logs in with the seeded accounts, so if you seeded with your own passwords, export the same `ADMIN_PASSWORD` and `DEMO_USER_PASSWORD` in the shell first (the defaults are the `docker-compose.yml` values). Set `E2E_BASE_URL` to use another address.

## Documentation

| Document | What it is |
|---|---|
| [`docs/srs.md`](docs/srs.md) | Part A: requirements (FR, BR, NFR), scope, assumptions and decisions |
| [`docs/features.md`](docs/features.md), [`docs/traceability.md`](docs/traceability.md) | Part B: feature inventory and requirement-to-feature-to-sprint traceability |
| [`docs/system-sds.md`](docs/system-sds.md) | Part C: architecture, data model, UI, API conventions, roles, authentication, configuration |
| [`docs/sprints/plan.md`](docs/sprints/plan.md) | Part D: the three-sprint plan |
| [`docs/sprints/sprint-1/`](docs/sprints/sprint-1/) | Part E: Sprint 1 contracts (F-01 to F-05), the test specification (`sts.md`) and the Definition of Done |
| [`docs/gcp-cicd-guide.md`](docs/gcp-cicd-guide.md) | CI, releases, manual deploy, rollback and troubleshooting on the shared course project (Lab 5) |

## Team workflow

- `main` holds releases. `staging` integrates a sprint. Every feature is built on a branch from `staging` named `feat/F-0x-short-name`.
- Contract first: the contract and its tests are committed before the implementation, so the tests fail first and pass afterwards.
- Every change goes through a pull request into `staging`. The other team member reviews it, and authors never approve their own pull request. A release pull request moves `staging` into `main`.
- Commit messages follow Conventional Commits (`feat(server): ...`, `docs: ...`). Husky runs commitlint, oxlint and oxfmt on commit.

## Deployment (Lab 5, SR-02)

The target is Google Cloud Run with Cloud SQL and Secret Manager in the shared course project `cpe-se-course-2026` (team id `sa8227601`), deployed from `main` by GitHub Actions. The portal and the TA provision the infrastructure and IAM; the scripts only update it.

- `.github/workflows/ci-docker.yml` (workflow `CI`, job `test-and-docker`) runs on every pull request into `main` or `staging`: deploy-script tests, server and client tests, migrate and seed, and the production Docker build. It uploads the Vitest results that `pr-test-res.yml` posts as a PR comment.
- `.github/workflows/deploy.yml` runs on every merge into `main`: CI, then build and push the image tagged with the commit SHA, then `deploy/release.sh` (checks the image, runs the migration job, updates the service), then `deploy/smoke_test.py` (checks `/api/health`, `/api/ready`, `/` and `/api/categories`).
- `deploy/deploy.sh` is the manual equivalent. It only runs from a clean checkout of `origin/main`; it previews by default, and `DRY_RUN=0` makes it deploy.
- `deploy/tests/` holds offline tests for the scripts, and `.github/dependabot.yml` keeps the pinned actions up to date.
- `server/docker-entrypoint.sh` only starts the server; migrations run in a separate job.

The deploy workflow expects:

- A GitHub environment `demo`, deployable only from `main`, with the variables `GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER` and `WIF_SERVICE_ACCOUNT`. `SMOKE_EMAIL` (variable) and `SMOKE_PASSWORD` (secret) are optional for the sign-in check; set both or neither.
- A ruleset on `main`: Enforcement Active, empty bypass list, require a pull request, require the status check `test-and-docker`, and require branches to be up to date.
- Image tags equal to the full commit SHA, deployment by image digest, and Workload Identity Federation instead of JSON keys.

Passwords for the demo accounts must come from Secret Manager or environment variables, never from code. **Rollback:** Actions, Deploy demo, Run workflow on `main`, then enter the full 40-character commit SHA of the last release that worked. The database schema is not rolled back, so keep migrations additive. **Cost:** Cloud SQL is billed for every hour it exists (about USD 14 to 18 per month with light use). Ask a TA to pause or clean up the shared resources; do not tear them down yourself.
