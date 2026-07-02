# ElevenLabs voice agent setup

Purpose: connect the phone-first Tilda demo to a natural voice agent without changing the backend brain.

Tilda remains one virtual front desk across phone and WhatsApp. ElevenLabs Conversational AI (Agents platform) is the voice layer. The backend remains the source of truth for availability, booking, follow-up capture, owner alerts, metrics, and retention.

## Target pilot flow

```text
caller phones Tilda number
telephony provider routes call to ElevenLabs voice agent
ElevenLabs speaks as Tilda
ElevenLabs calls Tilda server tools over HTTPS
Tilda backend checks scheduling, books, or registers follow-up
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

`POST /webhook/voice/post-call` accepts several real ElevenLabs payload shapes (flat fields, `data.*`, and `data.analysis.*`), normalized by `src/voice-post-call.ts` before storage. See "Post-call payload shapes" below.

## Credential-free voice tool smoke

Before connecting ElevenLabs, run the deterministic local smokes against the real Express endpoints with fake scheduling and JSON state, plus the two contract-level smokes that need no network:

```bash
npm run voice:smoke
npm run voice:contract:smoke
npm run voice:post-call:smoke
```

Expected markers:

```text
VOICE_AGENT_TOOL_SMOKE_OK
VOICE_AGENT_CONTRACT_SMOKE_OK
VOICE_POST_CALL_NORMALIZER_SMOKE_OK
```

These start the server locally, call availability, booking, follow-up registration, and post-call summary endpoints with bearer auth, then check phone-channel metrics, retry idempotency, and payload normalization. None of them call ElevenLabs, Twilio, or any paid provider.

## PATH A: automatic wiring (default)

`npm run voice:wire-agent` creates or updates one ElevenLabs Conversational AI agent named `tilda-frontdesk` (or reuses `ELEVENLABS_AGENT_ID` if set), attaches the three server tools, and configures the post-call webhook. It is idempotent: re-running it updates the existing agent, secret, and tools instead of duplicating them. It must run WHERE THE ENV LIVES, because it reads `ELEVENLABS_API_KEY`, `VOICE_AGENT_PUBLIC_BASE_URL`, and `SERVER_TOOL_TOKEN` directly from the process environment and never prints their values.

### Run from the Render shell (after Stage-2b env is set)

`SERVER_TOOL_TOKEN` is already present in that environment; Render generates it automatically (see `render.yaml`, `generateValue: true`). Set `ELEVENLABS_API_KEY` and `VOICE_AGENT_PUBLIC_BASE_URL` in the Render dashboard first (the latter is the same public HTTPS host already used for `TWILIO_WEBHOOK_BASE_URL`), then:

```bash
render ssh -s berlin-frontdesk-bot
npm run voice:wire-agent
```

### Run from a local shell instead

Only if you export the same three variables locally (never commit them):

```bash
ELEVENLABS_API_KEY=... VOICE_AGENT_PUBLIC_BASE_URL=https://<public-host> SERVER_TOOL_TOKEN=... npm run voice:wire-agent
```

### Expected output

```text
VOICE_WIRE_AGENT_SUMMARY_START
agent_id=...
tool_id[check_availability]=...
tool_id[book_appointment]=...
tool_id[register_lead]=...
post_call_webhook=https://<public-host>/webhook/voice/post-call
secret_name=tilda-server-tool-token
VOICE_WIRE_AGENT_OK
```

No secret value is ever printed. On failure the script prints `VOICE_WIRE_AGENT_FAILED` plus the API error message (or, for missing environment variables, the exact variable names) and exits non-zero. If the live ElevenLabs API shape differs from what the script expects at runtime, it fails with that error message rather than guessing; fall back to PATH B below.

The single call most likely to drift from the live API is `configurePostCallWebhook` in `src/elevenlabs-wire-agent.ts`. Post-call delivery is a workspace-level setting, not an agent field: the script registers a workspace webhook object once (`POST /v1/workspace/webhooks`, idempotent by name `tilda-post-call`), then references it by id from the workspace Conversational AI settings (`PATCH /v1/convai/settings`, `webhooks.post_call_webhook_id`, `events: ["transcript"]`). If ElevenLabs changes either of those two endpoints or field names, this is where the error will surface. Use PATH B step 4 below for the console equivalent.

### Prove the wiring script without a real API key

```bash
npm run voice:wire-agent:smoke
```

Expected marker: `VOICE_WIRE_AGENT_SMOKE_OK`. This spawns the real script against a local mock ElevenLabs HTTP server (`ELEVENLABS_API_BASE_URL` override) and proves: the secret, agent, and three tools are created with correct payloads (tool URLs point at the public base, tool auth references the workspace secret rather than a raw token, and the agent prompt carries the AI disclosure with no em dash and confirms SMS is out of scope, not offered); a second run updates instead of duplicating; missing environment variables fail closed and are named in the error; and the real `SERVER_TOOL_TOKEN`/`ELEVENLABS_API_KEY` values never appear in stdout or stderr.

## PATH B: manual console fallback

Use this if PATH A cannot complete against the live API (see its error output) or before automating anything, to understand what gets created.

1. In the ElevenLabs dashboard, create a Conversational AI agent named `tilda-frontdesk`.
2. Set the agent prompt to the same content `src/prompt.ts` (`buildSystemPrompt`) generates for the active client, and the first message to the German phone opening below.
3. Add three custom webhook tools using the shapes below, each with the same bearer token as `SERVER_TOOL_TOKEN`, stored as a workspace secret and referenced by the tool's Authorization header rather than pasted as plain text.
4. Post-call webhook (the step most likely to differ from the automatic script if the API has changed): in the ElevenLabs dashboard, go to the workspace **Webhooks** section, create a webhook named `tilda-post-call` pointing at `POST https://<public-host>/webhook/voice/post-call` with HMAC auth, then open the agent's **Analysis** (or **Webhooks**) tab and enable the post-call transcription webhook, selecting the `tilda-post-call` webhook you just created.
5. Run `npm run voice:contract:smoke` locally to confirm the fields below still match what the code expects; if not, the contract generator (`src/elevenlabs-agent-contract.ts`) is the source of truth, not this document.

