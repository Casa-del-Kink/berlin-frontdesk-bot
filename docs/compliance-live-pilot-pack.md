# German live-pilot compliance pack

> Draft operational pack for first Tilda Front Desk pilots in Germany/EU. This is not legal advice. Have a German lawyer/Datenschutz reviewer approve the final wording, AVV/DPA setup, and retention choices before real customer traffic.

## Scope and default position

Tilda Front Desk acts as a digital front-of-house for appointment-heavy businesses. For the first salon pilot, keep the processing narrow:

- Answer appointment/service questions over WhatsApp and/or phone.
- Check availability and book or capture a follow-up lead.
- Alert the owner/operator when a human must take over.
- Store only the data needed to handle the appointment request, prove recovered value, and support export/delete/retention operations.

Avoid medical/dental/health triage, special-category data, automated decisions with legal/significant effects, or raw call transcript storage unless separately reviewed.

## Launch compliance checklist

Use this checklist before connecting live customers.

### Client/business setup

- [ ] Client has reviewed and approved the AI disclosure text shown to customers.
- [ ] Client has reviewed and approved the short privacy/data-use text.
- [ ] Privacy contact is configured for customer requests (`privacyContact` in client YAML).
- [ ] Retention period is agreed and set (`DATA_RETENTION_DAYS`, e.g. 30-90 days for pilot data).
- [ ] Human handoff rules are configured for complaints, sensitive issues, emergencies, refunds, and explicit human requests.
- [ ] Client confirms services/prices/hours are accurate and non-sensitive.
- [ ] Client confirms whether the bot may autonomously book or only create owner-confirmation follow-ups.

### Vendor / processor setup

- [ ] Hosting provider reviewed.
- [ ] WhatsApp/SMS/phone provider reviewed (Twilio/360dialog/etc.).
- [ ] LLM provider reviewed (OpenRouter/model provider or alternative).
- [ ] Calendar provider reviewed (Google Calendar or alternative).
- [ ] Voice/transcription provider reviewed if phone is enabled (ElevenLabs/Twilio/etc.).
- [ ] AVV/DPA or equivalent processor terms collected for every production vendor.
- [ ] Subprocessor list prepared for the client contract/privacy notice.
- [ ] Cross-border transfer mechanism reviewed where vendors/processors are outside the EU/EEA.

### Product controls

- [ ] `SERVER_TOOL_TOKEN` set for operator/tool/privacy/metrics/readiness endpoints.
- [ ] Twilio signature validation enabled; `SKIP_TWILIO_SIGNATURE_VALIDATION` is not `true`.
- [ ] `TWILIO_WEBHOOK_BASE_URL` matches the public HTTPS URL.
- [ ] Fake providers disabled for live booking (`USE_FAKE_CALENDAR` is not `true`).
- [ ] `POST /privacy/export` verified with a real test phone identifier.
- [ ] `POST /privacy/delete` verified and deletes conversations, leads, and call outcomes.
- [ ] `POST /privacy/retention/purge` dry-run reviewed before any destructive purge.
- [ ] `GET /readiness/live-pilot` reviewed before launch.
- [ ] Logs do not contain secrets or unnecessary raw customer data.

### Phone/voice-specific controls

- [ ] Call greeting states that the caller is speaking with an AI assistant.
- [ ] If recording or transcription is enabled, explicit consent wording is approved and used before recording/transcribing.
- [ ] Raw transcripts/recordings are disabled by default for the first salon pilot unless separately approved.
- [ ] Only short call summaries and provider URLs are stored by default.
- [ ] Retention for call summaries/transcripts/recordings is documented separately.

## Customer-facing AI disclosure templates

Use these as draft text. Keep the wording short and natural in the channel.

### WhatsApp first message — German

> Hallo, ich bin der digitale Assistent von {{businessName}}. Ich helfe dir bei Fragen und Terminen. Wenn etwas unklar ist oder du mit einem Menschen sprechen möchtest, gebe ich es ans Team weiter.

### WhatsApp first message — English

> Hi, I’m the digital assistant for {{businessName}}. I can help with questions and appointments. If anything is unclear or you want a person, I’ll pass it to the team.

### Phone opening — German, no recording/transcription

> Hallo, hier ist der digitale Assistent von {{businessName}}. Ich helfe bei Terminanfragen und kann dein Anliegen ans Team weitergeben, wenn nötig.

### Phone opening — English, no recording/transcription

> Hi, this is the digital assistant for {{businessName}}. I can help with appointment requests and pass things to the team if needed.

### Phone opening — German, with recording/transcription

> Hallo, hier ist der digitale Assistent von {{businessName}}. Ich kann dir bei Terminanfragen helfen. Damit das Team deine Anfrage bearbeiten kann, kann dieser Anruf zusammengefasst oder transkribiert werden. Bist du damit einverstanden?

Only continue recording/transcription after an affirmative answer. If the caller refuses, route to a non-recorded handoff path or human callback.

## Privacy / data-use short text

### German short version

