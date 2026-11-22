# Lab 5 Deployment: YuemPuenMa on Google Cloud Run

Team 47, CPE 334 Section 01. This file is the Lab 5 record of the stack, configuration, commands, GCP resources and release procedure. The full operating guide is [`docs/gcp-cicd-guide.md`](../../gcp-cicd-guide.md); this file does not repeat it.

## 1. Stack and changes from the reference

| Layer | Choice |
|---|---|
| Client | React 19, Vite, Tailwind |
| API | Bun, Elysia, Zod |
| Database | PostgreSQL 16 with Prisma migrations |
| Container | One production image (root `Dockerfile`, Bun on Alpine, non-root `bun` user) serving the API and the built client on port 3000 |
| Cloud | Cloud Run (service and a migration job), Cloud SQL for PostgreSQL, Secret Manager, Artifact Registry |
| CI/CD | GitHub Actions (`ci-docker.yml`, `deploy.yml`), Workload Identity Federation instead of a JSON key |

Differences from the handout's reference path, and why:

- **The GCP project was provisioned by the course portal, not created by us.** We use the shared course project `cpe-se-course-2026`, team id `sa8227601`. The portal and the TAs create the cloud resources and IAM; the repository scripts only build an image and update resources that already exist. So we have no Free Trial signup or budget alert of our own.
- **Cloud Run scaling.** `deploy/deploy.sh` sets minimum 0 and maximum 1 instance (the handout recommends at most 3) to keep the shared credits low. `deploy/release.sh`, which runs on every release, does not change scaling, so the serving revision keeps whatever was last set.
- **The deploy workflow uses a GitHub environment named `demo`**, with variables set by the portal, instead of repository secrets set by us.

## 2. Environment variables

Every setting comes from the environment. Only placeholder values are committed, in `server/.env.example` and `client/.env.example`. `.env` is git-ignored.

| Variable | Purpose | Secret? | Where the value comes from |
|---|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required) | Yes | Local: your own `server/.env`. Cloud: Secret Manager `sa8227601-database-url`, mapped by the deploy script |
| `ADMIN_PASSWORD` | Custodian's password, used by the seed (required) | Yes | Local: `server/.env`. Cloud: Secret Manager `sa8227601-admin-password`, on the migration job only |
| `DEMO_USER_PASSWORD` | Password for the demo Borrowers (required when `SEED_DEMO_DATA=true`) | Yes | Local: `server/.env`. Cloud: Secret Manager `sa8227601-demo-password`, only when deployed with `--demo` |
| `SEED_DEMO_DATA` | Creates the demo Borrowers when `true` | No | `.env`; the deploy script sets it only with `--demo` |
| `SEED_DEMO_REQUESTS` | Adds one approved demo booking on `CPE-0201` | No | `.env`; keep `false` in CI and E2E |
| `PORT` | HTTP port of the API | No | Default `3000`; fixed in the Dockerfile and the Cloud Run `--port` |
| `APP_TIMEZONE` | Time zone for dates | No | Default `Asia/Bangkok` |
| `BCRYPT_COST` | Bcrypt cost for the seeded accounts (only the seed reads it; the API never hashes a password) | No | Default `12` |
| `SESSION_TTL_HOURS` | Session lifetime (NFR-04) | No | Default `8`. Sessions are stored in the database, not in the container |
| `NODE_ENV`, `TZ` | Runtime mode and process time zone | No | Set to `production` and `Asia/Bangkok` in the image and by the deploy script |
| `VITE_API_URL` | Client build setting: API base URL, empty means same origin | No | `client/.env.example`; empty in the production image |
| `VITE_APP_TIMEZONE` | Client display time zone, must match `APP_TIMEZONE` | No | `client/.env.example` |

GitHub environment `demo` (set by the portal): variables `GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT`. Optional: variable `SMOKE_EMAIL` and secret `SMOKE_PASSWORD` for the sign-in smoke check (set both or neither; never the Custodian account).

No secret is committed. Passwords are never printed in logs or pasted into an agent chat.

## 3. Commands

Run from the repository root unless noted. Local setup details are in the README.

