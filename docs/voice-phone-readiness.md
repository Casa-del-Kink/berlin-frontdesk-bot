# Voice / phone readiness notes

Goal: keep the architecture as **one brain, two channels**. WhatsApp and phone must use the same backend tools, client YAML, calendar, store, owner alerts, daily summary, and privacy deletion/export flow.

## Current voice-facing backend surface

- `POST /tools/check_availability`
- `POST /tools/book_appointment`
- `POST /tools/register_lead`
- `POST /webhook/voice/post-call`

All tool/webhook endpoints should be protected with `SERVER_TOOL_TOKEN` in any real deployment:

Send an `Authorization` header whose value is the configured server-tool bearer credential.
Also send `Content-Type: application/json`.

## ElevenLabs server-tool mapping

Configure the voice agent with these server tools:

### `check_availability`

Endpoint: `POST https://<base-url>/tools/check_availability`

Example body:

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

Voice behavior: never invent slots. If no slots are returned, offer the configured fallback booking URL or register a lead for owner follow-up.

### `book_appointment`

Endpoint: `POST https://<base-url>/tools/book_appointment`

Example body:

```json
{
  "phone": "+491701234567",
  "args": {
    "name": "Anna Beispiel",
    "service": "Damenhaarschnitt",
    "start": "2026-07-01T14:00:00+02:00",
    "channel": "phone"
  }
}
```

The backend re-checks the exact interval before creating the event, so the voice agent must handle `Slot is no longer available` by calling `check_availability` again.

### `register_lead`

Endpoint: `POST https://<base-url>/tools/register_lead`

Example body:

```json
{
  "phone": "+491701234567",
  "args": {
    "name": "Anna Beispiel",
    "service": "Färben & Strähnen",
    "notes": "Wants advice before booking; asked for callback tomorrow afternoon.",
    "channel": "phone"
  }
}
```

## Post-call webhook

Endpoint: `POST https://<base-url>/webhook/voice/post-call`

Example body:

```json
{
  "callId": "el_call_123",
  "phone": "+491701234567",
  "status": "needs_followup",
  "summary": "Caller wanted balayage pricing and asked for a human callback.",
  "transcriptUrl": "https://provider.example/transcripts/123"
}
```

Allowed statuses: `booked`, `needs_followup`, `answered`, `missed`, `voicemail`, `failed`.

Data minimization default: store only phone, call ID, status, short summary, and optional external transcript/recording URLs. Avoid storing raw transcripts unless the client has reviewed consent wording, retention, and DPA/AVV coverage.

## German compliance cautions for voice

Draft-only planning notes; validate with lawyer/Datenschutz review before real clients.

- Start-call disclosure should say the caller is speaking with an AI assistant and that the call may be summarized for appointment handling.
- If recording or transcription is enabled, obtain explicit consent before recording/transcribing.
- Avoid medical/dental/health triage. For med-spa/aesthetics, route risk, contraindication, pain, infection, pregnancy, medication, or emergency language to a human.
- Keep retention short for transcripts/recordings; prefer summaries over raw recordings for the first salon pilot.
- Ensure provider DPAs/AVVs are in place for Twilio/ElevenLabs/transcription/calendar vendors before production.
- Use `docs/compliance-live-pilot-pack.md` as the launch checklist for exact disclosure text, privacy contact, AVV/DPA register, and retention decisions.

## Daytime review before pilot phone answering

1. Decide whether pilot phone answering is after-hours only, overflow/no-answer only, or always-on.
2. Pick provider path: ElevenLabs conversational agent + Twilio number forwarding, or Twilio Voice + custom media stream.
3. Approve exact German disclosure/recording wording.
4. Decide retention for call summaries/transcripts/recordings.
5. Decide whether phone bookings should confirm by WhatsApp after call. SMS is out of scope for the pilot.
