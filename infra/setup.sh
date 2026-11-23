#!/usr/bin/env bash
# =============================================================================
# Second Serve — Phase 2 infrastructure bootstrap (idempotent; safe to re-run)
#
# Creates: APIs, Firebase on the project + web app, Firestore (default) DB,
# rules/indexes, media + build-source buckets, Artifact Registry repo with a
# cleanup policy, Secret Manager secret, 3 least-privilege service accounts,
# IAM bindings, and a $5 budget with 50/90/100% alerts.
#
# Does NOT create: the Cloud Run service, the Cloud Scheduler job, alert
# policies (Phase 5/6 — they need the deployed service URL).
#
# Usage:
#   PROJECT_ID=my-project ./infra/setup.sh
# Optional env:
#   REGION=asia-south1            # Cloud Run, Firestore, Storage, AR, secrets
#   BUDGET_USD=5                  # monthly budget amount
#   CORS_ORIGINS="http://localhost:3000"   # comma-separated; Phase 5 adds the run.app URL
#   SMOKE_TEST_GEMINI=1           # make one tiny Gemini call to verify access (< $0.001)
#   GEMINI_MODEL=gemini-3.5-flash-lite
#   MAPS_REFERRERS="http://localhost:3000/*"  # comma-separated; Phase 5 adds the run.app URL
# =============================================================================
set -euo pipefail

# ---------- configuration ----------------------------------------------------
: "${PROJECT_ID:?Set PROJECT_ID, e.g. PROJECT_ID=my-project ./infra/setup.sh}"
REGION="${REGION:-asia-south1}"
BUDGET_USD="${BUDGET_USD:-5}"
CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:3000}"
SMOKE_TEST_GEMINI="${SMOKE_TEST_GEMINI:-0}"
GEMINI_MODEL="${GEMINI_MODEL:-gemini-3.5-flash-lite}"
MAPS_REFERRERS="${MAPS_REFERRERS:-http://localhost:3000/*}"
MAPS_KEY_NAME="${APP:-second-serve}-maps-browser"

APP="second-serve"
MEDIA_BUCKET="${PROJECT_ID}-${APP}-media"
BUILD_BUCKET="${PROJECT_ID}-${APP}-build"
AR_REPO="${APP}"
SECRET_PICKUP="pickup-code-hmac-key"
SECRET_SESSION="session-signing-key"
BUDGET_NAME="${APP}-monthly-${BUDGET_USD}usd"

RUN_SA_NAME="${APP}-run"
SCHED_SA_NAME="${APP}-scheduler"
BUILD_SA_NAME="${APP}-build"
RUN_SA="${RUN_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
SCHED_SA="${SCHED_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SA="${BUILD_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_DIR="${SCRIPT_DIR}/config"
GEN_DIR="${SCRIPT_DIR}/generated"
FIREBASE=(npx -y firebase-tools@latest)

# ---------- helpers ------------------------------------------------------------
# run "<one-line comment>" <command...>  — prints the comment and the command, then runs it.
run() {
  local comment="$1"; shift
  printf '\n\033[1;34m# %s\033[0m\n+ %s\n' "$comment" "$*"
  "$@"
}
note()  { printf '\n\033[1;32m✓ %s\033[0m\n' "$*"; }
skip()  { printf '\n\033[0;33m↷ %s (already exists — skipping)\033[0m\n' "$*"; }
die()   { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }
exists() { "$@" >/dev/null 2>&1; }   # true if the describe-style command succeeds

# ---------- 0. preflight -------------------------------------------------------
command -v gcloud >/dev/null || die "gcloud CLI not found. Install: brew install --cask google-cloud-sdk"
command -v node   >/dev/null || die "node not found (needed for Firebase CLI via npx)."
command -v openssl >/dev/null || die "openssl not found (needed to generate the HMAC key)."

ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | head -n1)"
[ -n "$ACCOUNT" ] || die "No active gcloud account. Run: gcloud auth login"
note "Using gcloud account: ${ACCOUNT}"

exists gcloud projects describe "$PROJECT_ID" || die "Project ${PROJECT_ID} not found or no access."

run "Set the active project for this gcloud configuration" \
  gcloud config set project "$PROJECT_ID"
run "Set the default Cloud Run region" \
  gcloud config set run/region "$REGION"

# One billing lookup, retried: the Cloud Billing API can return 429 on shared client quota.
BILLING_INFO=""
for attempt in 1 2 3 4 5; do
  BILLING_INFO="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingEnabled,billingAccountName)' 2>/dev/null)" && break
  printf 'Billing API busy (attempt %s/5), retrying in %ss...\n' "$attempt" "$((attempt * 10))"
  sleep "$((attempt * 10))"
