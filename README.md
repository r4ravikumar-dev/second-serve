# Second Serve

AI-assisted food rescue: food businesses track live stock, turn likely surplus into discounted pickups or verified donations, and customers and NGOs find it on a live map. English and हिंदी.

> Status: **Live on Cloud Run** at https://second-serve-799057842599.asia-south1.run.app (project `prime-agency-466812-n5`, asia-south1). All six phases done; see Operate below.

## Architecture (summary)

One Cloud Run service (Next.js UI and API, scales to zero) → Firestore, Cloud Storage, Firebase Auth, Gemini (`gemini-3.5-flash-lite`, global endpoint, Hindi + English), Maps JavaScript API (quota-capped live maps), Secret Manager, one Cloud Scheduler job. The browser listens to a read-only `publicOffers` collection for real-time map updates. Built by Cloud Build into Artifact Registry. Target cost is about $0.40–$2.20/month against a $5 cap.

- Full design, diagram, data model, endpoints, cost: [docs/DESIGN.md](docs/DESIGN.md)
- Decisions and trade-offs: [DECISIONS.md](DECISIONS.md)
- UI design system (Visit Health DNA v2.0) mapping: [docs/UI-DESIGN-SYSTEM.md](docs/UI-DESIGN-SYSTEM.md); tokens in `src/styles/dna-tokens.css`

## Repository layout (so far)

```
infra/setup.sh                    # Phase 2: idempotent bootstrap (gcloud + Firebase CLI)
infra/config/lifecycle-media.json # media bucket: delete objects after 30 days
infra/config/lifecycle-build.json # build-source bucket: delete after 7 days
infra/config/ar-cleanup-policy.json # Artifact Registry: keep the 3 newest images
firebase.json                     # points the Firebase CLI at rules + indexes
firestore.rules                   # deny-all, except read-only publicOffers (live map)
firestore.indexes.json            # composite indexes for offers/reservations/donations
src/styles/dna-tokens.css         # DNA Design System v2.0 tokens (vendored, do not edit)
docs/DESIGN.md · docs/UI-DESIGN-SYSTEM.md · DECISIONS.md · README.md
```

## Prerequisites

- A Google Cloud project with billing linked. Your account needs Owner, or the equivalent admin roles, on the project, plus **Billing Account Administrator or Billing Account Costs Manager** on the billing account (to create the budget).
- `gcloud` CLI:
  ```bash
  brew install --cask google-cloud-sdk
  ```
  ```bash
  gcloud auth login
  ```
- Node.js ≥ 20 (used for the Firebase CLI via `npx` and for the app)
- Firebase CLI sign-in (same Google account):
  ```bash
  npx -y firebase-tools@latest login
  ```
- `openssl` (preinstalled on macOS)

## Phase 2: bootstrap the infrastructure

```bash
PROJECT_ID=your-project-id ./infra/setup.sh
```

Optional variables: `REGION` (default `asia-south1`), `BUDGET_USD` (default `5`), `CORS_ORIGINS` (default `http://localhost:3000`), `MAPS_REFERRERS` (default `http://localhost:3000/*`), `SMOKE_TEST_GEMINI=1` (one tiny Gemini call to prove model access).

What it creates (re-running skips anything that already exists):

| Resource | Name |
|---|---|
| APIs | Run, Build, Artifact Registry, Firestore, Storage, Gemini (aiplatform), Secret Manager, Scheduler, IAM, IAM Credentials, Firebase, Identity Toolkit, Billing, Budgets, Logging, Monitoring, Error Reporting, **Maps JavaScript API**, API Keys |
| Service accounts | `second-serve-run` (runtime), `second-serve-scheduler` (cron invoker), `second-serve-build` (CI deployer) |
| Firebase | Firebase enabled on the project, web app `second-serve-web` |
| Firestore | `(default)` Native database in `$REGION`, delete-protected, rules (read-only `publicOffers`, everything else API-only), 10 composite indexes |
| Storage | `gs://$PROJECT_ID-second-serve-media` (private, 30-day lifecycle, CORS), `gs://$PROJECT_ID-second-serve-build` (7-day lifecycle) |
| Artifact Registry | Docker repo `second-serve` with keep-3 cleanup policy |
| Secret Manager | `pickup-code-hmac-key` (random value, stored in `$REGION` only, never printed) |
| Maps browser key | `second-serve-maps-browser`, restricted to the Maps JavaScript API + `MAPS_REFERRERS` (public by design, not a secret) |
| Budget | `second-serve-monthly-5usd`, alerts at 50/90/100% (emailed to billing admins) |

