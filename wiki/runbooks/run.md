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

## Test

| Suite | Command | Tag | Expected result | Last verified |
|---|---|---|---|---|
| Slot computation | `npm run check` | safe | tests free-slot logic, no creds (single 2-busy-block scenario only — not a broad gate) | 2026-07-02 ✓ |
| Typecheck | `npm run typecheck` | safe | `tsc --noEmit` clean | 2026-07-02 ✓ |
| First-test smoke | `npm run first-test:smoke` | local-state | `FIRST_TEST_SMOKE_OK` | 2026-07-02 ✓ |
| Server battletest | `npm run server:battletest` | local-state | `SERVER_BATTLETEST_OK` | 2026-07-02 ✓ (after de-rotting hardcoded booking dates) |
| Style guard | `npm run style:guard` | safe | Tilda voice/style check (python3; plain `python` works too) | 2026-07-02 ✓ (after fixing em dashes ff9905a introduced in deployment-readiness.md) |
| Postgres store smoke | `npm run postgres:smoke` | side-effecting | needs test `DATABASE_URL` | — (credential-gated; Phase 3) |
| Google Calendar smoke | `npm run google-calendar:smoke` | side-effecting | needs Google SA creds | — (credential-gated; Phase 3) |
| Live calendar booking | `npm run live-calendar:smoke` | side-effecting | writes a real calendar event | — (credential-gated; Phase 3) |
| Voice agent tool smoke | `npm run voice:smoke` | local-state | `VOICE_AGENT_TOOL_SMOKE_OK` | 2026-07-02 ✓ (after Windows fix: spawn tsx via require.resolve, not the .bin shell shim) |
| Fake-provider demo | `npm run demo:fake` | safe | `DEMO_FAKE_HAIR_SALON_OK` | 2026-07-02 ✓ |
| Deployment smoke | `npm run deployment:smoke` | local-state | `DEPLOYMENT_SMOKE_OK` | 2026-07-02 ✓ |
| Deployment preflight | `npm run deployment:preflight` | safe | without live env: `DEPLOYMENT_PREFLIGHT_BLOCKED` (baseline 2026-07-02: 11 blockers / 4 warnings — an unexpected pass here means the gate broke) | 2026-07-02 ✓ expected-fail |
| Supabase Postgres smoke | `npm run supabase:postgres:smoke` | side-effecting | bash + test DB | — (credential-gated; Phase 3) |

## Verify (what "green" means here)

Minimal set proving a change is safe to ship (no external accounts needed):

```
npm run check && npm run typecheck && npm run first-test:smoke && npm run server:battletest
```

Expect `FIRST_TEST_SMOKE_OK` and `SERVER_BATTLETEST_OK`. For deployment paths:
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