done
[ -n "$BILLING_INFO" ] || die "Could not read billing info for ${PROJECT_ID} (Cloud Billing API unavailable). Re-run in a minute."
BILLING_ENABLED="$(printf '%s' "$BILLING_INFO" | cut -f1)"
[ "$BILLING_ENABLED" = "True" ] || die "Billing is not enabled on ${PROJECT_ID}."
BILLING_ACCOUNT="$(printf '%s' "$BILLING_INFO" | cut -f2)"
BILLING_ACCOUNT="${BILLING_ACCOUNT#billingAccounts/}"
note "Billing account: ${BILLING_ACCOUNT}"

# ---------- 1. enable APIs -----------------------------------------------------
run "Enable every API the app, build and ops tooling need (no-op if already enabled)" \
  gcloud services enable \
    run.googleapis.com \
    cloudbuild.googleapis.com \
    artifactregistry.googleapis.com \
    firestore.googleapis.com \
    storage.googleapis.com \
    aiplatform.googleapis.com \
    secretmanager.googleapis.com \
    cloudscheduler.googleapis.com \
    iam.googleapis.com \
    iamcredentials.googleapis.com \
    firebase.googleapis.com \
    identitytoolkit.googleapis.com \
    cloudbilling.googleapis.com \
    billingbudgets.googleapis.com \
    logging.googleapis.com \
    monitoring.googleapis.com \
    clouderrorreporting.googleapis.com \
    maps-backend.googleapis.com \
    apikeys.googleapis.com \
    --project="$PROJECT_ID"

# ---------- 2. region availability check --------------------------------------
printf '\n\033[1;34m# Verify Cloud Run and Firestore are offered in %s\033[0m\n' "$REGION"
gcloud run regions list --format='value(locationId)' | grep -qx "$REGION" \
  || die "Cloud Run is not available in ${REGION}. Pick another REGION."
gcloud firestore locations list --format='value(locationId)' | grep -qx "$REGION" \
  || die "Firestore is not available in ${REGION}. Pick another REGION."
note "Cloud Run and Firestore are available in ${REGION}. Gemini uses the 'global' endpoint."

# ---------- 3. service accounts ----------------------------------------------
create_sa() {  # name, display name
  if exists gcloud iam service-accounts describe "$1@${PROJECT_ID}.iam.gserviceaccount.com"; then
    skip "Service account $1"
  else
    run "Create dedicated service account '$1' ($2)" \
      gcloud iam service-accounts create "$1" --display-name="$2" --project="$PROJECT_ID"
  fi
}
create_sa "$RUN_SA_NAME"   "Second Serve Cloud Run runtime"
create_sa "$SCHED_SA_NAME" "Second Serve Cloud Scheduler invoker"
create_sa "$BUILD_SA_NAME" "Second Serve Cloud Build deployer"

# IAM changes can take a few seconds to propagate after SA creation.
for sa in "$RUN_SA" "$SCHED_SA" "$BUILD_SA"; do
  for _ in 1 2 3 4 5 6; do exists gcloud iam service-accounts describe "$sa" && break; sleep 5; done
done

# ---------- 4. project-level IAM (minimal; no Owner/Editor) -------------------
bind_project() {  # member, role, comment
  run "$3" gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="$1" --role="$2" --condition=None --format=none
}
bind_project "serviceAccount:${RUN_SA}"   roles/datastore.user      "Runtime SA: read/write Firestore"
bind_project "serviceAccount:${RUN_SA}"   roles/aiplatform.user     "Runtime SA: call Gemini models"
# Project-level run.developer is only needed before the service exists; infra/ops.sh
# then narrows it to the second-serve service. Don't re-grant it on re-runs.
if ! gcloud run services describe second-serve --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1; then
  bind_project "serviceAccount:${BUILD_SA}" roles/run.developer   "Build SA: deploy Cloud Run revisions (narrowed to the service by infra/ops.sh)"
fi
bind_project "serviceAccount:${BUILD_SA}" roles/logging.logWriter   "Build SA: write build logs to Cloud Logging"

run "Runtime SA may sign blobs as itself (needed for V4 signed upload URLs)" \
  gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
    --member="serviceAccount:${RUN_SA}" --role=roles/iam.serviceAccountTokenCreator \
    --project="$PROJECT_ID" --format=none
