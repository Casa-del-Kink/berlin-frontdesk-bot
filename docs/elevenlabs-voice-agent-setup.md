# ElevenLabs voice agent setup

Purpose: connect the phone-first Tilda demo to a natural voice agent without changing the backend brain.

Tilda remains one virtual front desk across phone and WhatsApp. ElevenLabs is the voice layer. The backend remains the source of truth for availability, booking, follow-up capture, owner alerts, metrics, and retention.

## Target pilot flow

```text
caller phones Tilda number
telephony provider routes call to ElevenLabs voice agent
ElevenLabs speaks as Tilda
ElevenLabs calls Tilda server tools over HTTPS
Tilda backend checks calendar, books, or registers follow-up
ElevenLabs sends post-call summary webhook
owner alert and metrics update
```

## Required backend endpoints

The deployed backend must expose HTTPS endpoints:

```text
POST /tools/check_availability
POST /tools/book_appointment
POST /tools/register_lead
POST /webhook/voice/post-call
```

All tool and voice webhook calls should include:

```text
Authorization: Bearer <SERVER_TOOL_TOKEN>
Content-Type: application/json
```

## Credential-free voice tool smoke

Before connecting ElevenLabs, run the deterministic local smoke against the real Express endpoints with fake calendar and JSON state:

```bash
npm run voice:smoke
```

Expected marker:

```text
VOICE_AGENT_TOOL_SMOKE_OK
```

This starts the server locally, calls availability, booking, follow-up registration, and post-call summary endpoints with bearer auth, then checks phone-channel metrics and retry idempotency. It does not call ElevenLabs, Twilio, Google Calendar, Supabase, or any paid provider.

## Tool mapping

### check availability

Endpoint:

```text
POST /tools/check_availability
```

Body:

```json
{
  "phone": "+491701234567",
  "args": {
    "service": "Damenhaarschnitt",
    "from": "2026-07-01",
    "days": 7
  }
}
```

Expected response shape:

```json
{
  "service": "Damenhaarschnitt",
  "durationMin": 60,
  "slots": [
    { "iso": "2026-07-01T10:00:00.000+02:00", "readable": "Wednesday 1.07. 10:00" }
  ]
}
```

Voice instruction:

- offer at most two slots at once
- say times naturally
- ask which one works

### book appointment

Endpoint:

```text
POST /tools/book_appointment
```

Body:

```json
{
  "phone": "+491701234567",
  "args": {
    "name": "Laura Schneider",
    "service": "Damenhaarschnitt",
    "start": "2026-07-01T10:00:00+02:00",
    "channel": "phone"
  }
}
```

Expected response shape:

```json
{
  "ok": true,
  "when": "Wednesday 1.07. 10:00",
  "channel": "phone",
  "estimatedValueCents": 4500
}
```

Voice instruction:

- confirm the appointment in one sentence
- do not mention internal links, idempotency keys, or provider terms

### register follow-up

Endpoint:

```text
POST /tools/register_lead
```

Body:

```json
{
  "phone": "+491701234567",
  "args": {
    "name": "Laura Schneider",
    "service": "Färben & Strähnen",
    "notes": "Kundin ist unsicher zwischen Färben und Strähnen und möchte Rückruf.",
    "channel": "phone",
    "idempotencyKey": "elevenlabs-call-id-or-tool-call-id"
  }
}
```

Voice instruction:

- use this when the caller needs a human, is unsure, asks a complex question, or cannot pick a slot
- say that the team will follow up
- do not over-promise exact callback times unless configured for that client

### post-call summary

Endpoint:

```text
POST /webhook/voice/post-call
```

Body:

```json
{
  "callId": "elevenlabs-call-id",
  "phone": "+491701234567",
  "status": "booked",
  "summary": "Caller booked a Damenhaarschnitt for Wednesday 10:00."
}
```

Allowed status values:

```text
booked
needs_followup
answered
missed
voicemail
failed
```

Default storage rule:

- store short summary only
- do not store raw audio
- do not store full transcript unless explicitly approved and disclosed

## ElevenLabs agent identity

Use the Tilda identity and style files as source of truth:

```text
docs/tilda-identity.md
docs/tilda-voice-style.md
docs/demo-script-hair-salon.md
```

Agent opening:

```text
Hallo, hier ist Tilda von Glanz & Schnitt Berlin. Ich helfe dir gern mit Terminen und Fragen.
```

## Voice behavior rules

- sound like a real front desk person
- be warm, calm, and quick
- ask one question at a time
- push toward service, time, name, booking, or handoff
- offer at most two concrete times at once
- keep replies short
- hand off quickly for complaints, unclear requests, sensitive topics, or human requests
- never say chatbot
- never say AI language model
- never say how may I assist you
- never say thank you for reaching out
- never say kindly
- never use the em dash character in scripts or text prompts
- do not offer SMS

## Provider configuration checklist

- [ ] Voice provider selected: ElevenLabs or named alternative
- [ ] Telephony provider selected: Twilio Voice, Sipgate, Telnyx, Vonage, or Plivo
- [ ] Public HTTPS backend URL exists
- [ ] `SERVER_TOOL_TOKEN` set
- [ ] Tools configured with bearer authorization
- [ ] Tilda dev calendar smoke passed
- [ ] Supabase Postgres smoke passed or explicitly deferred
- [ ] Call recording disabled by default
- [ ] Full transcript storage disabled by default
- [ ] Post-call summary webhook enabled
- [ ] Owner alert path verified
- [ ] German opening reviewed

## Local verification before live provider setup

Run:

```bash
npm run style:guard
npm run typecheck
npm run check
npm run first-test:smoke
npm run server:battletest
```

`server:battletest` already exercises:

- bearer protection for tool endpoints
- availability tool
- booking tool
- double-book guard
- voice post-call webhook
- idempotent provider retry handling
- owner alert dry run
- metrics
- privacy export/delete basics

## Live setup blockers

Still needed before a real call can be answered:

- selected voice provider account
- telephony number or forwarding setup
- public HTTPS deployment URL
- runtime secrets configured
- Supabase or accepted temporary store decision

## Demo success criteria

A successful first live voice demo means:

1. Caller hears Tilda answer naturally.
2. Caller requests a hair appointment.
3. Tilda checks availability via backend tool.
4. Tilda offers concrete slots.
5. Tilda books or captures follow-up.
6. Calendar, owner alert, metrics, and post-call summary all update.
7. No customer-facing text or voice sounds like a generic AI bot.
