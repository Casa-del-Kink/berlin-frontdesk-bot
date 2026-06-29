# Live-provider demo runbook

Purpose: run a real-provider Tilda demo without leaking secrets, touching personal calendars, or confusing a cleaned-up smoke with a failed smoke.

## Scope

This is for the Tilda Berlin hair-salon demo stack:

- client config: `clients/salon-demo.yaml`
- calendar: dedicated Tilda dev Google Calendar
- channels: phone-first plus WhatsApp continuation
- database: Supabase Postgres for pilot runtime, fake/JSON only for no-credential demos
- live telephony/voice: only after provider credentials are explicitly installed

## Never commit these

- `GOOGLE_SA_JSON`
- `DATABASE_URL` / `POSTGRES_URL`
- Supabase DB password or secret key
- Twilio / voice / LLM credentials
- bearer tokens such as `SERVER_TOOL_TOKEN`

Use shell env, VPS/container secret env, or the deployment platform secret store.

## 1. Calendar-only visible proof

Default mode creates a marked event, verifies it, deletes it, and verifies cleanup:

```bash
USE_FAKE_CALENDAR=false \
CLIENT_FILE=clients/salon-demo.yaml \
GOOGLE_SA_JSON='{"type":"service_account",...}' \
npm run google-calendar:smoke
```

Expected marker:

```text
GOOGLE_CALENDAR_SMOKE_OK
```

Visible-proof mode keeps the event in the Tilda calendar for a human to inspect:

```bash
KEEP_SMOKE_EVENT=true \
USE_FAKE_CALENDAR=false \
CLIENT_FILE=clients/salon-demo.yaml \
GOOGLE_SA_JSON='{"type":"service_account",...}' \
npm run google-calendar:smoke
```

Expected marker:

```text
GOOGLE_CALENDAR_SMOKE_OK_KEEP_EVENT
kept_event_id=...
found_event_link=...
```

After human inspection, delete the kept smoke event manually from the Tilda dev calendar.

## 2. Live booking smoke against Google Calendar

Use this when we want to prove the actual booking tool can create and find a real calendar event.

Default cleanup mode:

```bash
USE_FAKE_CALENDAR=false \
CLIENT_FILE=clients/salon-demo.yaml \
GOOGLE_SA_JSON='{"type":"service_account",...}' \
npm run live-calendar:smoke
```

Expected marker:

```text
LIVE_CALENDAR_BOOKING_SMOKE_OK
```

Visible booking proof mode:

```bash
KEEP_SMOKE_EVENT=true \
USE_FAKE_CALENDAR=false \
CLIENT_FILE=clients/salon-demo.yaml \
GOOGLE_SA_JSON='{"type":"service_account",...}' \
npm run live-calendar:smoke
```

Expected marker:

```text
LIVE_CALENDAR_BOOKING_SMOKE_OK_KEEP_EVENT
kept_event_id=...
verified_event_summary=Tilda Live Calendar Smoke...
```

If a smoke passes but the calendar looks empty, first check whether the output contains `deleted_event_id=...`. That means the event was intentionally cleaned up.

## 3. Full no-credential founder demo

Use this when credentials are not available or when showing the product flow without external provider risk:

```bash
npm run demo:fake
```

Expected marker:

```text
DEMO_FAKE_HAIR_SALON_OK
```

This proves phone booking, phone follow-up, WhatsApp continuation, owner-alert behavior, recovered-value metrics, and privacy export using fake calendar and local JSON state.

## 4. Live app demo preflight

Before exposing a public webhook or letting a real customer interact, run:

```bash
npm run deployment:preflight
```

The command should pass only when live blockers are resolved. If you are reviewing the checklist before secrets exist, use:

```bash
ALLOW_DEPLOYMENT_BLOCKERS=true npm run deployment:preflight
```

That prints the blockers without pretending the deploy is ready.

## Required runtime env for a live provider demo

Minimum for live booking plus protected operator endpoints:

```text
CLIENT_FILE=clients/salon-demo.yaml
USE_FAKE_CALENDAR=false
GOOGLE_SA_JSON=...
SERVER_TOOL_TOKEN=...
STORE_BACKEND=postgres
DATABASE_URL=... or POSTGRES_URL=...
DATA_RETENTION_DAYS=30
SKIP_TWILIO_SIGNATURE_VALIDATION=false
TWILIO_WEBHOOK_BASE_URL=https://<public-host>
COMPLIANCE_DPA_REVIEWED=true only after actual review
```

For WhatsApp and voice traffic, also set the selected provider credentials:

```text
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_FROM=...
OPENROUTER_API_KEY=...
```

Add voice provider credentials only after the provider is selected. Do not mix voice-provider secrets into docs.

## Manual demo checklist

1. Run `npm run deployment:preflight` and resolve blockers.
2. Run `npm run google-calendar:smoke` in cleanup mode.
3. If a visual proof is needed, re-run with `KEEP_SMOKE_EVENT=true` and inspect the Tilda calendar.
4. Run `npm run live-calendar:smoke` in cleanup mode.
5. If showing the full product without live calls, run `npm run demo:fake`.
6. If showing real WhatsApp/voice, confirm webhook URL, signature validation, and provider sandbox/number state first.

## Decision defaults

- Keep fake provider demos for CI and no-credential founder walkthroughs.
- Use the real Tilda dev calendar for calendar integration proof.
- Clean up smoke events by default.
- Keep visible proof only when a human explicitly needs to inspect it.
- Never use Michael's personal calendar.
