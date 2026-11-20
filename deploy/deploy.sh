#!/usr/bin/env bash
set -euo pipefail

# ==============================================================================
# YuemPuenMa — manual build and deploy to the shared course project
# ==============================================================================
# Usage:
#   DRY_RUN=1 bash deploy/deploy.sh [--demo]   # preview (the default)
#   DRY_RUN=0 bash deploy/deploy.sh [--demo]   # really deploy
#
# Environment Variables (Optional):
#   DRY_RUN      1 (default) prints every command without running it;
#                0 runs them
#   PROJECT_ID   must be cpe-se-course-2026 (the default)
#   REGION       must be asia-southeast1 (the default)
#   IMAGE_TAG    full commit SHA; defaults to HEAD and must equal HEAD
#
# WHAT THIS SCRIPT DOES
#   The portal and the TA provision the infrastructure and IAM: Artifact
#   Registry, Cloud SQL, secrets, the runtime service account, the migration
#   job and the Cloud Run service. This script never creates those; it only:
#     1 checks HEAD is a clean checkout of origin/main
#     2 checks the service, job and secrets it uses exist
#     3 builds the root Dockerfile and pushes it tagged with the commit SHA
#     4 points the migration job at that image (by digest) and runs it
#     5 points the service at the same digest and sends it 100% of traffic
#   Routine releases are done by GitHub Actions (deploy.yml ->
#   deploy/release.sh); use this script for a manual deploy.
#
# ⭐ IMPORTANT
#   - Env vars and secrets are MERGED (--update-*) into what the portal set up,
#     never replaced, so values provisioned outside this script survive.
#   - If the migration job fails the script stops before the service changes.
#   - Run from the REPO ROOT (it builds the root Dockerfile).
#   - Offline test: deploy/tests/test_deploy_stub.sh
#
# REFERENCES
#   - gcloud run jobs update     : https://cloud.google.com/sdk/gcloud/reference/run/jobs/update
#   - gcloud run services update : https://cloud.google.com/sdk/gcloud/reference/run/services/update
#   - Cloud SQL + Run            : https://cloud.google.com/sql/docs/postgres/connect-run
#   - Secret Manager             : https://cloud.google.com/secret-manager/docs
#   - Artifact Registry          : https://cloud.google.com/artifact-registry/docs/docker
# ==============================================================================

DRY_RUN="${DRY_RUN:-1}"
SEED_DEMO_DATA="false"

for arg in "$@"; do
  case "$arg" in
    --demo) SEED_DEMO_DATA="true" ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--demo]" >&2
      exit 1
      ;;
  esac
done

# Prints the command; runs it too unless DRY_RUN=1.
run_cmd() {
  if [ "$DRY_RUN" = "1" ]; then printf '[DRY_RUN] '; else printf '+ '; fi
  printf '%q ' "$@"
  printf '\n'
  if [ "$DRY_RUN" != "1" ]; then
    "$@"
  fi
}

# ------------------------------------------------------------------------------
# Fixed course settings and resource names (all derived from the team id)
# ------------------------------------------------------------------------------
PROJECT_ID="${PROJECT_ID:-cpe-se-course-2026}"
[[ "$PROJECT_ID" == "cpe-se-course-2026" ]] || { echo 'Wrong course project' >&2; exit 1; }
REGION="${REGION:-asia-southeast1}"
[[ "$REGION" == "asia-southeast1" ]] || { echo 'Wrong assigned region' >&2; exit 1; }
TEAM="sa8227601"
REPO_NAME="$TEAM"
SERVICE_NAME="$TEAM"
MIGRATE_JOB_NAME="${TEAM}-migrate"
SA_EMAIL="${TEAM}-runner@${PROJECT_ID}.iam.gserviceaccount.com"
SQL_CONN_NAME="${PROJECT_ID}:${REGION}:${TEAM}-pg"
SECRET_DB_URL="${TEAM}-database-url"
SECRET_ADMIN_PASS="${TEAM}-admin-password"
SECRET_DEMO_PASS="${TEAM}-demo-password"

# ------------------------------------------------------------------------------
# 1. Only deploy exactly what was reviewed: a clean checkout of origin/main.
#    A detached HEAD is fine as long as it is that commit.
# ------------------------------------------------------------------------------
if [ "$DRY_RUN" = "1" ]; then
  IMAGE_TAG="${IMAGE_TAG:-0000000000000000000000000000000000000000}"
else
  HEAD_SHA="$(git rev-parse HEAD)"
  IMAGE_TAG="${IMAGE_TAG:-$HEAD_SHA}"
  [[ "$IMAGE_TAG" == "$HEAD_SHA" ]] || { echo 'IMAGE_TAG must match HEAD' >&2; exit 1; }
  # Untracked files count too: they would end up in the Docker build context.
  [[ -z "$(git status --porcelain)" ]] || { echo 'Working tree not clean; commit or stash first' >&2; exit 1; }
  git fetch --quiet origin main
  [[ "$HEAD_SHA" == "$(git rev-parse origin/main)" ]] || { echo 'HEAD is not origin/main; deploy reviewed main only' >&2; exit 1; }
fi
[[ "$IMAGE_TAG" =~ ^[0-9a-f]{40}$ ]] || { echo 'Use full commit SHA' >&2; exit 1; }
IMAGE_URI="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}:${IMAGE_TAG}"

echo "=================================================================="
echo "YuemPuenMa Cloud Run Deployment"
echo "Project : ${PROJECT_ID}"
echo "Region  : ${REGION}"
echo "Demo    : ${SEED_DEMO_DATA}"
echo "Dry Run : ${DRY_RUN}"
echo "=================================================================="

