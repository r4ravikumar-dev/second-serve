#!/usr/bin/env bash
# =============================================================================
# Second Serve — teardown. Removes everything setup.sh / deploy.sh / ops.sh created.
# DESTRUCTIVE: deletes app data (Firestore database, uploaded files) unless KEEP_DATA=1.
#
#   PROJECT_ID=my-project ./infra/teardown.sh            # asks you to type the project ID
#   PROJECT_ID=my-project KEEP_DATA=1 ./infra/teardown.sh # keep Firestore + media bucket
#
# Left in place (free, harmless): enabled APIs, the Firebase project/web app,
# Firebase Auth users. Delete the whole GCP project instead if you want nothing left.
# =============================================================================
set -uo pipefail   # no -e: keep going if something is already gone

: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-asia-south1}"
KEEP_DATA="${KEEP_DATA:-0}"
APP="second-serve"
RUN_SA="${APP}-run@${PROJECT_ID}.iam.gserviceaccount.com"
SCHED_SA="${APP}-scheduler@${PROJECT_ID}.iam.gserviceaccount.com"
BUILD_SA="${APP}-build@${PROJECT_ID}.iam.gserviceaccount.com"

step() { local c="$1"; shift; printf '\n\033[1;34m# %s\033[0m\n+ %s\n' "$c" "$*"; "$@" || printf '\033[0;33m  (skipped: not found or already removed)\033[0m\n'; }

echo "This will DELETE Second Serve resources in project ${PROJECT_ID} (${REGION})."
[ "$KEEP_DATA" = "1" ] && echo "KEEP_DATA=1: Firestore and the media bucket will be kept." \
                       || echo "Including ALL app data: Firestore (default) database and uploaded files."
read -r -p "Type the project ID to confirm: " CONFIRM
[ "$CONFIRM" = "$PROJECT_ID" ] || { echo "Aborted."; exit 1; }

step "Delete the CI trigger (if created)" gcloud builds triggers delete "${APP}-main" --project="$PROJECT_ID" --region="$REGION" --quiet
step "Delete the scheduler job" gcloud scheduler jobs delete "${APP}-sweep" --project="$PROJECT_ID" --location="$REGION" --quiet
step "Delete the Cloud Run service" gcloud run services delete "$APP" --project="$PROJECT_ID" --region="$REGION" --quiet

for p in $(gcloud monitoring policies list --project="$PROJECT_ID" --filter='userLabels.app="second-serve"' --format='value(name)' 2>/dev/null); do
  step "Delete alert policy ${p##*/}" gcloud monitoring policies delete "$p" --project="$PROJECT_ID" --quiet
done
for u in $(gcloud monitoring uptime list-configs --project="$PROJECT_ID" --format=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log((JSON.parse(s||"[]")).filter(x=>x.displayName==="Second Serve health").map(x=>x.name).join(" ")))'); do
  step "Delete uptime check" gcloud monitoring uptime delete "$u" --project="$PROJECT_ID" --quiet
done

step "Delete the Artifact Registry repository (all images)" gcloud artifacts repositories delete "$APP" --project="$PROJECT_ID" --location="$REGION" --quiet
step "Delete the build-source bucket" gcloud storage rm --recursive "gs://${PROJECT_ID}-${APP}-build"
if [ "$KEEP_DATA" != "1" ]; then
  step "Delete the media bucket (photos, voice notes, licence documents)" gcloud storage rm --recursive "gs://${PROJECT_ID}-${APP}-media"
  step "Turn off Firestore delete protection" gcloud firestore databases update --database='(default)' --no-delete-protection --project="$PROJECT_ID"
  step "Delete the Firestore (default) database" gcloud firestore databases delete --database='(default)' --project="$PROJECT_ID" --quiet
fi

for s in pickup-code-hmac-key session-signing-key; do
  step "Delete secret ${s}" gcloud secrets delete "$s" --project="$PROJECT_ID" --quiet
done
for k in $(gcloud services api-keys list --project="$PROJECT_ID" --filter="displayName=${APP}-maps-browser" --format='value(name)' 2>/dev/null); do
  step "Delete the Maps browser key" gcloud services api-keys delete "$k" --project="$PROJECT_ID" --quiet
done

BILLING="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null)"; BILLING="${BILLING#billingAccounts/}"
if [ -n "$BILLING" ]; then
  for b in $(gcloud billing budgets list --billing-account="$BILLING" --filter="displayName~^${APP}-monthly" --format='value(name)' 2>/dev/null); do
    step "Delete budget ${b##*/}" gcloud billing budgets delete "$b" --quiet
  done
fi

for role in roles/datastore.user roles/aiplatform.user roles/logging.logWriter roles/run.developer; do
  for sa in "$RUN_SA" "$BUILD_SA"; do
    gcloud projects remove-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${sa}" --role="$role" --condition=None --format=none >/dev/null 2>&1 || true
  done
done
for sa in "$RUN_SA" "$SCHED_SA" "$BUILD_SA"; do
  step "Delete service account ${sa%%@*}" gcloud iam service-accounts delete "$sa" --project="$PROJECT_ID" --quiet
done

echo
echo "Teardown finished. Remaining: enabled APIs, Firebase project/web app and Auth users (free)."
echo "Alert email channel 'Second Serve alerts' is kept (it may be shared); delete it in Monitoring → Notification channels if unused."
