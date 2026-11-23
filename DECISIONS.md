# Decisions

Each entry: decision · why · trade-off. Rows marked ~~struck~~ were superseded by a later decision.

| # | Decision | Why | Trade-off |
|---|---|---|---|
| D1 | **Web app with Gemini features, not ADK** | AI tasks are single-shot extraction and suggestion with human approval; no multi-step tool use | An agentic workflow would need a re-architecture later |
| D2 | **One mobile-first PWA with roles** instead of separate merchant, customer and NGO apps | A third of the build and deploy surface; browser APIs cover camera, mic and location | No app-store presence; iOS web push is limited |
| D3 | **Next.js (TypeScript) on a single Cloud Run service** | One codebase and deploy for UI and API; official Gen AI and Firebase Admin SDKs; scales to zero | Next.js server cold starts (~1–2 s) after idle at min-instances 0 |
| D4 | **Firestore** for app data; **no Cloud SQL** | Free tier, transactions for stock, geohash for "nearby" | No ad-hoc SQL joins; analytics limited to counters |
| D5 | **No BigQuery in the MVP** | Dashboard served from Firestore counters updated transactionally | Cross-merchant analytics deferred; add a BigQuery export later |
| D6 | **Gemini `gemini-3.5-flash-lite` on the global endpoint**, escalating to `gemini-4-hydrogen` only if the eval demands | Cheapest and fastest model listed in the installed `gemini-api` skill; multimodal covers voice and photo | Global endpoint may process outside the home region (you confirmed this is OK) |
| D7 | **Gemini output is advisory only**: JSON schema, server-side bounds, staff approval, allergens always confirmed by a human | Food safety plus the prompt-injection guardrail | One extra tap for merchants |
| D8 | **Pay at pickup; no payment integration** | No card data, no PCI scope, faster MVP | Higher no-show risk, mitigated by reservation caps and a no-show counter |
| D9 | **In-app status only, no SMS or email** | Guardrail on messaging people; avoids SMS cost | Lower re-engagement until opt-in web push is added |
| ~~D10~~ | ~~No Maps JS API~~ (**superseded by D31**) | | |
| D11 | **At-risk prediction is a deterministic heuristic**, not a trained model | No history at launch; transparent and testable; $0 | Less accurate than ML; needs about 2 weeks of data |
| D12 | **All Firestore access via the API**, except read-only `publicOffers` (see D32) | One enforcement point for roles and validation | Every other read goes through Cloud Run |
| D13 | **Cloud Build remote builds** | Docker isn't installed locally; free build minutes | Slower feedback than local builds |
| D14 | **Region asia-south1** | Users assumed in India; Cloud Run and Firestore available there | No always-free Cloud Storage tier outside some US regions (cents) |
| D15 | **Budget alerts at 50/90/100% of $5; no automatic billing kill switch** unless approved | Alerts notify only; a kill switch would take the whole project offline | Overspend is possible between alert and action; capped by max-instances and AI quotas |

## Phase 2 (infra)

| # | Decision | Why | Trade-off |
|---|---|---|---|
| D16 | **Three service accounts** (runtime, scheduler, build), none with Owner or Editor; the default compute SA is never used | Least privilege; a compromised runtime can't deploy, and the build can't read data | More bindings to manage |
| D17 | Runtime SA gets **project-level** `datastore.user` and `aiplatform.user` | Neither role can be scoped to a single resource | Access to all Firestore data in this project (the project is dedicated to this app) |
| D18 | Bucket, secret and repository roles are bound **on the resource**, not the project | Tighter blast radius | — |
| D19 | Build SA gets project-level `run.developer` for now | The Cloud Run service doesn't exist until Phase 5 | Narrowed to a service-level binding in Phase 6 |
| D20 | **Soft delete disabled** on both buckets; 30-day (media) and 7-day (build) lifecycle | Uploaded photos are short-lived; soft-delete retention would be billed | Deleted objects can't be recovered |
| D21 | **Firestore `(default)` database with delete protection** | Only the default DB gets the free tier; protection prevents accidental loss | Teardown must disable protection first |
| D22 | Secret stored with **user-managed replication in `$REGION` only** | Data residency; nothing leaves the region | Not geo-redundant (fine for an HMAC key that can be rotated) |
| D23 | **Firebase Auth providers enabled manually in the console** | No stable, documented CLI for first-time Auth initialization; a fragile REST call could half-configure it | One manual click-through |
| D24 | Scheduler job, Cloud Run service, Scheduler `run.invoker`, Auth authorized domain and alert policies **deferred to Phases 5–6** | They depend on the deployed service URL | Phase 2 alone doesn't produce a running app |
| D25 | The setup script **contains no usage-attribution tags** | The Google skills say not to put attribution prefixes in scripts handed to the user | — |

## UI design system