# ------------------------------------------------------------------------------
# 2. Pre-flight: everything below must already be provisioned by the portal/TA.
#    The runtime service account must also be able to read each secret; ask
#    the TA if the job later fails with a permission error.
# ------------------------------------------------------------------------------
JOB_SECRET_NAMES=("$SECRET_DB_URL" "$SECRET_ADMIN_PASS")
JOB_SECRETS="DATABASE_URL=${SECRET_DB_URL}:latest,ADMIN_PASSWORD=${SECRET_ADMIN_PASS}:latest"
if [ "$SEED_DEMO_DATA" = "true" ]; then
  JOB_SECRET_NAMES+=("$SECRET_DEMO_PASS")
  JOB_SECRETS="${JOB_SECRETS},DEMO_USER_PASSWORD=${SECRET_DEMO_PASS}:latest"
fi
if [ "$DRY_RUN" != "1" ]; then
  gcloud run services describe "$SERVICE_NAME" --project "$PROJECT_ID" --region "$REGION" >/dev/null
  gcloud run jobs describe "$MIGRATE_JOB_NAME" --project "$PROJECT_ID" --region "$REGION" >/dev/null
  for secret in "${JOB_SECRET_NAMES[@]}"; do
    gcloud secrets describe "$secret" --project "$PROJECT_ID" >/dev/null || {
      echo "Secret ${secret} is missing. Ask the TA/portal to provision it." >&2
      exit 1
    }
  done
fi

# ------------------------------------------------------------------------------
# 3. Build and push the image tagged with the commit SHA, then pin its digest
# ------------------------------------------------------------------------------
run_cmd gcloud auth configure-docker "${REGION}-docker.pkg.dev" --quiet
run_cmd docker build --platform linux/amd64 --tag "$IMAGE_URI" .
run_cmd docker push "$IMAGE_URI"
if [ "$DRY_RUN" != "1" ]; then
  IMAGE_URI="$(gcloud artifacts docker images describe "$IMAGE_URI" --project "$PROJECT_ID" --format='value(image_summary.fully_qualified_digest)')"
  [[ "$IMAGE_URI" == "${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}@sha256:"* ]] || { echo 'Missing image digest' >&2; exit 1; }
fi

# ------------------------------------------------------------------------------
# 4. Migration + non-destructive seed job (release.sh re-runs this same job)
#    ⭐ IMPORTANT: if this job fails the script stops BEFORE the service is
#       updated, so a broken migration never reaches users.
# ------------------------------------------------------------------------------
run_cmd gcloud run jobs update "$MIGRATE_JOB_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --add-cloudsql-instances "$SQL_CONN_NAME" \
  --update-secrets "$JOB_SECRETS" \
  --update-env-vars "NODE_ENV=production,TZ=Asia/Bangkok,SEED_DEMO_DATA=${SEED_DEMO_DATA}" \
  --command "sh" \
  --args "-c,bunx prisma migrate deploy && bun run prisma:seed" \
  --max-retries 1 \
  --task-timeout 300s \
  --project "$PROJECT_ID"

if ! run_cmd gcloud run jobs execute "$MIGRATE_JOB_NAME" \
  --region "$REGION" \
  --wait \
  --project "$PROJECT_ID"; then
  printf '%s\n' "ERROR: Cloud Run migration job '${MIGRATE_JOB_NAME}' failed. Aborting service deployment." >&2
  printf '%s\n' "View job logs with:" >&2
  printf '%s\n' "  gcloud logging read \"resource.type=cloud_run_job AND resource.labels.job_name=${MIGRATE_JOB_NAME}\" --project \"${PROJECT_ID}\" --limit 50 --format=\"value(textPayload)\"" >&2
  exit 1
fi

# ------------------------------------------------------------------------------
# 5. Cloud Run service: same digest, 100% of traffic
#    --port must equal ENV PORT in the Dockerfile (3000).
# ------------------------------------------------------------------------------
run_cmd gcloud run services update "$SERVICE_NAME" \
  --image "$IMAGE_URI" \
  --region "$REGION" \
  --service-account "$SA_EMAIL" \
  --add-cloudsql-instances "$SQL_CONN_NAME" \
  --update-secrets "DATABASE_URL=${SECRET_DB_URL}:latest" \
  --update-env-vars "NODE_ENV=production,TZ=Asia/Bangkok" \
  --min-instances 0 \
  --max-instances 1 \
  --memory 512Mi \
  --cpu 1 \
  --port 3000 \
  --project "$PROJECT_ID"

run_cmd gcloud run services update-traffic "$SERVICE_NAME" --to-latest --project "$PROJECT_ID" --region "$REGION" --quiet
if [ "$DRY_RUN" = "1" ]; then
  SERVICE_URL="https://${SERVICE_NAME}-<hash>-as.a.run.app"
else
  SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --project "$PROJECT_ID" --format='value(status.url)')"
fi

# ------------------------------------------------------------------------------
# Summary output (URLs; passwords stay in Secret Manager and are not printed)
# ------------------------------------------------------------------------------
printf '\n'
printf '%s\n' "=================================================================="
printf '%s\n' "Deployment Completed!"
printf '%s\n' "Service URL    : ${SERVICE_URL}"
printf '%s\n' "Health Check   : ${SERVICE_URL}/api/health"
printf '%s\n' "Readiness Check: ${SERVICE_URL}/api/ready"
printf '%s\n' "Admin Email    : custodian@example.test"
printf '%s\n' "Admin Password : Stored in Secret Manager: ${SECRET_ADMIN_PASS} (not printed)."
if [ "$SEED_DEMO_DATA" = "true" ]; then
  printf '%s\n' "Demo Password  : Stored in Secret Manager: ${SECRET_DEMO_PASS} (not printed)."
fi
printf '%s\n' "=================================================================="