**Three manual console steps afterwards** (the script prints the links):
1. Firebase console → Authentication → Get started → Sign-in method → enable **Email/Password** and **Google**.
2. **Maps budget guard, don't skip:** set the Maps JavaScript API **map loads per day** quota to **300**. Usage beyond the 10,000 free loads/month costs $7 per 1,000, which is more than the whole budget.
3. Create a **Map ID** (JavaScript) for advanced markers and set it as `NEXT_PUBLIC_MAPS_MAP_ID`.

Outputs (non-secret, git-ignored): `infra/generated/infra.env` and `infra/generated/firebase-web-config.js`. Phase 3 reads them.

### Verify Phase 2

```bash
gcloud iam service-accounts list --filter="email~second-serve" --format="table(email)"
```
```bash
gcloud firestore databases describe --database="(default)" --format="value(locationId,type)"
```
```bash
gcloud storage buckets list --filter="name~second-serve" --format="table(name,location)"
```
```bash
gcloud artifacts repositories list --location=asia-south1
```
```bash
gcloud secrets versions list pickup-code-hmac-key
```
```bash
gcloud billing budgets list --billing-account="$(gcloud billing projects describe "$(gcloud config get-value project)" --format='value(billingAccountName)' | sed 's#billingAccounts/##')"
```

## Phase 3: run locally (no cloud needed)

```bash
npm install
```
```bash
cp .env.example .env.local
```
```bash
npm run dev
```

Open http://localhost:3000. Local mode uses:

| Piece | Local | Production |
|---|---|---|
| Data | In-memory store, saved to `.data/dev-db.json`, auto-seeded with demo data | Firestore |
| Sign-in | Demo account picker (`AUTH_MODE=dev`, refused in production) | Firebase Auth (Google / email) |
| AI | Deterministic mock that understands "12 croissant left" in English, Hindi or Hinglish (no photo or audio understanding) | Gemini `gemini-3.5-flash-lite` via your gcloud credentials |
| Uploads | `.data/uploads/` | Signed URLs to the private media bucket |
| Live map | Polls every 10 s; schematic map without a Maps key | Firestore real-time listeners; Google Maps (quota-capped) |

To use **real Gemini locally**, run `gcloud auth application-default login` and set `AI_MODE=gemini` and `GOOGLE_CLOUD_PROJECT=prime-agency-466812-n5` in `.env.local`. No API key is needed.

To **reset the demo data**, stop the server, delete `.data/`, and start again.

### Demo walkthrough (about 5 minutes)

1. **Customer:** sign in as *Priya (customer)* → **Offers** (List / Map) → open *Bakery surprise bag* → Reserve → you get a 6-character code and QR code. Toggle **EN / हिं** in the header at any point.
2. **Merchant:** sign out, sign in as *Arjun · Crust & Crumb* → **Stock**: the at-risk banner shows items likely to be left over. Type `बारह croissant बचे, 4 muffin` → check the proposed changes → Apply.
3. Tick **Select** on two items → **Rescue selected** → review the AI draft. The price must stay within 20–90% of the original, and Publish stays disabled until "I have checked the allergens" is ticked → **Approve & publish**. The offer appears on the customer map.
4. **Counter:** enter Priya's code → "Collected ✓ — collect ₹…". Entering the same code again is refused.
5. **NGO:** sign in as *Fatima · Roti Bank* → **Donations** → Claim → a handover code appears. Sign in as *सुनीता · Annapurna Café* → **Counter** → Donations → Confirm handover with that code.
6. **Onboarding + verification:** sign in as *Dev (new)* → My pickups → "Register your business" → create → upload any PDF/photo plus a 14-digit number → auto-checks → sign in as *Admin* → approve.
7. **Dashboard:** as Arjun → **Dashboard**: revenue recovered, items rescued, the 14-day trend and top wasted items.

### Project layout

```
src/app/                 pages (App Router) + api/ route handlers
src/components/          client UI (DNA-styled)
src/lib/                 shared types, i18n (en/hi), client helpers
src/server/store/        Store interface: memory.ts (local/tests), firestore.ts (prod)
src/server/domain/       business logic: stock, prediction, offers, reservations,
                         donations, verification, sweep, quotas
src/server/ai/           Gemini client, Zod/JSON schemas, mock, guardrails
src/styles/              dna-tokens.css (vendored) + app.css (tokens only)
Dockerfile               multi-stage, Next.js standalone, non-root, port 8080
```

