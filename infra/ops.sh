#!/usr/bin/env bash
# =============================================================================
# Second Serve — Phase 6 operations setup (idempotent; safe to re-run)
#
#   PROJECT_ID=my-project ALERT_EMAIL=oncall@example.com ./infra/ops.sh
#
# Creates/updates: email notification channel, /api/health uptime check,
# 7 alert policies (5xx SLO burn, p95 latency, instance ceiling, unhandled errors,
# Gemini failures, sweep failures, uptime), and narrows the build SA's
# run.developer role from project-level to the one Cloud Run service.
# Alerting is free until at least 2027-09-01 (then ~$0.35/metric reference/month).
# =============================================================================
set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${ALERT_EMAIL:?Set ALERT_EMAIL (where alerts are emailed)}"
REGION="${REGION:-asia-south1}"
SERVICE="second-serve"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MON_DIR="${SCRIPT_DIR}/monitoring"
BUILD_SA="second-serve-build@${PROJECT_ID}.iam.gserviceaccount.com"
API="https://monitoring.googleapis.com/v3/projects/${PROJECT_ID}"

run() { local c="$1"; shift; printf '\n\033[1;34m# %s\033[0m\n+ %s\n' "$c" "$*"; "$@"; }
note() { printf '\n\033[1;32m✓ %s\033[0m\n' "$*"; }
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

gcloud run services describe "$SERVICE" --project="$PROJECT_ID" --region="$REGION" --format='value(status.url)' >/dev/null \
  || { echo "Cloud Run service ${SERVICE} not found — run infra/deploy.sh first." >&2; exit 1; }
URL_HOST="${SERVICE}-$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)').${REGION}.run.app"

# ---------- 1. notification channel (REST: no GA gcloud command) ----------
TOKEN="$(gcloud auth print-access-token)"
api() { curl -fsS -H "Authorization: Bearer ${TOKEN}" -H "x-goog-user-project: ${PROJECT_ID}" -H "Content-Type: application/json" "$@"; }
printf '\n\033[1;34m# Find or create the email notification channel for %s\033[0m\n' "$ALERT_EMAIL"
CHANNEL="$(api "${API}/notificationChannels" | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s||"{}");
  const c=(j.notificationChannels||[]).find(c=>c.type==="email"&&c.labels?.email_address===process.argv[1]);process.stdout.write(c?c.name:"")})' "$ALERT_EMAIL")"
if [ -z "$CHANNEL" ]; then
  printf '+ POST %s/notificationChannels (type=email)\n' "$API"
  CHANNEL="$(api -X POST "${API}/notificationChannels" \
    -d "$(node -e 'console.log(JSON.stringify({type:"email",displayName:"Second Serve alerts",labels:{email_address:process.argv[1]}}))' "$ALERT_EMAIL")" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).name))')"
fi
note "Notification channel: ${CHANNEL}"

# ---------- 2. uptime check on /api/health ----------
uptime_name() {  # client-side match: filter key naming differs across gcloud versions
  gcloud monitoring uptime list-configs --project="$PROJECT_ID" --format=json 2>/dev/null \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const c=(JSON.parse(s||"[]")).find(x=>x.displayName==="Second Serve health");process.stdout.write(c?c.name:"")})'
}
CHECK_NAME="$(uptime_name)"
if [ -z "$CHECK_NAME" ]; then
  run "Create an HTTPS uptime check on /api/health every 15 min from 3 regions" \
    gcloud monitoring uptime create "Second Serve health" --project="$PROJECT_ID" \
      --resource-type=uptime-url --resource-labels="host=${URL_HOST},project_id=${PROJECT_ID}" \
      --protocol=https --path=/api/health --period=15 --timeout=10 \
      --regions=asia-pacific,europe,usa-virginia
  CHECK_NAME="$(uptime_name)"
fi
CHECK_ID="${CHECK_NAME##*/}"
note "Uptime check: ${CHECK_ID}"

# ---------- 3. alert policies (create or update by display name) ----------
for tpl in "$MON_DIR"/*.json; do
  out="${TMP}/$(basename "$tpl")"
  sed -e "s#__SERVICE__#${SERVICE}#g" -e "s#__CHANNEL__#${CHANNEL}#g" -e "s#__CHECK_ID__#${CHECK_ID}#g" "$tpl" > "$out"
  NAME="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).displayName)' "$out")"
  EXISTING="$(gcloud monitoring policies list --project="$PROJECT_ID" --filter="displayName=\"${NAME}\"" --format='value(name)' | head -n1 || true)"
  if [ -n "$EXISTING" ]; then
    run "Update alert policy: ${NAME}" gcloud monitoring policies update "$EXISTING" --project="$PROJECT_ID" --policy-from-file="$out" --format=none
  else
    run "Create alert policy: ${NAME}" gcloud monitoring policies create --project="$PROJECT_ID" --policy-from-file="$out" --format=none
  fi
done

# ---------- 4. least privilege: narrow build SA to this one service ----------
run "Build SA: run.developer on the ${SERVICE} service only" \
  gcloud run services add-iam-policy-binding "$SERVICE" --project="$PROJECT_ID" --region="$REGION" \
    --member="serviceAccount:${BUILD_SA}" --role=roles/run.developer --format=none
if gcloud projects get-iam-policy "$PROJECT_ID" --flatten='bindings[].members' \
     --filter="bindings.role=roles/run.developer AND bindings.members=serviceAccount:${BUILD_SA}" --format='value(bindings.role)' | grep -q .; then
  run "Build SA: remove the temporary project-level run.developer (from Phase 2)" \
    gcloud projects remove-iam-policy-binding "$PROJECT_ID" \
      --member="serviceAccount:${BUILD_SA}" --role=roles/run.developer --condition=None --format=none
fi

# ---------- 5. Error Reporting API (reads ReportedErrorEvent logs) ----------
run "Ensure Error Reporting is enabled" gcloud services enable clouderrorreporting.googleapis.com --project="$PROJECT_ID"

cat <<EOF

=====================================================================
 Operations configured for ${PROJECT_ID}
=====================================================================
 Alerts email:   ${ALERT_EMAIL}
 Policies:       https://console.cloud.google.com/monitoring/alerting?project=${PROJECT_ID}
 Errors:         https://console.cloud.google.com/errors?project=${PROJECT_ID}
 Logs (app):     https://console.cloud.google.com/logs/query;query=resource.labels.service_name%3D%22${SERVICE}%22?project=${PROJECT_ID}
 Budget:         \$5/month with 50/90/100% alerts (from setup.sh)
 Optional:       Error Reporting → "Turn on notifications" to also email on new error types.
=====================================================================
EOF
