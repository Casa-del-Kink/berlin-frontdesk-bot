# Tilda deployment readiness pack

Purpose: make a hosted demo or first pilot repeatable without mixing fake-provider demos, live calendar tests, and production runtime assumptions.

## Deployment target default

Use a simple Node 20+ web service first. The target can be Docker, a VPS process manager, Fly/Render/Railway, or another managed Node host, but the runtime contract is the same:

```bash
npm ci
npm run typecheck
npm run style:guard
npm run secrets:scan
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
# Real client pilot only, after a successful protected alert test. Must be a valid ISO timestamp:
# OWNER_ALERT_TESTED_AT=2026-06-30T10:15:00+02:00
# Reviewed voice-to-WhatsApp follow-up sending stays disabled unless explicitly approved:
# ENABLE_REVIEWED_FOLLOWUP_SEND=false
# Set only when live follow-up sends are approved. Must be a valid ISO timestamp:
# FOLLOWUP_SEND_REVIEWED_AT=2026-06-30T10:20:00+02:00
```

For a real client pilot, configure `ownerWhatsapp` in the client YAML instead of relying on log-only alerts.

Calendar:

```text
SCHEDULING_PROVIDER=google
USE_FAKE_CALENDAR=false
GOOGLE_SA_JSON=<one-line service account JSON>
# Set after the approved live-calendar smoke creates, verifies, and deletes the fixture. Must be a valid ISO timestamp.
LIVE_CALENDAR_SMOKE_TESTED_AT=<timestamp>
```

Hosted Cal.com alternative:

```text
SCHEDULING_PROVIDER=calcom
CALCOM_API_KEY=<Cal.com API key>
# Use one complete selector:
CALCOM_EVENT_TYPE_ID=<numeric event type id>
# or:
CALCOM_EVENT_TYPE_SLUG=<event slug>
CALCOM_USERNAME=<user slug>
# or CALCOM_TEAM_SLUG=<team slug>
# Set after npm run calcom:smoke creates, verifies, and cancels the approved test booking. Must be a valid ISO timestamp.
CALCOM_SMOKE_TESTED_AT=<timestamp>
```

For Cal.com, Tilda still owns the conversation, proof metrics, idempotency, privacy endpoints, and owner alerts. Cal.com is only the scheduling layer and must already sync bookings to the salon or demo Google Calendar. Run `npm run calcom:smoke` only with approved test credentials because it creates, verifies, and cancels a real booking unless `CALCOM_KEEP_SMOKE_BOOKING=true` is deliberately set.

Deployment preflight is provider-aware: `SCHEDULING_PROVIDER=google` must disable `USE_FAKE_CALENDAR`; `SCHEDULING_PROVIDER=calcom` is not blocked by `USE_FAKE_CALENDAR`, but it still requires a successful Cal.com live smoke proof timestamp before first-pilot traffic.

Database:

```text
STORE_BACKEND=postgres
DATABASE_URL=<Supabase pooled or direct Postgres URL>
```

Messaging / WhatsApp:

```text
TWILIO_ACCOUNT_SID=...
# Outbound REST credentials. Prefer a Twilio API key scoped to the Tilda Demo subaccount.
TWILIO_API_KEY_SID=...
TWILIO_API_KEY_SECRET=...
# Webhook validation secret. Do not use this as the preferred outbound REST credential.
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=...
TWILIO_WEBHOOK_BASE_URL=https://<public-host>
SKIP_TWILIO_SIGNATURE_VALIDATION=false
OPENROUTER_API_KEY=...
```

OpenRouter/LLM provider proof:

```bash
LLM_PROVIDER_SMOKE_APPROVED=true npm run llm:provider:smoke
```

Expected marker:

```text
LLM_PROVIDER_SMOKE_OK
```

The smoke uses only a fixed German salon connectivity fixture and no customer data. It fails closed unless both `OPENROUTER_API_KEY` and `LLM_PROVIDER_SMOKE_APPROVED=true` are present. Regression-test the fail-closed/no-secret branch locally with `npm run llm:provider:smoke:contract`.

Compliance flag:

```text
COMPLIANCE_DPA_REVIEWED=true
```

Only set `COMPLIANCE_DPA_REVIEWED=true` after the actual AVV/DPA/subprocessor review is complete. Until then, the readiness endpoint should show a warning.

Twilio credential split for live pilots:

- `TWILIO_AUTH_TOKEN` stays in the runtime because Twilio signs inbound webhooks with it.
- `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET` are required for outbound WhatsApp REST sends.
- The code keeps a backward-compatible Auth Token fallback for local/sandbox sends, but `/readiness/live-pilot` blocks live readiness until API key credentials are configured.
- Do not paste any Twilio secret into chat or tracked files. Load them through host secret storage.

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

Machine-readable output for scheduled checks and operator handoffs:

```bash
ALLOW_DEPLOYMENT_BLOCKERS=true DEPLOYMENT_PREFLIGHT_JSON=true npm run deployment:preflight
```

Regression-test the JSON mode locally:

```bash
npm run deployment:preflight:smoke
```

Expected marker:

```text
DEPLOYMENT_PREFLIGHT_JSON_SMOKE_OK
```

## Deployment handoff

Generate a no-secret hosted handoff that tells Michael/Roxu/engineering/provider/compliance exactly which env/proof names remain before a hosted demo or live pilot:

```bash
npm run deployment:handoff
```

Expected marker while anything is missing:

```text
DEPLOYMENT_HANDOFF_BLOCKED
```

The command writes `tmp/tilda-ops-snapshot/deployment-handoff.md`. It prints only env/proof names and boolean configured status, never secret values, and does not call Google Calendar, Cal.com, Supabase/Postgres, WhatsApp, voice providers, or LLM providers. Use `DEPLOYMENT_HANDOFF_JSON=true npm run deployment:handoff` for scheduled/operator parsing.

Regression-test it locally:

```bash
npm run deployment:handoff:smoke
```

Expected marker:

```text
DEPLOYMENT_HANDOFF_SMOKE_OK
```

The smoke verifies both Google and Cal.com scheduling-provider handoff branches and checks that sentinel secrets are not printed.

## Hosting handoff

Generate a no-secret hosting-target checklist before Michael/Roxu choose where the backend will run:

```bash
npm run hosting:handoff
```

Expected marker:

```text
HOSTING_HANDOFF_OK
```

The default recommendation is a Hetzner VPS Node service because it gives stronger EU hosting control and predictable cost for provider webhooks. Render is an acceptable fast demo path if account ownership, region, and wake behavior are acceptable. Fly is kept as a later option when release operations are worth the extra setup. The report writes `tmp/tilda-ops-snapshot/hosting-handoff.md`, prints only env names and manual checklist status, and does not deploy, route provider traffic, call live providers, or print secret values.

Machine-readable mode for scheduled checks:

```bash
HOSTING_HANDOFF_JSON=true npm run hosting:handoff
```

Regression-test it locally:

```bash
npm run hosting:handoff:smoke
```

Expected marker:

```text
HOSTING_HANDOFF_SMOKE_OK
```

The smoke verifies target selection, Hetzner/Render/Fly coverage, hosted-preflight checklist coverage, and secret sentinel redaction.

## Operator readiness bundle

Generate a founder/operator handoff that groups live deployment and voice-agent blockers by owner without scraping console output:

```bash
ALLOW_OPERATOR_READINESS_BUNDLE_BLOCKERS=true npm run operator:readiness:bundle
```

Expected review marker while blockers remain:

```text
OPERATOR_READINESS_BUNDLE_REVIEW_ONLY
```

The command writes `tmp/tilda-ops-snapshot/operator-readiness-bundle.md` and prints the same content. It is report-only: it does not call Google Calendar, Cal.com, Supabase/Postgres, WhatsApp, or a voice provider. It includes the voice-agent contract marker, separate deployment and voice blocker/warning counts, and the active scheduling provider with only its matching live proof command. That keeps Michael/Roxu from seeing both Google Calendar and Cal.com as simultaneous live-smoke work when one provider path is selected.

Machine-readable mode for scheduled checks:

```bash
ALLOW_OPERATOR_READINESS_BUNDLE_BLOCKERS=true OPERATOR_READINESS_BUNDLE_JSON=true npm run operator:readiness:bundle
```

Regression-test it locally:

```bash
npm run operator:readiness:bundle:smoke
```

Expected marker:

```text
OPERATOR_READINESS_BUNDLE_SMOKE_OK
```

## Operator demo packet

Generate a no-credential founder/operator packet that starts the real server with fake providers and proves the phone-to-follow-up path end to end:

```bash
npm run operator:demo:packet
```

Expected marker:

```text
OPERATOR_DEMO_PACKET_OK
```

