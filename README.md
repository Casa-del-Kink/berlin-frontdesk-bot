# Berlin Front-Desk Bot (demo)

AI 24/7 front of house for independent Berlin hair salons. The core wedge is missed-booking recovery:
a potential customer calls or messages while the owner is busy, the bot replies immediately,
qualifies the request, checks real availability, locks in the appointment, alerts the owner,
and reports estimated recovered revenue. German/English is auto-detected.

**Stack:** Node + TypeScript · WhatsApp via Twilio (sandbox) · Claude via OpenRouter · Google Calendar.

## Architecture (one file per piece, swappable)

```
WhatsApp (Twilio)  ──>  src/server.ts  (webhook)
                          │
                          ├─ src/llm.ts      AI loop (OpenRouter) + tool use
                          ├─ src/tools.ts    check_availability / book_appointment / register_lead
                          ├─ src/calendar.ts Google Calendar (freebusy + create event)
                          ├─ src/slots.ts    free-slot computation (pure, tested)
                          ├─ src/store.ts    leads + conversations (atomic JSON)
                          ├─ src/prompt.ts   system prompt built from the YAML
                          └─ src/whatsapp.ts sending (Twilio; swap to 360dialog/Meta here)

clients/salon-demo.yaml  ← one business = one file. Adapt = copy and edit.
```

## Getting started

1. **Dependencies**
   ```
   npm install
   npm run check      # tests the free-slot computation (no credentials needed)
   npm run typecheck
   ```

2. **Credential-free first-test smoke** — before connecting Twilio/Google/OpenRouter, run the
   product booking path against the shared tools with a fake local calendar:
   ```
   npm run first-test:smoke
   ```
   Expected result: `FIRST_TEST_SMOKE_OK`. This verifies availability, booking, double-booking
   protection, lead registration, owner-alert dry run, channel attribution, estimated recovered-revenue
   metrics, and JSON persistence without external accounts.

3. **Local server battletest** — when changing endpoints or provider seams, run a full local
   HTTP battletest against a fake calendar and temporary state file:
   ```
   npm run server:battletest
   ```
   Expected result: `SERVER_BATTLETEST_OK`. This starts the Express server, verifies protected
   operator endpoints require bearer auth, exercises availability/booking/double-booking guard,
   logs a phone follow-up, checks unsigned Twilio webhooks are rejected, validates privacy errors,
   and confirms final recovered-revenue metrics.

4. **Environment** — copy `.env.example` to `.env` and fill in:
   - **OpenRouter:** create a key at https://openrouter.ai/keys → `OPENROUTER_API_KEY`.
     If the default model fails, set another one from https://openrouter.ai/models.
   - **Twilio sandbox:** Console → Messaging → Try it out → WhatsApp sandbox.
     Copy SID and Auth Token. From your phone, join the sandbox by sending the
     "join …" code to the number Twilio shows you.
   - **Google Calendar:**
     1. Google Cloud Console → create a project → enable "Google Calendar API".
     2. Create a **Service Account** and a **JSON key**.
     3. Paste the JSON (single line) into `GOOGLE_SA_JSON`.
     4. In Google Calendar create a test calendar, and under "Share with specific
        people" add the **service account email** with "Make changes to events".
     5. Copy the **calendar ID** (calendar settings) into `clients/salon-demo.yaml`
        (`calendarId`).

5. **Run**
   ```
   npm run dev
   ```
   Expose the port to the internet for the Twilio webhook (e.g. `npx localtunnel --port 3000`
   or ngrok), and in the Twilio sandbox set that public URL + `/webhook/whatsapp`
   under "When a message comes in".

6. **Try the demo:** message the Twilio sandbox number over WhatsApp as if you were a
   salon customer. The bot will take you all the way to a booked appointment in the calendar.

## Production notes

- `GET /health` returns a JSON health check.
- `GET /metrics/today` returns the narrow-wedge proof metrics: inquiries, booked appointments,
  follow-ups, channel mix, estimated booked revenue, and estimated pipeline revenue. Set
  `SERVER_TOOL_TOKEN` to protect it with bearer auth.
- `POST /privacy/export` and `POST /privacy/delete` support first-pilot GDPR operations for one
  customer phone identifier. These are operator-only endpoints and must be protected with
  `SERVER_TOOL_TOKEN` in any non-local deployment.
- `POST /privacy/retention/purge` supports operator-triggered retention cleanup. It defaults to
  `dryRun: true`; set `dryRun: false` deliberately after checking counts.
- `GET /readiness/live-pilot` is a bearer-protected gate report for live-pilot blockers
  (credentials, signature validation, fake calendar, retention policy) and JSON-store warnings.
  Set `REQUIRE_LIVE_PILOT_READINESS=true` only when startup should fail on unresolved blockers.
- Twilio webhook requests are signature-validated by default. Set `TWILIO_WEBHOOK_BASE_URL`
  to the public tunnel/domain if auto-detection does not match Twilio's URL. Use
  `SKIP_TWILIO_SIGNATURE_VALIDATION=true` only for local manual tests.
- `POST /tools/:name` exposes the shared "one brain" tools for ElevenLabs/server-tool use.
  Set `SERVER_TOOL_TOKEN` to require an `Authorization` bearer header. `register_lead` accepts an
  optional `idempotencyKey` so provider retries do not duplicate follow-up leads or owner alerts.
- `POST /webhook/voice/post-call` stores phone call outcomes and sends owner follow-up alerts
  for missed/voicemail/failed/needs-follow-up calls. Provider retries with the same `callId` are
  idempotent and do not duplicate stored outcomes or alerts. See `docs/voice-phone-readiness.md`.
- `book_appointment` re-checks the requested interval inside an in-process booking lock before
  creating the event. Same customer/service/start retries are idempotent; different customers are
  still rejected by the double-booking guard.
- `ownerWhatsapp` empty → owner alerts print to the console (DRYRUN).
- Data in `data/state.json` by default, written atomically. For production volume or multiple
  server instances, swap to Postgres before paid pilot; see `docs/production-data-readiness.md`.
- For production with clinics (health data) → swap Twilio for **360dialog** (German BSP,
  DPA/GDPR) by touching only `whatsapp.ts`.
- Strategy, scoping and all product decisions live in `PROJECT.md`.