| Task | Command |
|---|---|
| Install | `bun install` |
| Start the local database | `bun run db:up` (starts the dev Postgres and creates `inventory_test` if it is missing) |
| Migrate (in `server/`) | `bunx prisma migrate deploy` |
| Seed (in `server/`) | `bun run prisma:seed` |
| Build | `bun run build` |
| Unit and API tests | `bun run test` (uses `server/test/.env.test`; refuses a database whose name has no `_test`) |
| End-to-end test | `bun run test:e2e` (needs the API and client running on a freshly seeded, non-dev database with `SEED_DEMO_REQUESTS=false`; see the README step on E2E) |
| Build the production image that Cloud Run runs (root `Dockerfile`) | `docker build --platform linux/amd64 -t yuempuenma .` |
| Run the production-like local stack (separate server and client images plus a database; not the Cloud Run image) | `docker compose up --build` |
| Deploy-script tests (no GCP access) | `bash deploy/tests/test_deploy_stub.sh` and `bash deploy/tests/test_release_stub.sh` |
| Preview a manual deploy | `DRY_RUN=1 bash deploy/deploy.sh` |

Notes on the Docker commands:

- **Windows line endings.** The images are built from the working tree, and `server/docker-entrypoint.sh` must have LF line endings. With `core.autocrlf=true`, Git checks it out with CRLF and the container fails with `exec ./docker-entrypoint.sh: no such file or directory`. Clone with `git clone -c core.autocrlf=false <repo url>` (or set it before checking out) and build from that clone. CI and Cloud Run build from a Linux checkout, so they are not affected.
- **Ports.** `docker compose up --build` publishes ports 5432 (database), 3000 (API) and 5173 (client). Stop anything else that uses them first, including the development database from `bun run db:up`.
- **Checked on 22 Nov 2026** from a fresh clone of `staging` at `62fa7a6`: `docker build --platform linux/amd64 -t yuempuenma .` succeeded, and `docker compose up --build` applied the migration, ran the seed (migrate job exit 0) and then answered 200 on `/api/health`, `/api/ready`, `/` and `/api/categories`. The database was published on port 55432 because 5432 was already in use on that machine.

## 4. GCP resources

Project `cpe-se-course-2026`, region `asia-southeast1`.

| Resource | Name |
|---|---|
| Cloud Run service | `sa8227601` |
| Cloud Run job (migrate and seed) | `sa8227601-migrate` |
| Artifact Registry repository and image | `sa8227601` / `sa8227601` |
| Cloud SQL for PostgreSQL | `sa8227601-pg` |
| Secrets | `sa8227601-database-url`, `sa8227601-admin-password`, `sa8227601-demo-password` |
| Runtime service account | `sa8227601-runner` |

Public URL: https://sa8227601-4d7hbszvwq-as.a.run.app

Data (accounts, requests, sessions) lives in Cloud SQL, so it survives a restart and a redeploy. Migrations run as a separate job before the service is updated and must stay additive.

## 5. Release procedure

1. **Issue and branch.** Open an Issue (label it `lab5` for Lab 5 work) and a feature or fix branch from `staging`.
2. **Pull request into `staging`.** CI (`CI` workflow, job `test-and-docker`) runs the deploy-script tests, the server tests against PostgreSQL 16, the client tests, migrate and seed, and the production image build. The teammate reviews; the author never approves their own PR, and each review states what was checked.
3. **Release pull request, `staging` into `main`.** CI runs again and the teammate reviews. A failed `test-and-docker` check must block the merge.
4. **Merge into `main` deploys.** `deploy.yml` runs CI, signs in through Workload Identity Federation, builds and pushes the image tagged with the full commit SHA, runs `deploy/release.sh` (resolve the digest, run the migration job, and only if it succeeds point the service at the same digest), then runs `deploy/smoke_test.py` against the public URL.
5. **Tag.** Tag the release commit on `main` (for example `v0.1.1`).
6. **Manual or repeat deploy.** Actions, Deploy demo, Run workflow on `main`. Leave `image_tag` empty to run the full pipeline on `main` (tests, build, migration, deploy). Enter a full 40-character SHA to redeploy an existing image instead; that run skips the tests, the build and the migration and only deploys and smoke-tests.

### Which commit is running

- The summary of the latest successful **Deploy demo** run lists the commit image tag (the full SHA), the image digest and the URL.
- In the Cloud Run console, open service `sa8227601`, then the serving revision, and compare the image digest with the one in the run summary.
- The image tag is the full commit SHA, so the SHA from either place is the release commit.

### Rollback

Run **Deploy demo** on `main` with `image_tag` set to the full SHA of the last good release (this skips the tests, build and migration), check that the deploy and smoke test passed and that the serving revision uses the older digest, then run it again with the newer SHA to roll forward. A rollback changes only the image; the schema is not rolled back.

## 6. Safe use of AI agents

- Every `gcloud` command or console change an agent proposed was read before it ran. Agents did not change billing, IAM or databases; the portal and TAs own those.
- No secret, password, connection string or key file was pasted into an agent chat.
- On a failed deploy, the log excerpt was given to the agent for the cause before asking for a fix.