| # | Decision | Why | Trade-off |
|---|---|---|---|
| D26 | **UI styled with Visit Health's DNA Design System v2.0** (requested by you); tokens vendored verbatim to `src/styles/dna-tokens.css` | One source of truth for colour, type, spacing and elevation; matches Visit's Figma | Second Serve looks like a Visit product; rebranding means remapping the brand aliases |
| D27 | **`mobile/*` text styles for all app screens**, `web/*` only for landing and admin ≥ 768 px | The product is a phone-first web app | Desktop merchant dashboard uses the mobile scale (slightly compact) |
| D28 | **Small status/accent text uses DNA `-intense` steps**; `success/warning-normal` and `gray-caption` are never used for text | Measured contrast: those tokens are 2.6–2.8:1 on white, below WCAG AA 4.5:1 | Slightly darker status text than the Figma defaults |
| D29 | **Light mode only** | DNA v2.0 defines no dark values, and the skill says not to invent them | No dark theme until DNA adds one |
| D30 | **Phase 4 adds a lint test** that fails on raw hex, `rgb(`, px font sizes or `--color-*` primitives outside the token file | Keeps every screen on-system | — |

## Your answers to the Phase 1 questions (2026-11-22)

| # | Decision | Why | Trade-off |
|---|---|---|---|
| D31 | **Google Maps JavaScript API for live maps** (customer offers, NGO donations, admin area), **capped at 300 map loads/day**, with a list-first UI and list fallback | You asked for a live inventory map. Dynamic Maps has 10,000 free loads/month, then $7 per 1,000 | The map is hidden for the rest of the day if the cap is hit; the quota cap is a manual console step |
| D32 | **Read-only `publicOffers` collection with Firestore real-time listeners**; list queries capped at 100 docs | Live map updates without polling; listeners cost 1 read per change; holds no private fields | A second copy of offer data, kept in sync inside the same transactions |
| D33 | **Live per-item stock with checkpoint and voice updates**, replacing end-of-day entry; sales history derived from stock changes | You asked for live inventory; checkpoints keep it realistic for busy counters | Accuracy depends on staff updating a few times a day; POS integration later |
| D34 | **Licence-based verification**: FSSAI licence (merchants), registration certificate + NGO Darpan ID (NGOs) → Gemini extraction → automatic checks → **one-tap admin approval**; auto-suspend on expiry | You asked to verify by licence status. I found no official public API to rely on, and approval is a trust decision that needs a human | The admin still clicks approve; no scraping of government portals |
| D35 | **Bilingual UI (English/Hindi) and Hindi/Hinglish AI input**; names stored as spoken + English; allergens from a fixed English list | You asked for Hindi voice; merchants are often Hindi-first | Strings run ~20–40% longer; the eval must cover Hindi |
| D36 | **Noto Sans Devanagari added as a fallback font** after Inter/Bricolage (an extension of DNA; token file untouched) | DNA fonts have no Devanagari glyphs | One extra font download for Hindi users |
| D37 | **Merchant location by pin-drop, no Geocoding/Places API** | Avoids another billed SKU | Merchants place the pin themselves |
| D38 | **Pay at pickup confirmed**; **pilot of ~10 merchants** | Your answers | — |
| D39 | **Project ID left as a variable** until you decide | Your answer | Phase 2 can't run until it's set |

## Phase 3 (build)

| # | Decision | Why | Trade-off |
|---|---|---|---|
| D40 | **`Store` interface with two backends**: in-memory (local + tests) and Firestore (production) | No Java on this machine, so no Firestore emulator; lets the whole app and its tests run with zero cloud | Two implementations to keep equivalent; Firestore-specific behaviour (indexes, transaction limits) is only exercised after deploy |
| D41 | **Local modes: dev sign-in, mock AI, local uploads**, each refused in production by `assertSafeConfig()` at start-up | Demo and development without credentials | Mock AI can't read photos or audio |
| D42 | **Own HMAC-signed session cookie** (httpOnly, SameSite=Lax), issued after verifying a Firebase ID token once | One auth path for both modes; no per-request token verification | Logout is cookie-clear (7-day expiry); sessions can't be revoked server-side without a denylist |
| D43 | **Same-origin check on every state-changing API call** (Origin must match Host), except the OIDC-authenticated cron | CSRF protection for cookie auth | Non-browser clients must send an Origin header |
| D44 | **Pickup/handover codes stored as HMAC (for verification) plus AES-GCM ciphertext (so the owner can see them again)** | Customers lose codes; a database leak alone reveals nothing | Key rotation invalidates open codes |
| D45 | **Stock as a flat `stock` collection with `merchantId`** (not a subcollection) | Simpler queries and memory-store parity | One extra equality filter per query |
| D46 | **Sweep never auto-donates leftovers**: expired packs return to stock and the merchant decides | Human approval before routing food to third parties | One more tap for merchants at closing |
| D47 | **Media sent to Gemini inline** (≤5 MB), not as `gs://` URIs | Avoids granting the Gemini service agent bucket access | Slightly larger requests |
| D48 | **Next.js 16 + React 19 + Zod 4; TypeScript pinned to 5.x** | TypeScript 7 ships only the native compiler, without the JS API Next.js uses for type checking | Revisit when Next.js supports TS 7 |
| D49 | **Voice stock updates are proposals**: staff confirm each change before it's applied | Model output is untrusted; mistakes cost real stock | Extra tap |
| D50 | **AI guardrails in code**: clamp quantities to stock, prices to 20–90%, pickup to closing time; merchant-recorded allergens always included; unknown stock IDs dropped | Prompt injection or model error can at most produce a bad draft that a human rejects | — |
| D51 | **Hourly rate limit on wrong pickup codes (20/merchant/hour)** plus single-use codes | Brute-force protection (31⁶ ≈ 887M codes) | A busy counter mistyping a lot could be briefly locked out |
| D52 | **Firestore stays the database; Cloud SQL considered and declined** (your decision, 2026-11-22) | The smallest Cloud SQL instance is always on (~$8–12/month before storage) and would break the $5 cap on its own; Firestore is ~$0 at pilot scale and powers the real-time map | No SQL queries/joins; if relational reporting is needed later, add a Postgres `Store` backend or a BigQuery export (the `Store` interface keeps that contained) |

