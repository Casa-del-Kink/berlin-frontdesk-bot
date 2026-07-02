# Tilda deployment readiness pack

Purpose: make a hosted demo or first pilot repeatable without mixing fake-provider demos, live calendar tests, and production runtime assumptions.

## Deployment target default

Use a simple Node 20+ web service first. The target can be Docker, a VPS process manager, Fly/Render/Railway, or another managed Node host, but the runtime contract is the same:

```bash
npm ci
npm run typecheck
npm run style:guard
npm run server:battletest
npm run deployment:preflight
npm run deployment:smoke
npm run start
```

Do not expose the service to real traffic until `npm run deployment:preflight` passes without `ALLOW_DEPLOYMENT_BLOCKERS=true`.

For hosted live-pilot runtimes, set:

```text
REQUIRE_LIVE_PILOT_READINESS=true
```

With that flag, the server refuses startup while deployment blockers remain. Leave it unset for local fake-provider demos and CI smokes.

## Required runtime env

Core app:

```text
NODE_ENV=production
PORT=3000
CLIENT_FILE=clients/salon-demo.yaml
SERVER_TOOL_TOKEN=<long random bearer token>
DATA_RETENTION_DAYS=30
# Internal hosted demo only, when owner alerts are intentionally console/log-only:
# OWNER_ALERT_LOG_ONLY_ACCEPTED=true
```

For a real client pilot, configure `ownerWhatsapp` in the client YAML instead of relying on log-only alerts.

Calendar:

```text
USE_FAKE_CALENDAR=false
GOOGLE_SA_JSON=<one-line service account JSON>
```

Database:

```text
STORE_BACKEND=postgres
DATABASE_URL=<Supabase pooled or direct Postgres URL>
```

Messaging / WhatsApp:

```text
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=...
TWILIO_WEBHOOK_BASE_URL=https://<public-host>
SKIP_TWILIO_SIGNATURE_VALIDATION=false
OPENROUTER_API_KEY=...
```

Compliance flag:

```text
COMPLIANCE_DPA_REVIEWED=true
```

Only set `COMPLIANCE_DPA_REVIEWED=true` after the actual AVV/DPA/subprocessor review is complete. Until then, the readiness endpoint should show a warning.

**Health-adjacent clients (dental/medical, §203 StGB scope):** if the active client YAML sets `dataSensitivity: health`, readiness adds a hard **blocker**, `COMPLIANCE_SUBPROCESSOR_REVIEW_COMPLETE=true`, stricter than the general DPA flag above. This must only be set after a full subprocessor-by-subprocessor legal/vendor review (hosting platform, Twilio, OpenRouter, ElevenLabs, Supabase, log storage). See `wiki/decisions/2026-07-01-subprocessor-review-triggers.md` for exactly when this review must be (re-)run: some triggers there can't be caught by an automated gate and need a human to notice them.

## Secrets storage approach

- Store secrets in the host/deployment platform secret manager.
- Never commit `.env`, service account JSON, database URLs, Supabase passwords, or provider API keys.
- Prefer a pooled Supabase Postgres URL for hosted IPv4 runtimes if direct DB DNS/IPv6 is unreliable.
- Keep Supabase REST/admin secret-key checks separate from Postgres backend checks. REST auth does not prove schema migrations or advisory locks.

## Preflight command

Normal live gate:

```bash
npm run deployment:preflight
```

Review-only mode when credentials are intentionally absent:

```bash
ALLOW_DEPLOYMENT_BLOCKERS=true npm run deployment:preflight
```

Expected markers:

```text
DEPLOYMENT_PREFLIGHT_OK
DEPLOYMENT_PREFLIGHT_OK_WITH_WARNINGS
DEPLOYMENT_PREFLIGHT_BLOCKED
DEPLOYMENT_PREFLIGHT_REVIEW_ONLY
```

Review-only mode must never be used as proof that a deployment is live-ready.

## Deployment smoke command

Run the local deployment smoke before a hosted demo handoff:

```bash
npm run deployment:smoke
```

Expected marker:

```text
DEPLOYMENT_SMOKE_OK
```

This starts the real server with fake provider fixtures, proves `/health` works, proves protected readiness returns `401` without bearer auth, proves unsafe readiness returns `409` with blocker details, proves protected metrics still work, and proves `REQUIRE_LIVE_PILOT_READINESS=true` refuses startup while blockers remain. It does not call paid/live providers.

## Render deployment (decided path)

Render (Frankfurt, Standard plan, Docker runtime) is the decided hosting
platform for the pilot backend. Decision record:
`wiki/decisions/2026-07-01-render-hosting-frankfurt-standard.md`. Blueprint:
`render.yaml` at the repo root.

Blueprint creation steps:

1. Render dashboard -> Blueprints -> New from repo. The repo is already
   connected; select `berlin-frontdesk-bot` and the `render.yaml` at root.
2. Render creates the `berlin-frontdesk-bot` web service from the blueprint.
   It does not deploy automatically (`autoDeploy: false`); a deploy is an
   explicit action.
3. Before the first deploy, fill in every `sync: false` env var in the
   service's Environment tab. Names only below, matching `.env.example`;
   never paste example secret values into a real deployment:
   `DATABASE_URL`, `GOOGLE_SA_JSON`, `TWILIO_ACCOUNT_SID`,
   `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_WEBHOOK_BASE_URL`,
   `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY`, `OPERATOR_TOKEN`,
   `DATA_RETENTION_DAYS`, `OWNER_ALERT_LOG_ONLY_ACCEPTED`.
