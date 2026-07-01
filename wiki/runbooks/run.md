---
kind: runbook
authority: evidence
source-role: project-run
owner: berlin-frontdesk-bot
updated: 2026-06-29
model-portable: true
---

# run.md — berlin-frontdesk-bot (Tilda)

> Lazy-loaded run/build/test/verify mechanics for this repo. Any LLM reads this
> on demand via the `AGENTS.md` §8 pointer. Authoritative for this repo; beats
> the OS-tier snapshot on conflict. Commands assume the repo root.

## How to read this runbook

- Tags: **safe** (no side effects), **local-state** (touches local files/DB
  only), **side-effecting** (network/deploy/external writes — needs approval).

## Prerequisites

- **Runtime:** Node (ESM, `"type": "module"`), TypeScript via `tsx`. Python 3
  only for `npm run style:guard`.
- **Install** (only with approval if deps absent): `npm install`.
- **Env / secrets:** copy `.env.example` → `.env`. Keys: `OPENROUTER_API_KEY`
  (https://openrouter.ai/keys), Twilio sandbox SID + auth token, `GOOGLE_SA_JSON`
  (service-account JSON, single line) + calendar ID in `clients/salon-demo.yaml`.
  Optional: `STORE_BACKEND=postgres` + `DATABASE_URL`/`POSTGRES_URL`,
  `SERVER_TOOL_TOKEN` (bearer-protects operator endpoints). `.env` is gitignored.

## Launch

| Goal | Command | Tag | Notes |
|---|---|---|---|
| Dev server (watch) | `npm run dev` | local-state | `tsx watch src/server.ts`. Default port 3000 — check `OS/system/port-registry.md`. Expose via `npx localtunnel --port 3000` / ngrok for the Twilio webhook (`/webhook/whatsapp`). |
| Start (no watch) | `npm run start` | local-state | |
| Fake-provider demo | `npm run demo:fake` | safe | No credentials. |
| Public demo API smoke | `npm run demo:api:smoke` | local-state | Starts real server with fake calendar/state and proves `/api/demo/*` frontend contract. |
| Public demo API Cal.com smoke | `npm run demo:api:calcom:smoke` | local-state | Starts real server against a local mock Cal.com API and proves gated `live-booking` demo endpoints use the Cal.com scheduling provider without live calls. |

## Test

| Suite | Command | Tag | Expected result | Last verified |
|---|---|---|---|---|
| Slot computation | `npm run check` | safe | tests free-slot logic, no creds | — (per README) |
| Typecheck | `npm run typecheck` | safe | `tsc --noEmit` clean | — |
| First-test smoke | `npm run first-test:smoke` | local-state | `FIRST_TEST_SMOKE_OK` | — (per README) |
| Server battletest | `npm run server:battletest` | local-state | `SERVER_BATTLETEST_OK` | — (per README) |
| Server Cal.com battletest | `npm run server:calcom:battletest` | local-state | `SERVER_CALCOM_BATTLETEST_OK`; starts real server against a local mock Cal.com API, no live provider calls | — |
| Public demo API smoke | `npm run demo:api:smoke` | local-state | `DEMO_API_SMOKE_OK` | — |
| Public demo API Cal.com smoke | `npm run demo:api:calcom:smoke` | local-state | `DEMO_API_CALCOM_SMOKE_OK`; no live provider calls, mock Cal.com only | — |
| Cal.com live-smoke contract | `npm run calcom:smoke:contract` | safe | `CALCOM_SMOKE_CONTRACT_OK`; proves the live smoke fails closed without approval and does not print secret sentinels | — |
| Deployment handoff smoke | `npm run deployment:handoff:smoke` | safe | `DEPLOYMENT_HANDOFF_SMOKE_OK`; no-secret hosted handoff report shape | — |
| Hosting handoff smoke | `npm run hosting:handoff:smoke` | safe | `HOSTING_HANDOFF_SMOKE_OK`; no-secret hosting target checklist | — |
| Rate-limit smoke | `npm run rate-limit:smoke` | local-state | `RATE_LIMIT_SMOKE_OK`; starts real server with fake providers and proves public demo + operator/tool throttles return 429 without affecting health | — |
| Twilio credential smoke | `npm run twilio:credentials:smoke` | safe | `TWILIO_CREDENTIAL_SMOKE_OK`; verifies API-key-over-Auth-Token outbound REST selection without provider calls | — |
| LLM provider smoke contract | `npm run llm:provider:smoke:contract` | safe | `LLM_PROVIDER_SMOKE_CONTRACT_OK`; verifies live OpenRouter smoke fails closed without credentials/approval and prints no secret values | — |
| LLM provider smoke | `LLM_PROVIDER_SMOKE_APPROVED=true npm run llm:provider:smoke` | side-effecting | `LLM_PROVIDER_SMOKE_OK`; needs `OPENROUTER_API_KEY`; sends only a fixed no-customer German salon connectivity fixture to OpenRouter | — |
| Style guard | `npm run style:guard` | safe | Tilda voice/style check (python3) | — |
| Secrets scan | `npm run secrets:scan` | safe | `SECRETS_SCAN_OK` | — |
| Postgres store smoke | `npm run postgres:smoke` | side-effecting | needs test `DATABASE_URL` | — |
| Google Calendar smoke | `npm run google-calendar:smoke` | side-effecting | needs Google SA creds | — |
| Live calendar booking | `npm run live-calendar:smoke` | side-effecting | writes a real calendar event | — |
| Cal.com live booking | `CALCOM_SMOKE_APPROVED=true npm run calcom:smoke` | side-effecting | writes, verifies, and cancels a real Cal.com test booking | — |
| Voice agent tool smoke | `npm run voice:smoke` | local-state | ElevenLabs server-tool path | — |
| Operator readiness bundle smoke | `npm run operator:readiness:bundle:smoke` | local-state | `OPERATOR_READINESS_BUNDLE_SMOKE_OK` | — |
| Operator demo packet | `npm run operator:demo:packet` | local-state | `OPERATOR_DEMO_PACKET_OK` | — |
| Operator Cal.com demo packet | `npm run operator:demo:calcom:packet` | local-state | `OPERATOR_DEMO_CALCOM_PACKET_OK`; starts real server against a local mock Cal.com API and proves one-brain availability/booking, idempotency, post-call draft, and metrics without live calls | — |
| Provider proof manifest | `npm run provider:proof:manifest` | safe | `PROVIDER_PROOF_MANIFEST_OK`; report-only, no live provider calls | — |
| Provider proof manifest smoke | `npm run provider:proof:manifest:smoke` | safe | `PROVIDER_PROOF_MANIFEST_SMOKE_OK`; verifies no secret values are printed | — |
| Supabase Postgres smoke | `npm run supabase:postgres:smoke` | side-effecting | needs test DB | — |

## Verify (what "green" means here)

Minimal set proving a change is safe to ship (no external accounts needed):

```
npm run check && npm run typecheck && npm run first-test:smoke && npm run demo:api:smoke && npm run server:battletest
```

Expect `FIRST_TEST_SMOKE_OK`, `DEMO_API_SMOKE_OK`, and `SERVER_BATTLETEST_OK`. For deployment paths:
`npm run deployment:preflight` then `npm run deployment:smoke`.

## Do NOT run without explicit approval

- `live-calendar:smoke` — creates a real Google Calendar event.
- `postgres:smoke` / `supabase:postgres:smoke` — write to a real DB.
- Anything that sends WhatsApp/voice traffic to a real customer number.
- `POST /privacy/retention/purge` with `dryRun: false` — destructive cleanup.

## Drift notes

_(append-only)_
- 2026-06-29 — Runbook seeded from README.md + package.json during OS
  onboarding. "Last verified" cells are unfilled; fill them the first time each
  command is actually run in this environment.
