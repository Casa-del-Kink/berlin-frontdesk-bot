# Tilda hosted deploy prep and provider evidence snapshot

Status: narrow-wedge deploy-prep artifact for Berlin salon/barber pilot. No deployment, provider submission, outreach, push, or paid provider call was performed.

Generated from a real local server run on `http://127.0.0.1:4317`.

## What I ran

Started the current repo server in internal-demo mode:

```bash
PORT=4317 CLIENT_FILE=clients/salon-demo.yaml OWNER_ALERT_LOG_ONLY_ACCEPTED=true npm start
```

Verified health with a live HTTP request:

```bash
GET http://127.0.0.1:4317/health
```

Captured readiness with a live HTTP request:

```bash
GET http://127.0.0.1:4317/readiness/live-pilot
```

Generated the existing operator readiness bundle:

```bash
ALLOW_OPERATOR_READINESS_BUNDLE_BLOCKERS=true npm run operator:readiness:bundle
```

## Evidence files written

Machine-readable local evidence:

```text
tmp/tilda-provider-evidence/health.json
tmp/tilda-provider-evidence/readiness.json
tmp/tilda-ops-snapshot/operator-readiness-bundle.md
```

These `tmp/` files are local evidence only and are not committed as durable docs.

## Health endpoint evidence

Request:

```text
GET /health
```

Status:

```text
200
```

Observed body:

```json
{
  "ok": true,
  "client": "Glanz & Schnitt Berlin",
  "storeBackend": "json",
  "time": "2026-06-30T21:50:35.324Z"
}
```

Interpretation:

- The current server boots locally.
- The health endpoint is public and non-sensitive.
- The active client is still the demo salon config.
- The local runtime is using JSON storage, so it is not live-pilot ready.

## Readiness endpoint evidence

Request:

```text
GET /readiness/live-pilot
```

Status:

```text
409
```

Observed summary:

```text
ok=false
blockers=9
warnings=4
```

Observed blocker names:

```text
operator auth
twilio credentials
llm provider
calendar provider
retention policy
fake calendar disabled
store backend postgres
server tool token length
public webhook https
```

Observed warnings:

```text
production store
public webhook base
AVV/DPA review
node environment
```

Interpretation:

- Readiness is correctly blocking live pilot traffic.
- This is good behavior for the current state.
- The app should not be exposed to real salon/customer traffic until these are resolved.

## Operator readiness bundle evidence

Command:

```bash
ALLOW_OPERATOR_READINESS_BUNDLE_BLOCKERS=true npm run operator:readiness:bundle
```

Observed marker:

```text
OPERATOR_READINESS_BUNDLE_REVIEW_ONLY
```

Observed summary:

```text
Client: Glanz & Schnitt Berlin
Blockers: 11
Warnings: 4
```

Grouped owners:

| Owner | Blockers | Warnings | Main items |
|---|---:|---:|---|
| compliance | 1 | 1 | retention policy, AVV/DPA review |
| engineering | 4 | 3 | auth token, postgres store, public webhook, production env |
| operator | 2 | 0 | owner alert destination, owner alert route test |
| provider | 4 | 0 | Twilio, LLM, Google Calendar, fake calendar off |

## Public landing page evidence

This loop replaced the plain server root with a provider-review-safe CallTilder landing page served by:

```text
GET /
```

Verified visible page evidence:

- title: `CallTilder | AI reception for Berlin salons`
- hero: `Never miss a salon booking because the phone rang at the wrong time.`
- scope: independent Berlin salons and barbers
- AI disclosure section with `Ich bin die KI-Rezeption`
- summary-only data posture
- human handoff boundaries
- explicit Berlin-first narrow wedge
- operator/contact/privacy placeholders still visible for Roxu to fill

Provider review should still wait until the final domain is hosted and the operator placeholders are replaced.

## Host/deploy prep checklist

Before a hosted demo URL can be treated as useful provider evidence:

- [ ] choose host/deployment target
- [ ] set `NODE_ENV=production`
- [ ] set `SERVER_TOOL_TOKEN` to a long random value
- [ ] set `DATA_RETENTION_DAYS=30` or approved value
- [ ] set `STORE_BACKEND=postgres`
- [ ] set `DATABASE_URL` or `POSTGRES_URL`
- [ ] set `USE_FAKE_CALENDAR=false`
- [ ] set `GOOGLE_SA_JSON`
- [ ] set `TWILIO_ACCOUNT_SID`
- [ ] set `TWILIO_AUTH_TOKEN`
- [ ] set `TWILIO_WHATSAPP_FROM`
- [ ] set `TWILIO_WEBHOOK_BASE_URL=https://<public-host>`
- [ ] set `OPENROUTER_API_KEY`
- [ ] configure owner alert route
- [ ] run `/operator/alert-test`
- [ ] set `OWNER_ALERT_TESTED_AT` after confirmed delivery
- [ ] replace or approve current demo client identity before real salon pilot

## Recommended next loop

The next highest-leverage loop is:

```text
Add a hosted-smoke style contract for GET / so future changes cannot regress the public landing page, then prepare the exact host secret checklist for the chosen deployment target.
```

Acceptance criteria:

- `GET /` stays a provider-review-safe CallTilder landing page.
- `/health` still returns the JSON health response.
- landing smoke verifies AI disclosure and footer placeholders.
- style guard rejects broadening beyond Berlin salons/barbers.
- no provider submission or outreach happens without approval.