4. `SERVER_TOOL_TOKEN` is generated by Render automatically
   (`generateValue: true`); do not set it manually.

Strict-startup fail-until-configured behavior: `render.yaml` sets
`REQUIRE_LIVE_PILOT_READINESS=true` permanently. The server refuses to start
until every live-pilot readiness blocker is resolved, including the env vars
above. This is intentional: a half-configured instance must never come up and
silently serve traffic. Do not unset this flag to work around a failed
startup; fix the underlying missing configuration instead.

`preDeployCommand` behavior: Render runs `npm run postgres:preflight` before
every deploy. That script connects to `DATABASE_URL`, runs `SELECT 1`, and
exits non-zero on any failure (missing var, connection failure, query
failure). A non-zero exit fails the deploy itself, before the new instance
ever receives traffic. This is a connectivity check only; it does not run
migrations and is not a substitute for the full `npm run postgres:smoke`
proof below.

Target-runtime DB proof: `render ssh` (available on the Standard plan) opens
a shell on the running instance. From that shell, run
`npm run postgres:smoke` to prove the full schema/CRUD path from Render's own
network to the database. A local `docker run` cannot substitute for this,
because it does not exercise Render's actual network path.

Cloudflare DNS note: if the public domain is proxied through Cloudflare, set
the CNAME to Render to DNS-only (grey-cloud), not proxied (orange-cloud).
Twilio validates webhook signatures against the exact request it sent;
routing through Cloudflare's proxy can alter headers or IPs in ways that
break signature integrity. Keep the Twilio webhook hostname grey-cloud.

## HTTP checks after deploy

Health should be public and non-sensitive:

```bash
curl https://<public-host>/health
```

Expected shape:

```json
{"ok":true,"client":"Glanz & Schnitt Berlin","storeBackend":"postgres","time":"..."}
```

Readiness is protected by `SERVER_TOOL_TOKEN`:

```bash
curl -H "Authorization: Bearer $SERVER_TOOL_TOKEN" https://<public-host>/readiness/live-pilot
```

Expected:

- `200` when no blocker checks remain
- `409` while live blockers remain
- `401` without the bearer token
- response includes `checks`, `blockers`, and `warnings` arrays matching `npm run deployment:preflight`

Metrics and operator/privacy endpoints are also bearer-protected:

```bash
curl -H "Authorization: Bearer $SERVER_TOOL_TOKEN" https://<public-host>/metrics/today
```

## Webhook rules

- `TWILIO_WEBHOOK_BASE_URL` must exactly match the public HTTPS URL Twilio signs.
- `SKIP_TWILIO_SIGNATURE_VALIDATION=false` in any public runtime.
- Missing or invalid Twilio signatures must return `403`.
- Missing or wrong tool bearer auth must return `401` for tool, metrics, readiness, privacy, and voice post-call endpoints.

## Fake-provider boundary

Allowed:

- `npm run demo:fake`
- `npm run first-test:smoke`
- `npm run voice:smoke`
- `npm run server:battletest`
- CI/no-credential local checks

Not allowed for live traffic:

- `USE_FAKE_CALENDAR=true`
- `STORE_BACKEND=json`
- missing `SERVER_TOOL_TOKEN`
- `SKIP_TWILIO_SIGNATURE_VALIDATION=true`
- empty `ownerWhatsapp`, unless this is an internal hosted demo and `OWNER_ALERT_LOG_ONLY_ACCEPTED=true` is intentionally set

## Logs and PII

Current default:

- owner alerts are logged only when `ownerWhatsapp` is empty
- call post-processing stores summaries, not raw transcripts by default
- privacy export/delete endpoints exist for first-pilot operator handling
- retention purge defaults to dry-run unless explicitly set otherwise

Before a public pilot:

- keep logs short and operational
- do not log full provider credentials or raw service account JSON
- do not store raw call transcripts unless explicitly approved and reflected in the privacy notice/DPA
- confirm the retention period matches the client privacy notice

## Monitoring plan

Minimum first hosted demo monitoring:

1. uptime check on `/health`
2. protected daily/manual check of `/readiness/live-pilot`
3. provider webhook failure count from host logs
4. daily owner summary output at 20:00 business timezone
5. Supabase Postgres smoke after backend/schema changes
6. Google Calendar smoke after calendar credential or sharing changes

## Rollback plan

If a live deployment fails:

1. disable public webhook routing in the provider console
2. keep the service running if privacy/export endpoints are needed
3. inspect `/health` and protected readiness
4. run fake-provider smoke locally to separate product regression from provider outage
5. run live provider smoke only if credentials and a safe test window exist

## First-pilot go/no-go

Go only when:

- `npm run deployment:preflight` passes without review-only mode
- `/readiness/live-pilot` returns `200`
- Supabase Postgres smoke passes in the target runtime
- Google Calendar cleanup smoke passes
- Twilio webhook signature validation is active
- operator endpoints require bearer auth
- owner alert destination is configured for a client pilot, or explicitly accepted as log-only for an internal hosted demo

No-go when:

- fake calendar is active
- JSON store is the live backend
- no public HTTPS webhook base is configured
- Twilio signature validation is skipped
- live provider credentials are missing
- AVV/DPA/compliance review is being represented as complete when it is not