run "Build SA may deploy Cloud Run services that run as the runtime SA" \
  gcloud iam service-accounts add-iam-policy-binding "$RUN_SA" \
    --member="serviceAccount:${BUILD_SA}" --role=roles/iam.serviceAccountUser \
    --project="$PROJECT_ID" --format=none

# ---------- 5. Firebase on the project + web app ------------------------------
printf '\n\033[1;34m# Check whether Firebase is already enabled on %s\033[0m\n' "$PROJECT_ID"
if "${FIREBASE[@]}" projects:list --json 2>/dev/null \
     | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s).result||[];process.exit(r.some(p=>p.projectId===process.argv[1])?0:1)})' "$PROJECT_ID"; then
  skip "Firebase on ${PROJECT_ID}"
else
  run "Add Firebase resources to the existing Google Cloud project" \
    "${FIREBASE[@]}" projects:addfirebase "$PROJECT_ID"
fi

mkdir -p "$GEN_DIR"
WEB_APP_ID="$("${FIREBASE[@]}" apps:list WEB --project "$PROJECT_ID" --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=(JSON.parse(s).result||[]).find(a=>a.displayName==="second-serve-web");process.stdout.write(r?r.appId:"")})')"
if [ -n "$WEB_APP_ID" ]; then
  skip "Firebase web app second-serve-web (${WEB_APP_ID})"
else
  run "Register the Firebase web app used by the browser sign-in SDK" \
    "${FIREBASE[@]}" apps:create WEB second-serve-web --project "$PROJECT_ID"
  WEB_APP_ID="$("${FIREBASE[@]}" apps:list WEB --project "$PROJECT_ID" --json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=(JSON.parse(s).result||[]).find(a=>a.displayName==="second-serve-web");process.stdout.write(r?r.appId:"")})')"
fi
[ -n "$WEB_APP_ID" ] || die "Could not determine the Firebase web app ID."

run "Save the public Firebase web config (not a secret) for the Next.js client" \
  "${FIREBASE[@]}" apps:sdkconfig WEB "$WEB_APP_ID" --project "$PROJECT_ID" \
    --out "${GEN_DIR}/firebase-web-config.js"

# ---------- 6. Firestore (default) database + rules + indexes -----------------
if exists gcloud firestore databases describe --database='(default)' --project="$PROJECT_ID"; then
  skip "Firestore (default) database"
else
  run "Create the Firestore Native (default) database (only the default DB gets the free tier)" \
    gcloud firestore databases create --database='(default)' --location="$REGION" \
      --type=firestore-native --delete-protection --project="$PROJECT_ID"
fi

run "Deploy deny-all client security rules and composite indexes (all access goes through the API)" \
  bash -c "cd '$ROOT_DIR' && ${FIREBASE[*]} deploy --only firestore:rules,firestore:indexes --project '$PROJECT_ID' --non-interactive"

# ---------- 7. Cloud Storage buckets -----------------------------------------
CORS_FILE="$(mktemp)"; trap 'rm -f "$CORS_FILE"' EXIT
node -e '
  const origins = process.argv[1].split(",").map(s => s.trim()).filter(Boolean);
  process.stdout.write(JSON.stringify([{ origin: origins, method: ["PUT","GET"],
    responseHeader: ["Content-Type"], maxAgeSeconds: 3600 }], null, 2));
' "$CORS_ORIGINS" > "$CORS_FILE"

if exists gcloud storage buckets describe "gs://${MEDIA_BUCKET}"; then
  skip "Bucket gs://${MEDIA_BUCKET}"
else
  run "Create the private media bucket (photos/voice notes) in ${REGION}" \
    gcloud storage buckets create "gs://${MEDIA_BUCKET}" --project="$PROJECT_ID" \
      --location="$REGION" --uniform-bucket-level-access --public-access-prevention \
      --soft-delete-duration=0 --lifecycle-file="${CONFIG_DIR}/lifecycle-media.json"
fi
run "Apply the 30-day delete lifecycle and browser-upload CORS to the media bucket" \
  gcloud storage buckets update "gs://${MEDIA_BUCKET}" \
    --lifecycle-file="${CONFIG_DIR}/lifecycle-media.json" --cors-file="$CORS_FILE"

if exists gcloud storage buckets describe "gs://${BUILD_BUCKET}"; then
  skip "Bucket gs://${BUILD_BUCKET}"
