# CI/CD and Deployment Guide for YuemPuenMa

How YuemPuenMa is tested, released and deployed to Google Cloud Run (Lab 5, SR-02). It describes the scripts and workflows in this repository as they are. Local setup is in the [README](../README.md#run-seed-and-test-locally).

## 1. Where it runs

The app runs in the shared course project `cpe-se-course-2026`, region `asia-southeast1`, under the team id `sa8227601`. The course portal and the TA provision every cloud resource and all IAM. Nothing in this repository creates, deletes or grants anything. The scripts only build an image and update resources that already exist.

| Resource | Name | Created by |
|---|---|---|
| Cloud Run service | `sa8227601` | portal |
| Cloud Run job (migrate + seed) | `sa8227601-migrate` | portal |
| Artifact Registry repository / image | `sa8227601` / `sa8227601` | portal / the pipeline pushes |
| Cloud SQL for PostgreSQL | `sa8227601-pg` | portal |
| Secrets | `sa8227601-database-url`, `sa8227601-admin-password`, `sa8227601-demo-password` (only for `--demo`) | portal |
| Runtime service account | `sa8227601-runner` | portal |
| GitHub environment `demo` and Workload Identity Federation | variables `GCP_PROJECT_ID`, `GCP_REGION`, `WIF_PROVIDER`, `WIF_SERVICE_ACCOUNT` | portal, once it has reviewed `main` |

One container serves the API (Elysia on Bun) and the built React app on port 3000, as the non-root `bun` user (root `Dockerfile`). Health is `/api/health`; readiness, which checks the database, is `/api/ready`.

## 2. CI: `.github/workflows/ci-docker.yml`

Workflow `CI`, job `test-and-docker` (the required check for `main`). It runs on every pull request into `main` or `staging`, on a manual run, and from `deploy.yml` before every release:

1. syntax-checks and runs the offline tests of the deploy scripts (`deploy/tests/`, no GCP access);
2. installs the Bun workspace from the root `bun.lock`, with the Bun version from `packageManager`;
3. server: Prisma generate, typecheck, tests against a PostgreSQL 16 service (`inventory_test`), then the migration job's own command (`bunx prisma migrate deploy && bun run prisma:seed`);
4. client: tests (Vitest under Node) and the production build;
5. builds the production image without pushing it. The layers go to the GitHub Actions cache, so the deploy that follows rebuilds from cache.

The Vitest results are uploaded as `server-test-results` and `client-test-results`. `pr-test-res.yml` turns them into the test-report comment on the pull request.

## 3. First-time setup with the portal

1. Merge the release pull request that brings `ci-docker.yml` and `deploy.yml` to `main`. The first **Deploy demo** run then fails at "Validate deployment settings", before any GCP call, because `demo` has no variables yet. Nothing in GCP changes.
2. In the portal, choose Lab 5 and run "Recheck the latest main". The portal reads `main` at a commit SHA and proposes a diff for the team to review and submit as a pull request (into `staging`, then `main`). Review that diff like any other pull request. It must keep the Bun migration command, port 3000, the `--update-*` flags and the `origin/main` guard in `deploy/deploy.sh`.
3. Once the portal has configured `demo`, run **Actions → Deploy demo → Run workflow** on `main` with `image_tag` empty. Check that the smoke test step passed.

## 4. Releases: `.github/workflows/deploy.yml`

Every push to `main` (every merged release pull request):

1. runs CI (above);
2. signs in to Google Cloud through Workload Identity Federation. There is no key file anywhere;
3. builds and pushes `asia-southeast1-docker.pkg.dev/cpe-se-course-2026/sa8227601/sa8227601:<full commit SHA>`;
4. runs `deploy/release.sh`, which resolves the tag to its `@sha256` digest, points the migration job at that digest and runs it, and only if the job succeeds points the service at the same digest with 100% of traffic;
5. runs `deploy/smoke_test.py` against the public URL;
6. writes the tag, digest and URL to the run summary.

Releases are queued and never cancelled mid-run, so a migration is never interrupted.

## 5. Manual deploy: `deploy/deploy.sh`

The same build → migrate → update sequence, run by hand. Normal releases should go through `deploy.yml`.

```bash
DRY_RUN=1 bash deploy/deploy.sh          # prints every command, calls nothing (the default)
DRY_RUN=0 bash deploy/deploy.sh          # really deploys
DRY_RUN=0 bash deploy/deploy.sh --demo   # also seeds the demo Borrowers
```

Before it calls GCP, the script refuses to continue unless:

- the project is `cpe-se-course-2026` and the region is `asia-southeast1`;
- the working tree is clean, including untracked files, since they would end up in the image;
- `HEAD` is exactly `origin/main` after a fetch. A detached checkout of that commit is fine.

It then checks that the Artifact Registry repository, the service, the job and every secret it is about to use exist, before building anything. Env vars and secrets are merged into what the portal set (`--update-secrets`, `--update-env-vars`), never replaced. `SEED_DEMO_DATA` is only written with `--demo`, so a plain run does not undo an earlier `--demo`.

## 6. Rollback

1. Open the last successful **Deploy demo** run and copy the commit image tag from its summary.
2. **Actions → Deploy demo → Run workflow** on `main`, and enter that full 40-character SHA as `image_tag`.
3. Check that the tests, build and migration were skipped, that the deploy and the smoke test passed, and that the serving revision in Cloud Run uses the older digest.
4. To go forward again, run the workflow with the newer release's SHA. An empty `image_tag` would rebuild the current `main` instead of reusing the image you checked.

A rollback changes only the image. The database schema is not rolled back, so migrations must stay additive: add new columns and tables first, and remove old ones only in a later release.

## 7. Smoke test

`deploy/smoke_test.py <url>` is read-only. It checks `/api/health`, `/api/ready` (database connected), `/` (the app's HTML) and `/api/categories` (migration and seed ran). Optionally, with the variable `SMOKE_EMAIL` and the secret `SMOKE_PASSWORD` set in the `demo` environment (both or neither), it also signs in, calls `/api/auth/me` and signs out. Do not use the Custodian (administrator) account for this.

## 8. Troubleshooting

| Symptom | What to check |
|---|---|
| "Validate deployment settings" fails | The `demo` environment or one of its four variables is missing. The portal sets them up (section 3). |
| `deploy.sh` says the tree is not clean or `HEAD` is not `origin/main` | Commit or stash, `git pull`, and run it from `main`. It only deploys reviewed code. |
| `deploy.sh` says a secret or the registry is missing | Ask the TA. The portal provisions them. |
| The migration job fails | Read the job logs (`deploy.sh` prints the `gcloud logging read` command). The service has not been touched. |
| Health passes but readiness fails | Database connectivity, the `DATABASE_URL` secret mapping, and the migration job's last execution. Do not copy secret values into logs or chat. |
| The job fails with a permission error on a secret | The runtime service account cannot read that secret. Ask the TA; do not grant IAM yourself. |

## 9. Cost and shutting down

Cloud SQL is billed for every hour it exists, even with no traffic, and the course credits are shared by every team. Cloud Run scales to zero (minimum 0, maximum 1 instance). There is no teardown script: ask the TA to pause or delete the team's resources. Never delete shared resources yourself.