## Phases 4–5 (test, deploy)

| # | Decision | Why | Trade-off |
|---|---|---|---|
| D53 | **Gemini gets a structural JSON schema** (types, enums, required, descriptions; numeric/length bounds stripped); the full Zod schema validates responses | The real API rejected the bounded draft schema as too complex (HTTP 400); found by the eval | Out-of-range model output fails validation and returns a friendly retry message instead of being constrained at decode time |
| D54 | **Bundle prices normalised server-side**: per-pack original = sum of unit prices; only the model's discount ratio is used (clamped 20–90%) | Gemini priced bundles as the whole lot; found by the eval | Model can't propose non-additive bundle pricing |
| D55 | **Eval auth via a short-lived `gcloud auth print-access-token`** instead of ADC or API keys | No ADC on this machine; avoids keys entirely | Token lasts about 1 hour; local evals only |
| D56 | **Eval bar: ≥90% overall and 100% on prompt-injection cases**; the runner refuses to score the mock | Injection resistance is a hard requirement; an early run silently scored the mock | — |
| D57 | **Cloud Run: `--allow-unauthenticated`** (public consumer web app); app-level auth for everything else; cron protected by OIDC email + audience check | Customers must reach the site without Google IAM | The service URL is public by design |
| D58 | **First admin via `ADMIN_EMAILS` env** (verified-email match on first sign-in) | Production has no demo accounts; avoids a manual Firestore edit | Changing admins requires a redeploy or editing the user's role |
| D59 | **Cloud Build on the default machine type** | Stays inside free build minutes | Builds take ~4–6 min |
| D60 | **Deterministic run.app URL** (`SERVICE-PROJECTNUMBER.REGION.run.app`) used for `PUBLIC_URL`, OIDC audience, CORS and referrers | Known before the first deploy, so a single deploy configures everything | Cloud Run also serves the older hash URL, which must not be used for sign-in |

## Phase 6 (operate)

| # | Decision | Why | Trade-off |
|---|---|---|---|
| D61 | **Alert policies as JSON templates + `gcloud monitoring policies create/update`** (not Terraform) | The project uses gcloud scripts throughout; the PromQL and SRE defaults come from the `cloud-run-alert-configuration` skill | No Terraform state or drift detection |
| D62 | **Pilot overrides of skill defaults**: SLO fast-burn min-volume guard 1 → 0.05 req/s; p95 latency 500 ms → 3000 ms; slow-burn and 4xx/traffic-anomaly alerts omitted | Pilot traffic is far below 1 req/s; Gemini calls and cold starts make 500 ms noisy; fewer metric references when alerting billing starts | Less sensitive to slow, low-level degradation |
| D63 | **Log-match alerts on structured `jsonPayload.event`** (unhandled, gemini_call_failed) and Scheduler errors, rate-limited to 1 per 5 min | Cheap, precise, no log-based metric needed | Fires per occurrence, not per rate |
| D64 | **Notification channel via the Monitoring REST API** | No GA `gcloud monitoring channels` command in SDK 594 | Uses curl + an access token in the script |
| D65 | **Uptime check every 15 min from 3 regions** | Detects full outages; uptime metrics are exempt from alerting charges | Keeps waking the service (~288 requests/day, within the free tier) |
| D66 | **Build SA narrowed to service-level `run.developer`** after the first deploy; setup.sh won't re-grant project-level | Completes D19 | A brand-new service needs the project-level grant again (setup.sh handles that case) |
| D67 | **CI pipeline gated on tests**; the deploy step only swaps the image | A bad build never ships; env and secrets stay owned by `deploy.sh` | Config changes still need `deploy.sh` |
| D68 | **CI trigger scripted but not created** | The project isn't in a GitHub repository yet; a 2nd-gen connection needs browser OAuth | Builds are manual (`deploy.sh` or `gcloud builds submit`) until the trigger exists |
| D69 | **Teardown requires typing the project ID**; `KEEP_DATA=1` keeps Firestore and media | Irreversible deletion needs explicit confirmation | — |
