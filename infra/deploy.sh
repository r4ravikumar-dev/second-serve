#!/usr/bin/env bash
# =============================================================================
# Second Serve — Phase 5 deploy to Cloud Run (idempotent; re-run to ship a new version)
#
#   PROJECT_ID=my-project ADMIN_EMAILS=you@example.com ./infra/deploy.sh
#
# Requires infra/setup.sh to have run (reads infra/generated/infra.env).
# Steps: Cloud Build image → Cloud Run (dedicated SA, secrets, scale-to-zero, max 3)
#        → Scheduler sweep job (OIDC) → CORS + Maps referrers for the run.app URL → health check.
# =============================================================================
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
ADMIN_EMAILS="${ADMIN_EMAILS:-}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${SCRIPT_DIR}/generated/infra.env"
[ -f "$ENV_FILE" ] || { echo "Missing ${ENV_FILE}. Run infra/setup.sh first." >&2; exit 1; }
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

SERVICE="second-serve"
TAG="${IMAGE_TAG:-$(date +%Y%m%d-%H%M%S)}"   # set IMAGE_TAG to redeploy an existing image without rebuilding
IMAGE="${AR_REPO}/${SERVICE}:${TAG}"
FIREBASE=(npx -y firebase-tools@latest)

run() { local c="$1"; shift; printf '\n\033[1;34m# %s\033[0m\n+ %s\n' "$c" "$*"; "$@"; }
note() { printf '\n\033[1;32m✓ %s\033[0m\n' "$*"; }

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
URL="https://${SERVICE}-${PROJECT_NUMBER}.${REGION}.run.app"   # deterministic Cloud Run URL
note "Service URL will be ${URL}"

# ---------- public browser config (not secrets) ----------
FB_JSON="$("${FIREBASE[@]}" apps:sdkconfig WEB "$FIREBASE_WEB_APP_ID" --project "$PROJECT_ID" --json)"
fb() { printf '%s' "$FB_JSON" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const c=j.result?.sdkConfig??j.result??{};process.stdout.write(String(c[process.argv[1]]??""))})' "$1"; }
FB_API_KEY="$(fb apiKey)"; FB_AUTH_DOMAIN="$(fb authDomain)"; FB_PROJECT_ID="$(fb projectId)"; FB_APP_ID="$(fb appId)"
[ -n "$FB_API_KEY" ] || { echo "Could not read Firebase web config" >&2; exit 1; }
MAPS_MAP_ID="${NEXT_PUBLIC_MAPS_MAP_ID:-}"

# ---------- 1. build ----------
if [ -n "${IMAGE_TAG:-}" ]; then
  note "Reusing existing image ${IMAGE} (IMAGE_TAG set, skipping build)"
else
run "Build and push the image with Cloud Build (remote; no local Docker needed)" \
  gcloud builds submit "$ROOT_DIR" --project="$PROJECT_ID" --region="$REGION" \
    --config="${ROOT_DIR}/cloudbuild.yaml" \
    --service-account="projects/${PROJECT_ID}/serviceAccounts/${BUILD_SA}" \
    --gcs-source-staging-dir="gs://${BUILD_BUCKET}/source" \
    --substitutions="_DEPLOY=false,_TAG=${TAG},_REGION=${REGION},_MAPS_KEY=${NEXT_PUBLIC_MAPS_BROWSER_KEY:-},_MAPS_MAP_ID=${MAPS_MAP_ID},_FB_API_KEY=${FB_API_KEY},_FB_AUTH_DOMAIN=${FB_AUTH_DOMAIN},_FB_PROJECT_ID=${FB_PROJECT_ID},_FB_APP_ID=${FB_APP_ID}"
fi

