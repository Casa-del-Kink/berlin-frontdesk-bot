# CallTilda frontend integration contract

Purpose: give the Lovable/Claude Code frontend a stable backend contract for `demo.calltilda.com` without coupling the marketing site to the Twilio, ElevenLabs, Cal.com, or Google Calendar internals.

## Product positioning contract

The frontend should keep this split:

```text
Marketing category: AI reception for appointment businesses
First GTM wedge: Berlin salons and barbers
Assistant persona: Tilda
Product/domain: CallTilda / calltilda.com
```

Use broad homepage copy, then narrow first-wedge proof:

```text
No more missed bookings.
Tilda answers when you can't.
AI reception for appointment businesses.
Launching first with Berlin salons and barbers.
```

Do not hard-code the whole site as salon-only. The default demo can be a Berlin salon/barber.

## Base URLs

Recommended deployment layout:

```text
https://calltilda.com       marketing site on Vercel
https://www.calltilda.com   marketing site on Vercel
https://demo.calltilda.com  demo frontend on Vercel
https://api.calltilda.com   backend API, if separated later
```

If demo frontend and API are same-origin, call relative paths like `/api/demo/config`.
If separated, configure a frontend env var such as:

```text
NEXT_PUBLIC_TILDA_API_BASE_URL=https://api.calltilda.com
```

## Public demo endpoints

These endpoints are intentionally separate from the protected `/tools/*` and `/webhook/*` provider endpoints.

### GET `/api/demo/config`

Public, no auth. Used by the frontend to render brand, copy, business fixture, services, mode, and endpoint paths.

Example response shape:

```json
{
  "brand": {
    "product": "CallTilda",
    "assistant": "Tilda",
    "domain": "calltilda.com",
    "category": "AI reception for appointment businesses",
    "firstWedge": "Launching first with Berlin salons and barbers"
  },
  "copy": {
    "hero": "No more missed bookings.",
    "subhero": "Tilda answers when you can't.",
    "description": "CallTilda helps appointment-based businesses answer calls and messages, check availability, and turn missed inquiries into bookings.",
    "disclosureGerman": "Hallo, hier ist Tilda von [Business]. Ich bin die KI-Rezeption. Wie kann ich dir helfen?",
    "disclosureEnglish": "Hi, this is Tilda from [Business]. I'm the AI reception. How can I help?"
  },
  "demoBusiness": {
    "name": "Glanz & Schnitt Berlin",
    "timezone": "Europe/Berlin",
    "language": "de",
    "services": [
      { "name": "Damenhaarschnitt", "durationMin": 60, "price": "ab 45 €" }
    ],
    "openingHours": { "days": [1, 2, 3, 4, 5, 6], "open": "09:00", "close": "19:00" }
  },
  "scheduling": {
    "provider": "google",
    "publicMode": "fake",
    "canCheckAvailability": true,
    "canBook": true
  }
}
```

### GET `/api/demo/readiness`

Public, no auth. Lets the frontend show or hide live demo actions.

Status:

- `200` if the public demo API is ready for the selected mode.
- `409` if blockers remain.

Example response:

```json
{
  "enabled": true,
  "mode": "fake",
  "canCheckAvailability": true,
  "canBook": true,
  "blockers": [],
  "warnings": []
}
```

### POST `/api/demo/check-availability`

Public demo endpoint. It calls the same Tilda scheduling tool as WhatsApp and ElevenLabs, but through a demo-safe wrapper.

Request:

```json
{
  "sessionId": "browser-session-or-random-id",
  "service": "Damenhaarschnitt",
  "from": "2026-07-02",
  "days": 7
}
```

Response:

```json
{
  "ok": true,
  "service": "Damenhaarschnitt",
  "durationMin": 60,
  "schedulingProvider": "google",
  "slots": [
    { "iso": "2026-07-02T10:00:00.000+02:00", "readable": "Thursday 2.07. 10:00" }
  ],
  "demo": { "mode": "fake", "sessionId": "browser-session-or-random-id" }
}
```

Frontend behavior:

- Show at most 3 slots.
- If `slots` is empty and `fallbackUrl` exists, show a friendly fallback CTA.
- Never expose provider details to the customer UI unless this is an internal technical demo.

### POST `/api/demo/book-appointment`

Public demo endpoint. In fake mode it creates a fake booking. In live-readonly mode it returns `409`. In live-booking mode it only works after an explicit env gate.

Request:

```json
{
  "sessionId": "browser-session-or-random-id",
  "name": "Laura Schneider",
  "service": "Damenhaarschnitt",
  "start": "2026-07-02T10:00:00+02:00"
}
```

Success response:

```json
{
  "ok": true,
  "when": "Thursday 2.07. 10:00",
  "link": "fake-event-demo_123",
  "schedulingProvider": "google",
  "channel": "server_tool",
  "estimatedValueCents": 4500,
  "idempotencyKey": "booking:demo:browser-session-or-random-id:damenhaarschnitt:2026-07-02t08:00:00.000z",
  "idempotentReplay": false,
  "demo": { "mode": "fake", "sessionId": "browser-session-or-random-id" }
}
```

Handled unavailable-slot response:

```json
{
  "error": "Slot is no longer available",
  "message": "That time was just taken. Please call check_availability again and offer fresh times.",
  "demo": { "mode": "fake", "sessionId": "browser-session-or-random-id" }
}
```

Frontend behavior:

- Treat `ok: true` as booked.
- Treat `error: "Slot is no longer available"` as a normal UX state, not a system failure.
- Hide internal fields such as `idempotencyKey`, `providerBookingId`, and `link` unless this is an operator/debug view.

## Demo modes

Configured on the backend:

```text
DEMO_PUBLIC_API_ENABLED=false|true
DEMO_PUBLIC_API_MODE=fake|live-readonly|live-booking
DEMO_PUBLIC_LIVE_BOOKING_ENABLED=false|true
```

### `fake`

Recommended for the first public demo.

Requirements:

```text
DEMO_PUBLIC_API_ENABLED=true
DEMO_PUBLIC_API_MODE=fake
USE_FAKE_CALENDAR=true
OWNER_ALERT_LOG_ONLY_ACCEPTED=true
```

Effect:

- Demo frontend can check slots.
- Demo frontend can book fake appointments.
- No live Google Calendar, Cal.com, Twilio, ElevenLabs, or WhatsApp traffic.

### `live-readonly`

Useful once Cal.com or Google Calendar credentials are ready but we do not want public booking writes.

Effect:

- Demo frontend can show availability from the selected scheduling provider.
- Public booking creates return `409`.

### `live-booking`

Use only for controlled demos, not the default public website.

Requirements:

```text
DEMO_PUBLIC_API_ENABLED=true
DEMO_PUBLIC_API_MODE=live-booking
DEMO_PUBLIC_LIVE_BOOKING_ENABLED=true
SCHEDULING_PROVIDER=google|calcom
```

Effect:

- Public demo can create real provider bookings.
- Use only with a dedicated demo calendar/event type.

## Protected backend endpoints for providers/operators

These are not browser-public endpoints. They require `Authorization: Bearer <SERVER_TOOL_TOKEN>` when `SERVER_TOOL_TOKEN` is set.

```text
POST /tools/check_availability       ElevenLabs/Twilio/internal tool path
POST /tools/book_appointment         ElevenLabs/Twilio/internal tool path
POST /tools/register_lead            ElevenLabs/Twilio/internal tool path
POST /webhook/voice/post-call        ElevenLabs post-call summary path
POST /operator/follow-up/send        reviewed WhatsApp follow-up path
GET  /metrics/today                  operator proof metrics
POST /privacy/export                 GDPR-support export
POST /privacy/delete                 GDPR-support delete
GET  /readiness/live-pilot           protected live-pilot readiness
```

The frontend must not call these directly from a browser unless a server-side proxy adds auth.

## CORS / hosting note

If the frontend is same-origin with the API, no CORS is needed.
If `demo.calltilda.com` calls `api.calltilda.com` directly from the browser, add a narrow CORS allowlist before deployment. Do not use `Access-Control-Allow-Origin: *` on protected endpoints.

## Local verification

Credential-free backend/frontend contract smoke:

```bash
npm run demo:api:smoke
```

Expected marker:

```text
DEMO_API_SMOKE_OK
```

Broader local backend proof:

```bash
npm run check
npm run scheduling:provider:check
npm run demo:api:smoke
npm run voice:smoke
npm run server:battletest
npm run typecheck
npm run secrets:scan
```

## Handoff to Lovable / Claude Code frontend

Build the frontend against:

1. `GET /api/demo/config` for copy, services, and mode.
2. `POST /api/demo/check-availability` for slots.
3. `POST /api/demo/book-appointment` for fake demo booking.
4. `GET /api/demo/readiness` to disable booking if backend mode blocks it.

Keep the UI copy broad enough for appointment businesses, with salon/barber as the default demo scenario.