else
  run "Create the private Cloud Build source-staging bucket" \
    gcloud storage buckets create "gs://${BUILD_BUCKET}" --project="$PROJECT_ID" \
      --location="$REGION" --uniform-bucket-level-access --public-access-prevention \
      --soft-delete-duration=0 --lifecycle-file="${CONFIG_DIR}/lifecycle-build.json"
fi

run "Runtime SA: manage objects in the media bucket only" \
  gcloud storage buckets add-iam-policy-binding "gs://${MEDIA_BUCKET}" \
    --member="serviceAccount:${RUN_SA}" --role=roles/storage.objectAdmin --format=none
run "Build SA: read uploaded source archives from the build bucket only" \
  gcloud storage buckets add-iam-policy-binding "gs://${BUILD_BUCKET}" \
    --member="serviceAccount:${BUILD_SA}" --role=roles/storage.objectViewer --format=none

# ---------- 8. Artifact Registry --------------------------------------------
if exists gcloud artifacts repositories describe "$AR_REPO" --location="$REGION" --project="$PROJECT_ID"; then
  skip "Artifact Registry repo ${AR_REPO}"
else
  run "Create the Docker repository for app images" \
    gcloud artifacts repositories create "$AR_REPO" --repository-format=docker \
      --location="$REGION" --description="Second Serve images" --project="$PROJECT_ID"
fi
run "Keep only the 3 newest images so storage stays inside the free 0.5 GB" \
  gcloud artifacts repositories set-cleanup-policies "$AR_REPO" --location="$REGION" \
    --project="$PROJECT_ID" --policy="${CONFIG_DIR}/ar-cleanup-policy.json" --no-dry-run
run "Build SA: push images to this repository only" \
  gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" --location="$REGION" \
    --project="$PROJECT_ID" --member="serviceAccount:${BUILD_SA}" \
    --role=roles/artifactregistry.writer --format=none

# ---------- 9. Secret Manager -------------------------------------------------
# Two random keys: pickup-code HMAC/encryption key and session-cookie signing key.
for SECRET in "$SECRET_PICKUP" "$SECRET_SESSION"; do
  if exists gcloud secrets describe "$SECRET" --project="$PROJECT_ID"; then
    skip "Secret ${SECRET}"
  else
    run "Create secret ${SECRET}, stored only in ${REGION}" \
      gcloud secrets create "$SECRET" --replication-policy=user-managed \
        --locations="$REGION" --project="$PROJECT_ID"
  fi
  if [ -n "$(gcloud secrets versions list "$SECRET" --project="$PROJECT_ID" \
              --filter='state=ENABLED' --format='value(name)' --limit=1)" ]; then
    skip "An enabled version of ${SECRET}"
  else
    printf '\n\033[1;34m# Generate a random 48-byte key for %s (value never printed)\033[0m\n' "$SECRET"
    printf '+ openssl rand -base64 48 | gcloud secrets versions add %s --data-file=-\n' "$SECRET"
    openssl rand -base64 48 | tr -d '\n' \
      | gcloud secrets versions add "$SECRET" --data-file=- --project="$PROJECT_ID" --format=none
  fi
  run "Runtime SA: read secret ${SECRET} only" \
    gcloud secrets add-iam-policy-binding "$SECRET" --project="$PROJECT_ID" \
      --member="serviceAccount:${RUN_SA}" --role=roles/secretmanager.secretAccessor --format=none
done

# ---------- 9b. Maps JavaScript API browser key -------------------------------
# Browser keys are public by design; safety comes from API + referrer restrictions
# and the daily quota cap (manual step printed at the end).
MAPS_KEY_RESOURCE="$(gcloud services api-keys list --project="$PROJECT_ID" \
  --filter="displayName=${MAPS_KEY_NAME}" --format='value(name)' --limit=1 || true)"
if [ -n "$MAPS_KEY_RESOURCE" ]; then
  skip "API key ${MAPS_KEY_NAME}"
  run "Re-apply referrer restrictions to the Maps browser key" \
    gcloud services api-keys update "$MAPS_KEY_RESOURCE" --project="$PROJECT_ID" \
      --allowed-referrers="$MAPS_REFERRERS"
else
  run "Create a browser key limited to the Maps JavaScript API and the app's referrers" \
    gcloud services api-keys create --project="$PROJECT_ID" --display-name="$MAPS_KEY_NAME" \
      --api-target=service=maps-backend.googleapis.com \
      --allowed-referrers="$MAPS_REFERRERS"
  MAPS_KEY_RESOURCE="$(gcloud services api-keys list --project="$PROJECT_ID" \
    --filter="displayName=${MAPS_KEY_NAME}" --format='value(name)' --limit=1 || true)"