The command writes `tmp/tilda-ops-snapshot/operator-demo-packet.md`. It verifies protected readiness, accepted log-only owner alert testing for an internal demo, a voice post-call follow-up draft from typed fields, reviewed follow-up dry-run, live follow-up fail-closed behavior, privacy export, and protected metrics. It does not call live Google Calendar, Supabase/Postgres, WhatsApp, or a voice provider.

Machine-readable mode for scheduled checks:

```bash
OPERATOR_DEMO_PACKET_JSON=true npm run operator:demo:packet
```

Expected JSON marker: `OPERATOR_DEMO_PACKET_OK`, with `noLiveProviderCalls: true` and `liveCommandsRequireApproval` listing live provider checks that remain out of scope.

## Provider proof manifest

Generate a no-credential manifest of live provider proof commands before running any side-effecting smoke:

```bash
npm run provider:proof:manifest
```

Expected marker:

```text
PROVIDER_PROOF_MANIFEST_OK
```

The command writes `tmp/tilda-ops-snapshot/provider-proof-manifest.md`. It is report-only and does not call Google Calendar, Cal.com, Supabase/Postgres, WhatsApp, voice providers, or LLM providers. It now prints `activeSchedulingProvider`, marks Google/Cal.com scheduling proof items as `active` or `alternative`, and lists only the active scheduling proof commands for the selected `SCHEDULING_PROVIDER`.

Machine-readable mode for scheduled checks:

```bash
PROVIDER_PROOF_MANIFEST_JSON=true npm run provider:proof:manifest
```

Regression-test the manifest shape locally:

```bash
npm run provider:proof:manifest:smoke
```

Expected marker:

```text
PROVIDER_PROOF_MANIFEST_SMOKE_OK
```

## Pilot go/no-go report

Generate a no-credential go/no-go queue that combines deployment blockers, voice contract blockers, and remaining live proof items into one owner-routed artifact:

```bash
npm run pilot:go-no-go
```

Expected marker while blockers or proof items remain:

```text
PILOT_GO_NO_GO_NO_GO
```

The command writes `tmp/tilda-ops-snapshot/pilot-go-no-go.md`. It is report-only and does not call Google Calendar, Cal.com, Supabase/Postgres, WhatsApp, voice providers, or LLM providers. Use it as the first operator handoff before a hosted demo or first-pilot readiness review. It prints `activeSchedulingProvider` and `activeSchedulingProofCommands` so the handoff points Michael/Roxu at the selected Google Calendar or Cal.com live proof command without mixing both paths.

Machine-readable mode for scheduled checks:

```bash
PILOT_GO_NO_GO_JSON=true npm run pilot:go-no-go
```

Regression-test the report shape locally:

```bash
npm run pilot:go-no-go:smoke
```

Expected marker:

```text
PILOT_GO_NO_GO_SMOKE_OK
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

It also proves the operator-reviewed follow-up send path is safe by default: unauthenticated requests return `401`, missing opt-in returns `400`, approved dry-runs do not send provider traffic, and live sends return `409` unless `ENABLE_REVIEWED_FOLLOWUP_SEND=true` has been deliberately approved with `FOLLOWUP_SEND_REVIEWED_AT`.

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

Owner alert route test before a live pilot:

```bash
curl -X POST \
  -H "Authorization: Bearer $SERVER_TOOL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"message":"Tilda owner alert test"}' \
  https://<public-host>/operator/alert-test
```

Expected: the configured owner receives the test alert and the response includes `ownerAlert.sent=true`. Only then set `OWNER_ALERT_TESTED_AT` in the hosted runtime. If `ownerAlert.error` is present, fix Twilio/owner destination first and do not treat the pilot as ready.

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
- missing `OWNER_ALERT_TESTED_AT` for a real client pilot with WhatsApp owner alerts

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
6. Google Calendar smoke after calendar credential or sharing changes, or Cal.com smoke after Cal.com event type or connected-calendar changes

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
- Google Calendar cleanup smoke passes for `SCHEDULING_PROVIDER=google`, or Cal.com create/get/cancel smoke passes for `SCHEDULING_PROVIDER=calcom`
- Twilio webhook signature validation is active
- operator endpoints require bearer auth
- owner alert destination is configured for a client pilot, or explicitly accepted as log-only for an internal hosted demo

No-go when:

- fake calendar is active
- JSON store is the live backend
- no public HTTPS webhook base is configured
- Twilio signature validation is skipped
- live provider credentials are missing
- Cal.com is selected but the event type selector is incomplete, for example a slug without `CALCOM_USERNAME` or `CALCOM_TEAM_SLUG`
- AVV/DPA/compliance review is being represented as complete when it is not
