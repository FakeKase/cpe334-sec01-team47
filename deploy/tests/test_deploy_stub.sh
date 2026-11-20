#!/usr/bin/env bash
# Offline regression checks: every gcloud, docker and git call is a local stub.
# ==============================================================================
# WHAT THIS TEST DOES (no real GCP calls, no cost)
#   Puts fake `gcloud` / `docker` / `git` first on PATH and runs deploy/deploy.sh
#   for the shared course project, asserting on the recorded commands:
#     release     : build -> push -> migrate job -> service update, by digest
#     job-fail    : migration fails -> script exits 1, service NOT updated
#     demo        : --demo adds the demo password secret and SEED_DEMO_DATA=true
#                   to the migration job; a plain run sets SEED_DEMO_DATA=false
#     guards      : wrong project/region, not on branch main, stale IMAGE_TAG,
#                   dirty tree, HEAD not origin/main -> refused before any gcloud
#                   call; a missing secret or registry -> refused before build
#   It also checks that the script never creates infrastructure or IAM (the
#   portal/TA own those) and that DRY_RUN=1 makes zero gcloud calls.
#   deploy.sh keeps the course kit's structure (the portal checks it), so the
#   job and service are set to the full declared env/secrets with --set-*.
#
# HOW TO RUN (repo root, needs bash):  bash deploy/tests/test_deploy_stub.sh
#   Prints `PASS: <scenario>` per scenario; any `FAIL ...` exits non-zero.
#   CI runs it too (.github/workflows/ci-docker.yml).
#
# ⭐ CHANGE ME: if you rename resources in deploy/deploy.sh (prefix sa8227601),
#    update the matching strings below.
# ==============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="${SCRIPT_DIR}/../deploy.sh"
export TEST_STATE_DIR
TEST_STATE_DIR="$(mktemp -d)"
trap 'rm -rf "$TEST_STATE_DIR"' EXIT
mkdir -p "$TEST_STATE_DIR/bin"
SHA=2222222222222222222222222222222222222222
PREFIX=asia-southeast1-docker.pkg.dev/cpe-se-course-2026/sa8227601/sa8227601
export STUB_SHA="$SHA" STUB_DIGEST="${PREFIX}@sha256:abcdef"

# --- Fake `gcloud` / `docker`: log each call; `git`: pretend HEAD is $STUB_SHA --
cat > "$TEST_STATE_DIR/bin/gcloud" <<'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$GCLOUD_LOG"
case "$*" in
  "secrets describe ${STUB_MISSING_SECRET:-none} "*) exit 1 ;;
  'artifacts repositories describe '*) [ "${STUB_MISSING_REPO:-}" != 1 ] ;;
  'artifacts docker images describe '*) echo "$STUB_DIGEST" ;;
  'run jobs execute '*) [ "$STUB_MODE" != job-fail ] ;;
  'run services describe '*) echo https://sa8227601-stub.example.invalid ;;
esac
STUB
cat > "$TEST_STATE_DIR/bin/docker" <<'STUB'
#!/usr/bin/env bash
printf 'docker %s\n' "$*" >> "$GCLOUD_LOG"
STUB
cat > "$TEST_STATE_DIR/bin/git" <<'STUB'
#!/usr/bin/env bash
case "$*" in
  'branch --show-current') echo "${STUB_BRANCH:-main}" ;;
  'rev-parse HEAD') echo "$STUB_SHA" ;;
  'rev-parse origin/main') echo "${STUB_ORIGIN_SHA:-$STUB_SHA}" ;;
  'status --porcelain') printf '%s' "${STUB_DIRTY:-}" ;;
  'fetch --quiet origin main') ;;
  *) exit 1 ;;