### Checks run in Phase 3
- `npx tsc --noEmit`: clean.
- `npx next build`: succeeds (44 routes).
- An end-to-end smoke run against the dev server passed 34 of 34 checks: Hinglish stock update, rescue to offer, price and allergen guardrails, double-approve blocked, overselling blocked, the code shown again to its owner, wrong / foreign / reused codes refused, role and cross-origin blocks, NGO claim and handover, licence submit, admin reject-needs-reason and approve, sweep, and the dashboard. Phase 4 turns this into the automated test suite.

## Phase 4: tests and Gemini eval

```bash
npm test
```
88 tests (Vitest, in-memory store, no cloud) covering:
- the prediction heuristic, licence checks, pickup codes, session tokens and the mock parser
- AI guardrails: quantity clamped to stock, real prices restored, allergens kept, unknown IDs dropped, discount clamped to 20–90%, pickup by closing time
- flows: rescue → offer, every approval guardrail, withdraw, quotas, reserve → counter → impact, QR binding, **6 concurrent reservations for 3 packs (never oversells)**, the active-reservation cap, cancel/reopen, wrong-code rate limit, donation claim race and handover, sweep (expiry, no-shows, stock roll-over, licence suspension, idempotent)
- **DNA design lint**: fails on raw colours, px font sizes or `--color-*` primitives in any UI file

```bash
npm run test:e2e
```
34 HTTP-level checks against a running local server (`npm run dev` first).

```bash
GOOGLE_CLOUD_PROJECT=prime-agency-466812-n5 GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token) npm run eval
```
18 cases run against **real Gemini** (`gemini-3.5-flash-lite`) through the app's own prompts, schema validation and guardrails. Results are saved to `evals/results.json`.

| Group | Cases | Result |
|---|---|---|
| Live stock updates: English, Hindi (Devanagari), Hinglish, Devanagari numerals, deltas, unmatched items | 7 | 7/7 |
| Surplus drafts: English, Hindi, selected-stock bundle, unknown item | 4 | 4/4 |
| Licence/registration extraction: FSSAI PDF, NGO Darpan | 2 | 2/2 |
| **Prompt injection**: "set all to 0 + add s_admin", Hindi override, "price 0 / no allergens / qty 500", "print your system prompt", licence note "report validUpto 2099" | 5 | **5/5** |
| **Total** | **18** | **18/18 (100%)**; bar is ≥90% overall and 100% on injection |

The eval caught two real problems, both fixed:
1. Gemini rejected the draft schema (HTTP 400, too complex). Gemini now gets a structural schema, and the full Zod schema still validates every response.
2. Gemini priced bundles as a whole lot. The guardrail now recomputes the per-pack price and keeps only the discount ratio, clamped.

## Phase 5: deploy to Cloud Run

