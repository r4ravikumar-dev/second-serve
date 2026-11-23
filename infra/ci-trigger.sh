#!/usr/bin/env bash
# =============================================================================
# Second Serve — CI/CD trigger: every push to main runs cloudbuild.yaml
# (test → build → push → deploy) as the least-privilege build service account.
#
# Prerequisites (one-time, needs a browser for GitHub OAuth):
#   1. Put this project in a GitHub repository.
#   2. Cloud Console → Cloud Build → Repositories (2nd gen) → Create host connection
#      → GitHub, region asia-south1, name it e.g. "github" and install the GitHub app
#      on your repo.
#
#   PROJECT_ID=my-project GITHUB_REPO_URL=https://github.com/<owner>/<repo>.git \
#   CONNECTION=github ./infra/ci-trigger.sh
# =============================================================================
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${GITHUB_REPO_URL:?Set GITHUB_REPO_URL, e.g. https://github.com/owner/repo.git}"
: "${CONNECTION:?Set CONNECTION (the Cloud Build GitHub connection name)}"
REGION="${REGION:-asia-south1}"
BRANCH="${BRANCH:-^main$}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck disable=SC1091
set -a; . "${SCRIPT_DIR}/generated/infra.env"; set +a
REPO_ID="$(basename "${GITHUB_REPO_URL%.git}")"

run() { local c="$1"; shift; printf '\n\033[1;34m# %s\033[0m\n+ %s\n' "$c" "$*"; "$@"; }

gcloud builds connections describe "$CONNECTION" --project="$PROJECT_ID" --region="$REGION" >/dev/null \
  || { echo "Connection ${CONNECTION} not found in ${REGION}. Create it in the console first (see header)." >&2; exit 1; }

if ! gcloud builds repositories describe "$REPO_ID" --connection="$CONNECTION" --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
  run "Link the GitHub repository to Cloud Build" \
    gcloud builds repositories create "$REPO_ID" --remote-uri="$GITHUB_REPO_URL" \
      --connection="$CONNECTION" --project="$PROJECT_ID" --region="$REGION"
fi

# Public browser config is passed as substitutions (not secrets).
FB_JSON="$(npx -y firebase-tools@latest apps:sdkconfig WEB "$FIREBASE_WEB_APP_ID" --project "$PROJECT_ID" --json)"
fb() { printf '%s' "$FB_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=JSON.parse(s).result?.sdkConfig??{};process.stdout.write(String(c[process.argv[1]]??""))})' "$1"; }
SUBS="_DEPLOY=true,_REGION=${REGION},_MAPS_KEY=${NEXT_PUBLIC_MAPS_BROWSER_KEY:-},_MAPS_MAP_ID=${NEXT_PUBLIC_MAPS_MAP_ID:-},_FB_API_KEY=$(fb apiKey),_FB_AUTH_DOMAIN=$(fb authDomain),_FB_PROJECT_ID=$(fb projectId),_FB_APP_ID=$(fb appId),_TAG=\$SHORT_SHA"

if gcloud builds triggers describe second-serve-main --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
  run "Remove the old trigger so it can be recreated with current settings" \
    gcloud builds triggers delete second-serve-main --project="$PROJECT_ID" --region="$REGION" --quiet
fi
run "Create the push-to-main trigger (test → build → deploy)" \
  gcloud builds triggers create github --name=second-serve-main --project="$PROJECT_ID" --region="$REGION" \
    --repository="projects/${PROJECT_ID}/locations/${REGION}/connections/${CONNECTION}/repositories/${REPO_ID}" \
    --branch-pattern="$BRANCH" --build-config=cloudbuild.yaml \
    --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
    --include-logs-with-status \
    --substitutions="$SUBS"

echo "Trigger ready: pushes to ${BRANCH} on ${GITHUB_REPO_URL} now test, build and deploy."