esac
STUB
chmod +x "$TEST_STATE_DIR"/bin/*
export PATH="$TEST_STATE_DIR/bin:$PATH"
export DRY_RUN=0
unset PROJECT_ID REGION IMAGE_TAG

fail() { echo "FAIL $*"; exit 1; }

# --- Release scenarios -----------------------------------------------------------
for MODE in release job-fail demo; do
  export STUB_MODE="$MODE" GCLOUD_LOG="$TEST_STATE_DIR/gcloud-$MODE.log"
  args=()
  if [ "$MODE" = demo ]; then args+=(--demo); fi
  result=0
  bash "$DEPLOY_SCRIPT" "${args[@]}" > "$TEST_STATE_DIR/output" 2>&1 || result=$?
  expected=0
  if [ "$MODE" = job-fail ]; then expected=1; fi
  [ "$result" -eq "$expected" ] || fail "$MODE: unexpected exit $result (wanted $expected)"

  grep -q "^docker build .*--tag ${PREFIX}:${SHA} " "$GCLOUD_LOG" || fail "$MODE: image not tagged with commit SHA"
  grep -q "^run jobs update sa8227601-migrate --image ${STUB_DIGEST} " "$GCLOUD_LOG" || fail "$MODE: job not pinned to digest"
  grep -q 'bunx prisma migrate deploy && bun run prisma:seed' "$GCLOUD_LOG" || fail "$MODE: wrong migration command"
  grep -q '^secrets describe sa8227601-database-url ' "$GCLOUD_LOG" || fail "$MODE: secrets not checked before use"
  if [ "$MODE" = job-fail ]; then
    if grep -q '^run services update ' "$GCLOUD_LOG"; then fail 'service updated after migration failure'; fi
  else
    grep -q "^run services update sa8227601 --image ${STUB_DIGEST} .*--port 3000 " "$GCLOUD_LOG" || fail "$MODE: service not updated by digest on port 3000"
  fi
  grep -q '^artifacts repositories describe sa8227601 ' "$GCLOUD_LOG" || fail "$MODE: registry not checked before build"
  if [ "$MODE" = demo ]; then
    grep -q 'DEMO_USER_PASSWORD=sa8227601-demo-password:latest' "$GCLOUD_LOG" || fail 'demo secret missing in demo mode'
    grep -q -- '--set-env-vars NODE_ENV=production,TZ=Asia/Bangkok,SEED_DEMO_DATA=true ' "$GCLOUD_LOG" || fail 'demo mode did not turn demo seeding on'
  else
    if grep -q 'DEMO_USER_PASSWORD' "$GCLOUD_LOG"; then fail 'demo secret used in non-demo mode'; fi
    grep -q -- '--set-env-vars NODE_ENV=production,TZ=Asia/Bangkok,SEED_DEMO_DATA=false ' "$GCLOUD_LOG" || fail 'plain run did not declare SEED_DEMO_DATA=false'
  fi
  # The portal/TA provision infrastructure and IAM; the script must only update.
  if grep -Eq '^(services enable|sql |secrets (create|delete|update|versions|add-iam-policy-binding)|iam |projects |artifacts repositories create|run (jobs|services) (create|deploy|add-iam-policy-binding))' "$GCLOUD_LOG"; then
    fail "$MODE: script created infrastructure or changed IAM"
  fi
  echo "PASS: $MODE (SHA tag, digest pinning, migration gate, no infra/IAM changes)"
done

# --- Guards: refused before any gcloud call --------------------------------------
check_refused() {
  local name="$1"; shift
  export GCLOUD_LOG="$TEST_STATE_DIR/guard-$name.log"
  if env "$@" bash "$DEPLOY_SCRIPT" > /dev/null 2>&1; then fail "guard $name: deploy was not refused"; fi
  [ ! -s "$GCLOUD_LOG" ] || fail "guard $name: gcloud called before refusing"
  echo "PASS: guard $name"
}
export STUB_MODE=release
check_refused wrong-project PROJECT_ID=someone-elses-project
check_refused wrong-region REGION=us-central1
check_refused non-main STUB_BRANCH=feature/x
check_refused stale-tag IMAGE_TAG=3333333333333333333333333333333333333333
check_refused dirty-tree STUB_DIRTY=' M server/src/index.ts'
check_refused untracked STUB_DIRTY='?? scratch.txt'
check_refused not-origin-main STUB_ORIGIN_SHA=4444444444444444444444444444444444444444

# --- A missing demo secret stops the deploy before anything is built -------------
export GCLOUD_LOG="$TEST_STATE_DIR/missing-secret.log"
if STUB_MISSING_SECRET=sa8227601-demo-password bash "$DEPLOY_SCRIPT" --demo > /dev/null 2>&1; then
  fail 'missing secret: deploy was not refused'
fi
if grep -q '^docker ' "$GCLOUD_LOG"; then fail 'missing secret: image built anyway'; fi
echo 'PASS: missing demo secret refused before build'

export GCLOUD_LOG="$TEST_STATE_DIR/missing-repo.log"
if STUB_MISSING_REPO=1 bash "$DEPLOY_SCRIPT" > /dev/null 2>&1; then fail 'missing registry: deploy was not refused'; fi
if grep -q '^docker ' "$GCLOUD_LOG"; then fail 'missing registry: image built anyway'; fi
echo 'PASS: missing Artifact Registry repository refused before build'

# --- Dry run must not call gcloud at all ------------------------------------------
export GCLOUD_LOG="$TEST_STATE_DIR/dry-run-calls"
DRY_RUN=1 bash "$DEPLOY_SCRIPT" --demo > "$TEST_STATE_DIR/dry-run-output"
[ ! -f "$GCLOUD_LOG" ] || fail 'dry run called gcloud or docker'
echo 'PASS: dry run makes no gcloud calls'