fi
[ -n "$MAPS_KEY_RESOURCE" ] || die "Could not find the Maps API key after creating it."
MAPS_BROWSER_KEY="$(gcloud services api-keys get-key-string "$MAPS_KEY_RESOURCE" \
  --project="$PROJECT_ID" --format='value(keyString)')"

# ---------- 10. Budget + alerts -----------------------------------------------
if gcloud billing budgets list --billing-account="$BILLING_ACCOUNT" --format='value(displayName)' 2>/dev/null \
     | grep -qx "$BUDGET_NAME"; then
  skip "Budget ${BUDGET_NAME}"
else
  run "Create a \$${BUDGET_USD}/month budget for this project with alerts at 50%, 90%, 100%" \
    gcloud billing budgets create --billing-account="$BILLING_ACCOUNT" \
      --display-name="$BUDGET_NAME" --budget-amount="${BUDGET_USD}USD" \
      --filter-projects="projects/${PROJECT_ID}" \
      --threshold-rule=percent=0.5 --threshold-rule=percent=0.9 --threshold-rule=percent=1.0
fi

# ---------- 11. optional Gemini smoke test -----------------------------------
if [ "$SMOKE_TEST_GEMINI" = "1" ]; then
  printf '\n\033[1;34m# One tiny Gemini call on the global endpoint to prove model access\033[0m\n'
  TOKEN="$(gcloud auth print-access-token)"
  curl -sS -X POST \
    -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
    "https://aiplatform.googleapis.com/v1beta1/projects/${PROJECT_ID}/locations/global/publishers/google/models/${GEMINI_MODEL}:generateContent" \
    -d '{"contents":[{"role":"user","parts":[{"text":"Reply with the single word OK."}]}],"generationConfig":{"maxOutputTokens":5}}' \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(j.error){console.error("Gemini error:",j.error.message);process.exit(1)}console.log("Gemini replied:",j.candidates?.[0]?.content?.parts?.[0]?.text?.trim())})'
fi

# ---------- 12. write non-secret outputs for Phase 3 ---------------------------
cat > "${GEN_DIR}/infra.env" <<EOF
# Generated by infra/setup.sh — non-secret values only.
GOOGLE_CLOUD_PROJECT=${PROJECT_ID}
GOOGLE_CLOUD_LOCATION=global
REGION=${REGION}
MEDIA_BUCKET=${MEDIA_BUCKET}
BUILD_BUCKET=${BUILD_BUCKET}
AR_REPO=${REGION}-docker.pkg.dev/${PROJECT_ID}/${AR_REPO}
RUN_SA=${RUN_SA}
SCHED_SA=${SCHED_SA}
BUILD_SA=${BUILD_SA}
PICKUP_SECRET=${SECRET_PICKUP}
SESSION_SECRET_NAME=${SECRET_SESSION}
GEMINI_MODEL=${GEMINI_MODEL}
FIREBASE_WEB_APP_ID=${WEB_APP_ID}
# Browser key: public by design, restricted to Maps JS API + referrers, quota-capped.
NEXT_PUBLIC_MAPS_BROWSER_KEY=${MAPS_BROWSER_KEY}
EOF
note "Wrote ${GEN_DIR}/infra.env and ${GEN_DIR}/firebase-web-config.js"

cat <<EOF

=====================================================================
 Phase 2 bootstrap complete for ${PROJECT_ID} (${REGION})
=====================================================================
 Three manual console steps:
 1) Sign-in providers:
    https://console.firebase.google.com/project/${PROJECT_ID}/authentication
    → Get started → Sign-in method → enable "Email/Password" and "Google".
 2) MAPS BUDGET GUARD (do not skip — overage is \$7 per 1,000 map loads):
    https://console.cloud.google.com/apis/api/maps-backend.googleapis.com/quotas?project=${PROJECT_ID}
    → edit the "map loads per day" quota → set it to 300.
 3) Map ID for advanced markers:
    https://console.cloud.google.com/google/maps-apis/studio/maps?project=${PROJECT_ID}
    (Google Maps Platform → Map management) → Create Map ID (JavaScript) → put it in NEXT_PUBLIC_MAPS_MAP_ID.
 Phase 5 will add the Cloud Run domain to Firebase Authorized domains, the
 Maps key referrers and bucket CORS, create the Scheduler job, and grant
 run.invoker to ${SCHED_SA}.
=====================================================================
EOF