# ---------- 2. deploy ----------
ENV_VARS="DATA_BACKEND=firestore,AUTH_MODE=firebase,AI_MODE=gemini,BLOB_MODE=gcs"
ENV_VARS+=",GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=global,GEMINI_MODEL=${GEMINI_MODEL}"
ENV_VARS+=",MEDIA_BUCKET=${MEDIA_BUCKET},SCHEDULER_SA=${SCHED_SA},PUBLIC_URL=${URL},APP_TIME_ZONE=Asia/Kolkata"
# ADMIN_EMAILS may contain commas and values contain '@' -> use '|' as the --set-env-vars delimiter.
run "Deploy to Cloud Run: dedicated SA, secrets from Secret Manager, scale to zero, max 3 instances" \
  gcloud run deploy "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
    --image="$IMAGE" \
    --service-account="$RUN_SA" \
    --allow-unauthenticated \
    --min-instances=0 --max-instances=3 \
    --cpu=1 --memory=512Mi --concurrency=80 --timeout=60 --port=8080 \
    --set-env-vars="^|^${ENV_VARS//,/|}|ADMIN_EMAILS=${ADMIN_EMAILS}" \
    --set-secrets="SESSION_SECRET=${SESSION_SECRET_NAME}:latest,PICKUP_HMAC_KEY=${PICKUP_SECRET}:latest" \
    --quiet

ACTUAL_URL="$(gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)')"
note "Deployed: ${ACTUAL_URL}"

# ---------- 3. scheduler (sweep every 15 min, OIDC-authenticated) ----------
run "Scheduler SA may invoke the service (the app also checks the OIDC token's email)" \
  gcloud run services add-iam-policy-binding "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
    --member="serviceAccount:${SCHED_SA}" --role=roles/run.invoker --format=none
if gcloud scheduler jobs describe second-serve-sweep --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1; then
  run "Update the sweep job" \
    gcloud scheduler jobs update http second-serve-sweep --project="$PROJECT_ID" --location="$REGION" \
      --schedule="*/15 * * * *" --time-zone="Asia/Kolkata" --uri="${URL}/api/cron/sweep" --http-method=POST \
      --oidc-service-account-email="$SCHED_SA" --oidc-token-audience="$URL"
else
  run "Create the sweep job (expire offers, no-shows, stock roll-over, licence expiry)" \
    gcloud scheduler jobs create http second-serve-sweep --project="$PROJECT_ID" --location="$REGION" \
      --schedule="*/15 * * * *" --time-zone="Asia/Kolkata" --uri="${URL}/api/cron/sweep" --http-method=POST \
      --oidc-service-account-email="$SCHED_SA" --oidc-token-audience="$URL"
fi

# ---------- 4. allow the run.app origin ----------
CORS_FILE="$(mktemp)"; trap 'rm -f "$CORS_FILE"' EXIT
printf '[{"origin":["%s","http://localhost:3000"],"method":["PUT","GET"],"responseHeader":["Content-Type"],"maxAgeSeconds":3600}]' "$URL" > "$CORS_FILE"
run "Let the deployed site upload to the media bucket (CORS)" \
  gcloud storage buckets update "gs://${MEDIA_BUCKET}" --cors-file="$CORS_FILE"
KEY_RES="$(gcloud services api-keys list --project="$PROJECT_ID" --filter='displayName=second-serve-maps-browser' --format='value(name)' --limit=1 || true)"
if [ -n "$KEY_RES" ]; then
  run "Allow the Maps browser key on the deployed site" \
    gcloud services api-keys update "$KEY_RES" --project="$PROJECT_ID" \
      --allowed-referrers="${URL}/*,http://localhost:3000/*"
fi

# ---------- 5. health check ----------
printf '\n\033[1;34m# Live health check\033[0m\n'
curl -fsS "${URL}/api/health" && echo

cat <<EOF

=====================================================================
 Second Serve is live: ${URL}
=====================================================================
 One-time manual step if not done yet: Firebase console → Authentication →
 Settings → Authorized domains → add ${URL#https://}
 (plus enable Email/Password + Google sign-in providers).
=====================================================================
EOF
