# CPE 334 Lab 5 Starter Files

These files take YuemPuenMa from a laptop to Google Cloud Run with a CI/CD pipeline. They are the worked example for Lab 5. Your team's project uses a different app and maybe a different stack, so copy the files into your repository and adapt them. The Lab 5 handout explains the rules each file must follow.

The application code (`client/`, `server/src/`, `server/prisma/`) is not included. Every file here assumes a Node.js 24 frontend and API in one container with PostgreSQL and Prisma. Lines that depend on that are listed under "What to change".

## Sprint 1: run, seed and test the app locally

YuemPuenMa is an equipment borrowing system: Borrowers request items for a period, a Custodian approves or rejects. Specification and test documents are in `docs/`.

**Requirements:** [Bun](https://bun.sh) 1.3 or newer, [Docker](https://www.docker.com) (for PostgreSQL 16), and Chrome (only for the Playwright spec).

1. **Install.** `bun install` at the repository root, then in `server/` and in `client/`.
2. **Database.** Start PostgreSQL with `docker compose up -d db`. It listens on `localhost:5432`.
3. **Environment.** Copy `server/.env.example` to `server/.env` and set the values. `DATABASE_URL`, `ADMIN_PASSWORD` (the Custodian's password) and `DEMO_USER_PASSWORD` (the Borrowers' password) are required; the example file explains every variable. Use synthetic values. `.env` is git-ignored and must never be committed. `client/.env.example` is only needed when the API runs on another origin.
4. **Migrate and seed.** In `server/`: `bunx prisma migrate deploy`, then `bun run prisma:seed`. The seed creates 4 categories, 12 items (one `MAINTENANCE`, one `RETIRED`), the Custodian `custodian@example.test` and, when `SEED_DEMO_DATA=true`, the Borrowers `borrower1@example.test` and `borrower2@example.test`. `SEED_DEMO_REQUESTS=true` adds one approved demo booking on `CPE-0201`.
5. **Run.** In `server/`: `bun run dev` (API on `:3000`). In `client/`: `bun run dev` (UI on `:5173`, which proxies `/api`). Or run everything with `docker compose up --build`.
6. **Build.** `bun run build` in `client/` (type-checks, then builds). `bun run typecheck` in `server/` and `client/`.
7. **Test.**
   - API and unit tests need their own database, because every test file resets the tables. Create an empty database named `inventory_test` (for example `docker exec <db container> psql -U yuempuenma -d postgres -c "CREATE DATABASE inventory_test"`). The connection string is in `server/test/.env.test`; set `DATABASE_URL` in the shell to use another host or port. The global setup refuses to run against a database whose name does not contain `_test`. Then run `bun run test` in `server/`.
   - Component tests: `bun run test` in `client/`.
   - End-to-end test (needs the API and the client running on a freshly seeded database with `SEED_DEMO_REQUESTS=false`): `bunx playwright test` at the repository root. Set `E2E_BASE_URL` to use another address.

## What is in this folder

| File | What it does |
|---|---|
| `server/Dockerfile`, `client/Dockerfile`, `client/nginx.conf` | Used by `docker-compose.yml` for local runs: one image for the API, one for the web app served by nginx. |
| `Dockerfile`, `.dockerignore` | Three-stage build. The React app is built and served by the Elysia (Bun) API from one container on port 3000, running as the non-root `bun` user. |
| `docker-compose.yml` | Runs PostgreSQL, a migration/seed job, the API (`localhost:3000`) and the web app (`localhost:5173`) locally. |
| `server/.env.example`, `client/.env.example` | Every environment variable the app reads, with placeholders only. Copy to `.env` locally and never commit `.env`. |
| `server/docker-entrypoint.sh` | Starts the server and nothing else. Migrations run in a separate Cloud Run job. |
| `.github/workflows/ci-docker.yml` | Runs on every Pull Request: PostgreSQL service, migrate and seed, backend and frontend tests, deploy script tests, Docker build. The job name `test-and-docker` is the required check for the ruleset. |
| `.github/workflows/deploy.yml` | Runs on every merge into `main`: CI again, build and push the image tagged with the commit SHA, migration job, Cloud Run update, smoke test. Run it by hand with `image_tag` to roll back. |
| `deploy/deploy.sh` | One-time setup and first deploy: APIs, Artifact Registry, Cloud SQL, secrets, runtime service account, migration job, and Cloud Run service. Run with `DRY_RUN=1` first. |
| `deploy/release.sh` | Called by `deploy.yml`. Checks the image exists, reads its digest, runs the migration job, and updates the service. |
| `deploy/smoke_test.py` | Checks `/api/health`, `/api/ready`, `/`, and `/api/categories`, plus an optional sign-in. |
| `deploy/teardown.sh` | Deletes the cloud resources after the course. |
| `deploy/tests/` | Offline tests for the deploy scripts. CI runs them. |
| `.github/dependabot.yml` | Opens a Pull Request every week when a GitHub Action used by the workflows has a newer version. |
| `docs/gcp-first-lab.md` | Step-by-step first deploy from Cloud Shell. |
| `docs/gcp-cicd-guide.md` | GCP setup, local run, CI, troubleshooting, and cost. |
| `docs/auto-deploy.md` | Workload Identity Federation, GitHub environment and variables, ruleset, and rollback. |

The guides are in English. The TA team wrote them during their own rehearsal. Values such as `YOUR_PROJECT_ID`, `YOUR_PROJECT_NUMBER`, and `YOUR_ORG/YOUR_REPO` are placeholders for your own. Commit SHAs and revision names in the guides are examples from the rehearsal.

## Order of work

0. Follow the Lab 5 Student Guide (the episode series from the TA team). This folder is the material it points to.
1. Run your app locally in production mode, then with `docker compose up --build`.
2. Make it cloud-ready: sessions and uploaded files in the database, no demo passwords in production, reference data and the first administrator created by the seed.
3. Add `ci-docker.yml` and open a Pull Request to see the checks run.
4. Confirm billing is open and create a budget alert. In Cloud Shell, run `DRY_RUN=1 PROJECT_ID=YOUR_PROJECT_ID bash deploy/deploy.sh`, read the output, then run it without `DRY_RUN`. The TA guides add `--demo`, which loads sample users with a generated password for teaching. Demo accounts are allowed in your project (you will need them for UAT in Lab 6), but their passwords must come from Secret Manager or environment variables, never from code, and must not be shown on screen.
5. Follow `docs/auto-deploy.md` to create the deploy service account, Workload Identity Federation, the GitHub environment `demo`, and the ruleset for `main`.
6. Add `deploy.yml` and merge a small change into `main`.

## GitHub settings that deploy.yml expects

Environment `demo`, deployable only from `main`, with these variables:

| Name | Example |
|---|---|
| `GCP_PROJECT_ID` | `YOUR_PROJECT_ID` |
| `GCP_REGION` | `asia-southeast1` |
| `WIF_PROVIDER` | `projects/YOUR_PROJECT_NUMBER/locations/global/workloadIdentityPools/github-actions/providers/github-main` |
| `WIF_SERVICE_ACCOUNT` | `yuempuenma-deployer@YOUR_PROJECT_ID.iam.gserviceaccount.com` |

Optional: `SMOKE_EMAIL` as a variable and `SMOKE_PASSWORD` as a secret, for the sign-in check. Set both or neither.

Ruleset for `main`: Enforcement Active, empty bypass list, Require a pull request, Require status checks to pass with `test-and-docker` selected through Add checks, and Require branches to be up to date.

## What to change for your project

- Names: the service `yuempuenma`, the job `yuempuenma-migrate`, the Artifact Registry repository, and the Cloud SQL instance and database appear in `deploy/deploy.sh`, `deploy/release.sh`, and `deploy.yml`. Rename them consistently.
- `Dockerfile`: the build commands, the paths copied into the final image, and the port. The final image must contain every file the server and the seed need at run time.
- `ci-docker.yml`: the install, migrate, seed, test, and build commands for your stack.
- `deploy/deploy.sh` and `release.sh`: the migration job command (`prisma migrate deploy` and the seed) and the secrets your app reads.
- `deploy/smoke_test.py`: the endpoints and the expected text. Keep it read-only and do not use the administrator account.
- Leave alone unless you know why: Workload Identity Federation instead of JSON keys, actions pinned to full commit SHAs, the image tag being the full commit SHA, deploying by image digest, and the `if` conditions on the `test` and `deploy` jobs that make rollback work.

## Rollback

Actions > Deploy demo > Run workflow on `main`, then enter the full 40-character commit SHA of the last release that worked. The workflow skips tests, build, and migration, deploys that image, and runs the smoke test. The database schema is not rolled back, so keep migrations additive.

## Cost

Cloud SQL is billed for every hour it exists. The TA team estimated about USD 14 to 18 per project per month with light use in October 2026. Create the budget alert before anything else, and run `deploy/teardown.sh` when the course ends.