You can also print the exact live contract (URLs, auth reminder, required bodies) at any time:

```bash
VOICE_AGENT_PUBLIC_BASE_URL=https://<public-host> SERVER_TOOL_TOKEN=... npx tsx src/elevenlabs-agent-contract.ts
```

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

Minimal body:

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

## Post-call payload shapes

`src/voice-post-call.ts` accepts more than the minimal body above, because real ElevenLabs post-call webhooks nest fields differently depending on configuration. All of the following are read, in order of preference:

- call id: `callId`, `call_id`, `conversationId`, `conversation_id`, `externalCallId`, `external_call_id`, or nested under `data.*`
- phone: `phone`, `caller`, `caller_id`, `from`, or nested under `data.*`
- status: direct `status`/`call_status`, or derived from `outcome`/`result`/`analysis.outcome`/`data.analysis.call_outcome`, or from `callSuccessful`/`data.analysis.call_successful`
- summary: `summary`, `call_summary`, `analysis.summary`, `analysis.transcript_summary`, or the `data.analysis.*` equivalents

A raw `transcript` field is never stored; if present without a summary, a warning is returned so the response makes that explicit. The normalizer also produces a `followUpDraft`: a German WhatsApp follow-up message drafted from the call outcome, always marked `reviewRequired: true` except for a confirmed booking.

Default storage rule:

- store short summary only
- do not store raw audio
- do not store full transcript unless explicitly approved and disclosed
- transcript and recording URLs are dropped by default; set `VOICE_STORE_TRANSCRIPT_URLS=true` / `VOICE_STORE_RECORDING_URLS=true` only after that review, per `src/voice-post-call.ts`

## ElevenLabs agent identity

Use the Tilda identity and style files as source of truth:

```text
docs/tilda-identity.md
docs/tilda-voice-style.md
docs/demo-script-hair-salon.md
```

Agent opening:

```text
Hallo, hier ist Tilda von Glanz und Schnitt Berlin. Ich bin die KI-Rezeption und helfe dir gern mit Terminen und Fragen.
```

## In-browser test-call script (German)

Run this once in the ElevenLabs dashboard's browser test-call widget after wiring the agent, before any real telephony number is connected. This exercises the same tool calls a live caller would trigger.

```text
Caller: Hallo, ich hätte gern einen Termin für einen Damenhaarschnitt.
Tilda: [greets, confirms service, calls check_availability, offers two times]
Caller: [picks a time]
Tilda: [asks for the caller's name]
Caller: [gives a name]
Tilda: [calls book_appointment, confirms the booking in one sentence]
Caller: Danke, das passt.
Tilda: [closes warmly, no filler]
```

Timeout budget: each tool call round trip should complete in 5 seconds or less. If a call exceeds that, check the backend logs and the public HTTPS path before blaming the model.

## Evidence Phase 3 needs

Capture all three before declaring the voice channel demo-ready:

1. One real tool-call round trip logged (request + response + latency) from the in-browser test call.
2. The post-call webhook receipt logged on the backend (`POST /webhook/voice/post-call` with a 200 response and a stored `CallOutcome`).
3. The in-browser voice demo itself: a full booking or follow-up conversation, confirmed against `GET /metrics/today` afterward.

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

- [ ] Voice provider selected: ElevenLabs Conversational AI
- [ ] Telephony provider selected: Twilio Voice, Sipgate, Telnyx, Vonage, or Plivo
- [ ] Public HTTPS backend URL exists (`VOICE_AGENT_PUBLIC_BASE_URL`)
- [ ] `SERVER_TOOL_TOKEN` set (Render generates this automatically)
- [ ] `npm run voice:wire-agent` run from the Render shell, or PATH B completed manually
- [ ] Tilda scheduling smoke passed
- [ ] Supabase Postgres smoke passed or explicitly deferred
- [ ] Call recording disabled by default
- [ ] Full transcript storage disabled by default
- [ ] Post-call summary webhook enabled
- [ ] Owner alert path verified
- [ ] German opening reviewed
- [ ] In-browser test-call completed with evidence captured

## Local verification before live provider setup

Run:

```bash
npm run style:guard
npm run typecheck
npm run check
npm run first-test:smoke
npm run server:battletest
npm run voice:smoke
npm run voice:contract:smoke
npm run voice:post-call:smoke
npm run voice:wire-agent:smoke
```

`server:battletest` already exercises:

- bearer protection for tool endpoints
- availability tool
- booking tool
- double-book guard
- voice post-call webhook, including idempotent provider retry handling
- owner alert dry run
- metrics
- privacy export/delete basics

## Live setup blockers

Still needed before a real call can be answered:

- selected voice provider account with `ELEVENLABS_API_KEY` set where the wiring script runs
- telephony number or forwarding setup
- public HTTPS deployment URL (`VOICE_AGENT_PUBLIC_BASE_URL`)
- runtime secrets configured
- Supabase or accepted temporary store decision

## Demo success criteria

A successful first live voice demo means:

1. Caller hears Tilda answer naturally.
2. Caller requests a hair appointment.
3. Tilda checks availability via backend tool.
4. Tilda offers concrete slots.
5. Tilda books or captures follow-up.
6. Scheduling, owner alert, metrics, and post-call summary all update.
7. No customer-facing text or voice sounds like a generic AI bot.