> Wir nutzen deine Angaben, um deine Anfrage zu beantworten, Termine zu koordinieren und dich bei Rückfragen zu kontaktieren. Dazu können Nachrichtentexte, Telefonnummer, Terminwunsch, gebuchte Leistung und kurze Gesprächszusammenfassungen verarbeitet werden. Du kannst Auskunft oder Löschung deiner gespeicherten Daten über {{privacyContact}} anfragen.

### English short version

> We use your details to answer your request, coordinate appointments, and contact you for follow-up. This may include message text, phone number, appointment request, booked service, and short call summaries. You can request export or deletion of your stored data via {{privacyContact}}.

## Privacy notice insertion block

Client sites/privacy notices should be reviewed by counsel, but the pilot needs a clear insertion block:

```text
Digital appointment assistant

We use a digital assistant to answer appointment-related customer inquiries via messaging and/or phone. The assistant may process the information you provide, such as your phone number, message content, preferred service, desired appointment time, booking status, and short summaries of calls or messages. The purpose is to respond to your inquiry, coordinate appointments, perform follow-up, and support customer service.

Depending on the channel, service providers may process data on our behalf, including hosting, messaging/phone providers, calendar providers, and AI/LLM providers. We use these providers as processors/subprocessors where applicable and keep the processed data limited to what is needed for appointment handling.

You may request information about, correction of, or deletion of your stored appointment-assistant data by contacting: {{privacyContact}}.
```

## AVV/DPA and subprocessor register template

Maintain one row per production vendor.

| Vendor | Role | Data categories | Region / transfer note | AVV/DPA status | Retention / deletion note | Owner |
|---|---|---|---|---|---|---|
| Hosting provider | App hosting / logs | Config, logs, customer request metadata | TBD | TODO | Log retention TBD | Tilda/operator |
| Twilio or WhatsApp BSP | Messaging/phone transport | Phone numbers, message/call metadata, content depending on channel | TBD | TODO | Provider retention TBD | Tilda/operator |
| OpenRouter / LLM provider | AI response generation | Prompt/context needed for replies | TBD | TODO | Disable training if applicable; review provider terms | Tilda/operator |
| Google Calendar | Booking source of truth | Appointment name/service/time, calendar metadata | TBD | TODO | Calendar retention follows client calendar policy | Client/Tilda |
| ElevenLabs / voice provider | Voice agent/transcription if enabled | Caller audio/transcript/summary depending on settings | TBD | TODO | Prefer no raw recording/transcript storage for first pilot | Tilda/operator |

## Data minimization defaults

| Data | Store? | Default retention | Notes |
|---|---:|---|---|
| Phone identifier | Yes | `DATA_RETENTION_DAYS` | Needed for follow-up/export/delete. |
| Conversation messages | Yes, capped | `DATA_RETENTION_DAYS` | Keep capped history for context; do not use for training. |
| Lead/booking records | Yes | Client-agreed period | Needed for appointment handling and recovered-value proof. |
| Call outcomes | Yes | Client-agreed period | Store status and short summary. |
| Raw call transcripts | No by default | Only if approved | Requires consent/retention/DPA review. |
| Recordings | No by default | Only if approved | Requires explicit consent and retention policy. |
| Sensitive/health data | Avoid | N/A | Route to human; do not triage. |

## Data subject request runbook

Operator-only. Requires `SERVER_TOOL_TOKEN`.

### Export

```bash
curl -sS -X POST "$BASE_URL/privacy/export" \
  -H "Authorization: Bearer $SERVER_TOOL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"whatsapp:+49123456789"}'
```

### Delete

```bash
curl -sS -X POST "$BASE_URL/privacy/delete" \
  -H "Authorization: Bearer $SERVER_TOOL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"phone":"whatsapp:+49123456789"}'
```

### Retention dry run, then deliberate purge

```bash
curl -sS -X POST "$BASE_URL/privacy/retention/purge" \
  -H "Authorization: Bearer $SERVER_TOOL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxAgeDays":90}'

curl -sS -X POST "$BASE_URL/privacy/retention/purge" \
  -H "Authorization: Bearer $SERVER_TOOL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"maxAgeDays":90,"dryRun":false}'
```

## AI Act / transparency note

For the current first-pilot scope, treat the bot as a transparent customer-service assistant, not as a high-risk AI system. Still keep the customer informed that they are interacting with a digital/AI assistant and provide a simple human handoff path. Do not expand into medical triage, employment, credit, legal advice, or other high-risk/sensitive uses without separate review.

## Daytime review decisions

1. Approve final German/English AI disclosure wording.
2. Decide whether phone recording/transcription is disabled, opt-in only, or not used at all for first pilot.
3. Pick retention period for messages, leads, call summaries, transcripts, and recordings.
4. Confirm who is privacy contact for the pilot: client, Tilda, or shared mailbox.
5. Confirm subprocessor/vendor list and AVV/DPA status before production traffic.
6. Confirm whether autonomous booking is allowed or owner confirmation is required for the first client.