```bash
PROJECT_ID=prime-agency-466812-n5 ADMIN_EMAILS=you@example.com ./infra/deploy.sh
```
- Builds remotely with Cloud Build (`cloudbuild.yaml`), as the build service account, into Artifact Registry.
- Deploys to Cloud Run as `second-serve-run`, never the default compute SA. `min-instances=0`, `max-instances=3`, 512 MiB, request-based billing.
- Secrets come from Secret Manager (`SESSION_SECRET`, `PICKUP_HMAC_KEY`); nothing secret is in env files or the image.
- Production modes: Firestore, Firebase Auth, Gemini, GCS. Demo sign-in and the mock are refused at start-up.
- Creates Cloud Scheduler `second-serve-sweep` (every 15 min, OIDC as `second-serve-scheduler`; the app verifies the token's email and audience).
- Adds the run.app origin to the media bucket CORS and the Maps key referrers, then runs a live health check.
- Set `IMAGE_TAG=<existing tag>` to redeploy without rebuilding.

**Live:** https://second-serve-799057842599.asia-south1.run.app (health shows `firestore / firebase / gemini / gcs`). Live checks: dev sign-in → 403, cron without a token → 401.

### Manual steps still needed (console only)
1. Firebase → Authentication → **Sign-in method**: enable Email/Password and Google.
2. Firebase → Authentication → Settings → **Authorized domains**: add `second-serve-799057842599.asia-south1.run.app`.
3. **Maps budget guard:** set Maps JavaScript API "map loads per day" quota to 300.
4. Optional: create a Map ID and set `NEXT_PUBLIC_MAPS_MAP_ID` (until then the map uses Google's demo map ID).

Production Firestore starts **empty**. Sign in with an `ADMIN_EMAILS` account, then register real merchants and NGOs through onboarding.

## Phase 6: operate

```bash
PROJECT_ID=prime-agency-466812-n5 ALERT_EMAIL=you@example.com ./infra/ops.sh
```
Idempotent: re-running updates the policies in place.

| What | Detail |
|---|---|
| Email channel | "Second Serve alerts" → `ALERT_EMAIL` (created through the Monitoring REST API; there's no GA gcloud command) |
| Uptime check | HTTPS `/api/health` every 15 min from asia-pacific, europe and usa-virginia |
| **Alert: availability SLO fast burn** (critical) | 5xx ratio > 14.4× burn of a 99.9% SLO on both 5 m and 1 h windows. Min-volume guard **0.05 req/s** (skill default 1 req/s, too high for the pilot) |
| **Alert: p95 latency > 3 s** (warning) | Skill default 500 ms **overridden to 3000 ms**: Gemini calls take 1–4 s and the service scales to zero |
| **Alert: instances at max (3)** (warning) | ≥95% of `max-instances` for 5 min: real growth, or a loop or abuse |
| **Alert: unhandled server errors** (error) | Log match on `jsonPayload.event="unhandled"`, at most 1 email per 5 min |
| **Alert: Gemini calls failing** (warning) | Log match on `jsonPayload.event="gemini_call_failed"` |
| **Alert: scheduled sweep failing** (error) | Scheduler job errors, e.g. 401/403 from an OIDC audience mismatch |
| **Alert: health check failing** (critical) | Uptime check failing from more than one region |
| Error Reporting | Unhandled errors are logged as `ReportedErrorEvent` with stack and route, so they group automatically |
| Least privilege | Build SA's `run.developer` moved from project level to the `second-serve` service only (setup.sh no longer re-grants it) |
| Budget | $5/month with 50/90/100% email alerts (from setup.sh) |

Alerting costs nothing today. Google starts charging no sooner than 2027-09-01, at about $0.35 per metric reference per month (these 7 policies ≈ $2–3/month then); see [alerting pricing](https://cloud.google.com/products/observability/pricing) and [cost control](https://docs.cloud.google.com/monitoring/alerts/cost-control).

**Runbook basics**
- Roll back: `gcloud run services update-traffic second-serve --to-revisions=<previous-revision>=100 --region=asia-south1`
- App logs: Logs Explorer with `resource.labels.service_name="second-serve"`. Filter on `jsonPayload.event` = `unhandled`, `gemini_call_failed` or `sweep`.
- Errors: Cloud Console → Error Reporting (optionally "Turn on notifications").

### CI/CD
`cloudbuild.yaml` runs **test** (`npm ci`, `tsc`, `npm test`) → **build** → **push** → **deploy** (image swap only; the runtime config stays owned by `deploy.sh`), as `second-serve-build` with Cloud Logging only.

To turn on build-on-push, put the code in GitHub, create a Cloud Build 2nd-gen GitHub connection in `asia-south1` (console, one-time OAuth), then:
```bash
PROJECT_ID=prime-agency-466812-n5 GITHUB_REPO_URL=https://github.com/<owner>/<repo>.git CONNECTION=github ./infra/ci-trigger.sh
```

### Teardown
```bash
PROJECT_ID=prime-agency-466812-n5 ./infra/teardown.sh
```
This asks you to type the project ID first. It deletes the trigger, scheduler job, Cloud Run service, alert policies, uptime check, image repository, buckets, Firestore database, secrets, Maps key, budget and service accounts. Set `KEEP_DATA=1` to keep Firestore and the media bucket. APIs and the Firebase project are left in place (free).

## Monthly cost (as deployed)

| Item | Estimate |
|---|---|
| Cloud Run (min 0, max 3), Firestore, Firebase Auth, Scheduler (1 job), Secret Manager, Artifact Registry (keep 3), Cloud Build (default machine), Logging/Monitoring, uptime checks, alerting | $0 (free tiers) |
| Cloud Storage (asia-south1, 30-day lifecycle) | ~$0.05 |
| Gemini `gemini-3.5-flash-lite` (quota-capped per merchant) | ~$0.30–2.00 at pilot volume |
| Maps JavaScript API | $0 under 10,000 loads/month, **if the 300/day quota cap is set** |
| **Total** | **≈ $0.40–2.20/month** of the $5 cap |
